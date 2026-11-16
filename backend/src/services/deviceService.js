import crypto from 'crypto';
import { DeviceRepository } from '../repositories/deviceRepository.js';
import { UserRepository } from '../repositories/userRepository.js';

const DEVICE_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const claimAttemptTracker = new Map();
const activationAttemptTracker = new Map();
const pairAttemptTracker = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PAIRING_WINDOW_MINUTES = 15;

export class DeviceService {
  constructor() {
    this.deviceRepo = new DeviceRepository();
    this.userRepo = new UserRepository();
  }

  /**
   * Sinh API Key ngẫu nhiên và tính mã băm SHA-256
   */
  generateApiKey() {
    const rawKey = 'soil_' + crypto.randomBytes(14).toString('hex'); // Độ dài 33 ký tự gồm tiền tố soil_
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, hash };
  }

  /**
   * Sinh hash giữ chỗ cho trạm chưa được cấp API Key (không thể dùng để gửi số đo)
   */
  generatePendingHash() {
    return 'pending_' + crypto.randomBytes(28).toString('hex'); // Độ dài đúng 64 ký tự
  }

  /**
   * Chuẩn hóa địa chỉ MAC ESP32 về định dạng AA:BB:CC:DD:EE:FF
   */
  normalizeMacAddress(rawMac) {
    const stripped = String(rawMac || '').trim().replace(/[:-]/g, '').toUpperCase();
    if (!/^[0-9A-F]{12}$/.test(stripped)) {
      const err = new Error('Mã phần cứng (MAC ESP32) không hợp lệ. Định dạng đúng gồm 12 ký tự Hex, ví dụ: A4:CF:12:88:9B:01.');
      err.statusCode = 400;
      throw err;
    }
    return stripped.match(/.{2}/g).join(':');
  }

  /**
   * Sinh mã phần cứng duy nhất dạng AGRO-F-XXXXXX hoặc AGRO-H-XXXXXX
   */
  async generateUniqueDeviceCode(type) {
    const prefix = type === 'fixed' ? 'F' : 'H';
    for (let attempt = 0; attempt < 6; attempt++) {
      let suffix = '';
      for (let i = 0; i < 6; i++) {
        suffix += DEVICE_CODE_CHARS[crypto.randomInt(0, DEVICE_CODE_CHARS.length)];
      }
      const code = `AGRO-${prefix}-${suffix}`;
      const existing = await this.deviceRepo.findByCode(code);
      if (!existing) return code;
    }
    throw new Error('Không thể sinh mã thiết bị duy nhất, vui lòng thử lại.');
  }

  /**
   * Sinh mã PIN / Mã kích hoạt 6 chữ số
   */
  generateSixDigitCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  recordAttemptFailure(trackerMap, key, maxAttempts = MAX_ATTEMPTS, lockMs = LOCK_MS) {
    const tracker = trackerMap.get(key) || { attempts: 0, lockUntil: 0 };
    tracker.attempts += 1;
    if (tracker.attempts >= maxAttempts) {
      tracker.lockUntil = Date.now() + lockMs;
      tracker.attempts = 0;
    }
    trackerMap.set(key, tracker);
  }

  assertNotLocked(trackerMap, key, messagePrefix = 'Bạn đã nhập sai mã quá nhiều lần') {
    const tracker = trackerMap.get(key);
    if (tracker && tracker.lockUntil && Date.now() < tracker.lockUntil) {
      const minutesLeft = Math.ceil((tracker.lockUntil - Date.now()) / (60 * 1000));
      const err = new Error(`${messagePrefix}. Vui lòng thử lại sau ${minutesLeft} phút.`);
      err.statusCode = 429;
      throw err;
    }
  }

  // ==============================================================
  // LUỒNG CÁCH B: NÔNG DÂN TẠO TRẠM + MAC -> ADMIN DUYỆT -> KÍCH HOẠT -> AUTO-PAIR
  // ==============================================================

  /**
   * Bước 2: Nông dân tạo trạm thủ công kèm Mã máy (MAC) và gửi yêu cầu Admin duyệt
   */
  async requestDeviceProvisioning({ name, type, hardwareMac, reason = '', currentUser }) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      const err = new Error('Tên trạm đo / khu vườn không được để trống.');
      err.statusCode = 400;
      throw err;
    }
    if (trimmedName.length > 100) {
      const err = new Error('Tên trạm đo tối đa 100 ký tự.');
      err.statusCode = 400;
      throw err;
    }
    if (!['fixed', 'handheld'].includes(type)) {
      const err = new Error("Loại thiết bị chỉ có thể là 'fixed' (cố định) hoặc 'handheld' (cầm tay).");
      err.statusCode = 400;
      throw err;
    }

    const normalizedMac = this.normalizeMacAddress(hardwareMac);
    const trimmedReason = String(reason || '').trim().slice(0, 255);

    const dupName = await this.deviceRepo.findByName(trimmedName, currentUser.id);
    if (dupName) {
      const err = new Error(`Trong vườn của bạn đã có trạm mang tên "${trimmedName}". Vui lòng chọn tên khác.`);
      err.statusCode = 409;
      throw err;
    }

    const existingMacDevice = await this.deviceRepo.findByMac(normalizedMac);
    if (existingMacDevice) {
      const err = new Error(`Mã phần cứng ${normalizedMac} đã tồn tại trên hệ thống.`);
      err.statusCode = 409;
      throw err;
    }

    const pendingMacReq = await this.deviceRepo.findPendingRequestByMac(normalizedMac);
    if (pendingMacReq) {
      const err = new Error(`Mã phần cứng ${normalizedMac} đang có một yêu cầu chờ duyệt khác.`);
      err.statusCode = 409;
      throw err;
    }

    const deviceCode = await this.generateUniqueDeviceCode(type);
    const placeholderHash = this.generatePendingHash();

    const deviceId = await this.deviceRepo.create({
      name: trimmedName,
      type,
      deviceCode,
      hardwareMac: normalizedMac,
      apiKeyHash: placeholderHash,
      ownerId: currentUser.id,
      claimPin: null,
      provisioningStatus: 'pending_approval',
      activationCode: null,
      pairingExpiresAt: null,
      claimedAt: null
    });

    const requestId = await this.deviceRepo.createRequest({
      deviceId,
      userId: currentUser.id,
      requestType: 'new_device',
      hardwareMac: normalizedMac,
      requestedName: trimmedName,
      deviceType: type,
      reason: trimmedReason || 'Đăng ký kích hoạt cảm biến mới vào hệ thống'
    });

    const device = await this.deviceRepo.findPublicById(deviceId, currentUser.role === 'admin');
    const request = await this.deviceRepo.findRequestById(requestId);
    return { device, request };
  }

  /**
   * Nông dân gửi yêu cầu Admin cấp lại Key (hỏng mạch / mất đồng bộ / đổi cảm biến)
   */
  async requestRekey({ deviceId, newHardwareMac = '', reason = '', currentUser }) {
    const device = await this.assertDeviceAccess(deviceId, currentUser);
    if (device.provisioning_status !== 'active') {
      const err = new Error('Chỉ những trạm đang hoạt động mới có thể gửi yêu cầu cấp lại khóa.');
      err.statusCode = 400;
      throw err;
    }

    const existingPending = await this.deviceRepo.findPendingRequestByDeviceId(deviceId);
    if (existingPending) {
      const err = new Error('Trạm này đang có một yêu cầu chờ Admin duyệt. Vui lòng đợi xử lý.');
      err.statusCode = 409;
      throw err;
    }

    const targetMac = String(newHardwareMac || '').trim()
      ? this.normalizeMacAddress(newHardwareMac)
      : device.hardware_mac;

    if (!targetMac) {
      const err = new Error('Vui lòng nhập Mã phần cứng (MAC) của cảm biến để thực hiện ghép nối khóa mới.');
      err.statusCode = 400;
      throw err;
    }

    if (targetMac !== device.hardware_mac) {
      const macConflict = await this.deviceRepo.findByMac(targetMac);
      if (macConflict && macConflict.id !== device.id) {
        const err = new Error(`Mã phần cứng ${targetMac} đang thuộc về trạm đo khác.`);
        err.statusCode = 409;
        throw err;
      }
      const pendingConflict = await this.deviceRepo.findPendingRequestByMac(targetMac, device.id);
      if (pendingConflict) {
        const err = new Error(`Mã phần cứng ${targetMac} đang nằm trong một yêu cầu chờ duyệt khác.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const trimmedReason = String(reason || '').trim().slice(0, 255);
    const requestId = await this.deviceRepo.createRequest({
      deviceId: device.id,
      userId: device.owner_id,
      requestType: 'rekey',
      hardwareMac: targetMac,
      requestedName: device.name,
      deviceType: device.type,
      reason: trimmedReason || 'Yêu cầu cấp lại khóa kết nối cho thiết bị'
    });

    return await this.deviceRepo.findRequestById(requestId);
  }

  /**
   * Lấy danh sách yêu cầu (Admin thấy tất cả; Nông dân chỉ thấy của mình)
   */
  async getRequests({ currentUser, status = null }) {
    const cleanStatus = ['pending', 'approved', 'rejected'].includes(status) ? status : null;
    const userId = currentUser.role === 'admin' ? null : currentUser.id;
    return await this.deviceRepo.findRequests({ userId, status: cleanStatus });
  }

  /**
   * Bước 3: Admin duyệt yêu cầu -> Sinh Mã kích hoạt 6 số & đưa trạm vào trạng thái chờ kích hoạt
   */
  async approveRequest(requestId, { adminNote = '' } = {}) {
    const request = await this.deviceRepo.findRequestById(requestId);
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu cần duyệt.');
      err.statusCode = 404;
      throw err;
    }
    if (request.status !== 'pending') {
      const err = new Error('Yêu cầu này đã được xử lý trước đó.');
      err.statusCode = 409;
      throw err;
    }

    const activationCode = this.generateSixDigitCode();
    const trimmedNote = String(adminNote || '').trim().slice(0, 255) || null;

    const marked = await this.deviceRepo.markRequestApproved({
      requestId,
      activationCode,
      adminNote: trimmedNote
    });
    if (!marked) {
      const err = new Error('Yêu cầu vừa được xử lý bởi thao tác khác.');
      err.statusCode = 409;
      throw err;
    }

    const placeholderHash = this.generatePendingHash();
    await this.deviceRepo.prepareDeviceForActivation({
      deviceId: request.device_id,
      hardwareMac: request.hardware_mac,
      placeholderHash,
      activationCode
    });

    const device = await this.deviceRepo.findPublicById(request.device_id, true);
    const updatedRequest = await this.deviceRepo.findRequestById(requestId);

    return {
      request: updatedRequest,
      device,
      activationCode
    };
  }

  /**
   * Admin từ chối yêu cầu
   */
  async rejectRequest(requestId, { adminNote = '' } = {}) {
    const request = await this.deviceRepo.findRequestById(requestId);
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu cần từ chối.');
      err.statusCode = 404;
      throw err;
    }
    if (request.status !== 'pending') {
      const err = new Error('Yêu cầu này đã được xử lý trước đó.');
      err.statusCode = 409;
      throw err;
    }

    const trimmedNote = String(adminNote || '').trim().slice(0, 255) || 'Thông tin thiết bị chưa hợp lệ';
    await this.deviceRepo.markRequestRejected({ requestId, adminNote: trimmedNote });

    if (request.request_type === 'new_device' && request.device_id) {
      await this.deviceRepo.markDeviceRejected(request.device_id);
    }

    return await this.deviceRepo.findRequestById(requestId);
  }

  /**
   * Hủy yêu cầu đang chờ duyệt hoặc xóa trạm bị từ chối
   */
  async cancelRequest(requestId, currentUser) {
    const request = await this.deviceRepo.findRequestById(requestId);
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu.');
      err.statusCode = 404;
      throw err;
    }
    if (currentUser.role !== 'admin' && request.user_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền thao tác trên yêu cầu này.');
      err.statusCode = 403;
      throw err;
    }

    if (request.request_type === 'new_device' && request.device_id) {
      const device = await this.deviceRepo.findById(request.device_id);
      if (device && ['pending_approval', 'rejected'].includes(device.provisioning_status)) {
        await this.deviceRepo.delete(device.id);
        return { deletedDevice: true };
      }
      if (request.status !== 'pending') {
        const err = new Error('Không thể xóa yêu cầu của thiết bị đã được duyệt.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (request.request_type === 'rekey' && request.status !== 'pending') {
      const err = new Error('Chỉ có thể hủy yêu cầu cấp lại khóa đang ở trạng thái chờ duyệt.');
      err.statusCode = 400;
      throw err;
    }

    await this.deviceRepo.deleteRequestById(requestId);
    return { deletedDevice: false };
  }

  /**
   * Bước 4: Nông dân nhập Mã kích hoạt Admin gửi để mở cổng ghép nối tự động cho cảm biến
   */
  async activateDeviceWithCode(deviceId, activationCode, currentUser) {
    this.assertNotLocked(
      activationAttemptTracker,
      `${currentUser.id}:${deviceId}`,
      'Bạn đã nhập sai mã kích hoạt quá nhiều lần'
    );

    const device = await this.assertDeviceAccess(deviceId, currentUser);
    if (device.provisioning_status !== 'awaiting_activation') {
      const err = new Error('Thiết bị này hiện không ở trạng thái chờ nhập mã kích hoạt.');
      err.statusCode = 400;
      throw err;
    }

    const cleanCode = String(activationCode || '').trim();
    if (!cleanCode) {
      const err = new Error('Vui lòng nhập Mã kích hoạt 6 chữ số do Quản trị viên cấp.');
      err.statusCode = 400;
      throw err;
    }

    if (!device.activation_code || device.activation_code !== cleanCode) {
      this.recordAttemptFailure(activationAttemptTracker, `${currentUser.id}:${deviceId}`);
      const err = new Error('Mã kích hoạt không chính xác. Trạm vẫn bị khóa, vui lòng kiểm tra lại mã Admin đã gửi.');
      err.statusCode = 400;
      throw err;
    }

    const expiresAt = new Date(Date.now() + PAIRING_WINDOW_MINUTES * 60 * 1000);
    const opened = await this.deviceRepo.openPairingWindow({ deviceId, expiresAt });
    if (!opened) {
      const err = new Error('Không thể mở cổng ghép nối lúc này, vui lòng thử lại.');
      err.statusCode = 409;
      throw err;
    }

    activationAttemptTracker.delete(`${currentUser.id}:${deviceId}`);
    return await this.deviceRepo.findPublicById(deviceId, currentUser.role === 'admin');
  }

  /**
   * Gia hạn cửa sổ ghép nối thêm 15 phút khi đang ở pairing_open
   */
  async reopenPairingWindow(deviceId, currentUser) {
    const device = await this.assertDeviceAccess(deviceId, currentUser);
    if (device.provisioning_status !== 'pairing_open') {
      const err = new Error('Trạm chỉ có thể gia hạn khi đang trong trạng thái chờ ghép nối phần cứng.');
      err.statusCode = 400;
      throw err;
    }
    const expiresAt = new Date(Date.now() + PAIRING_WINDOW_MINUTES * 60 * 1000);
    await this.deviceRepo.reopenPairingWindow({ deviceId, expiresAt });
    return await this.deviceRepo.findPublicById(deviceId, currentUser.role === 'admin');
  }

  /**
   * Bước 5 (ESP32 / Simulator gọi): Cảm biến gửi MAC lên để tự động nhận API Key đúng 1 lần
   */
  async pairHardwareDevice({ hardwareMac }) {
    const normalizedMac = this.normalizeMacAddress(hardwareMac);
    this.assertNotLocked(
      pairAttemptTracker,
      normalizedMac,
      'Thiết bị gửi yêu cầu ghép nối không hợp lệ quá nhiều lần'
    );

    const device = await this.deviceRepo.findByMac(normalizedMac);
    if (!device) {
      this.recordAttemptFailure(pairAttemptTracker, normalizedMac, 15, 5 * 60 * 1000);
      const err = new Error(`Không tìm thấy trạm nào đăng ký với mã phần cứng ${normalizedMac}.`);
      err.statusCode = 404;
      throw err;
    }

    if (device.provisioning_status === 'pending_approval') {
      const err = new Error('Trạm này đang chờ Quản trị viên duyệt trên Web.');
      err.statusCode = 403;
      throw err;
    }
    if (device.provisioning_status === 'awaiting_activation') {
      const err = new Error('Nông dân chưa nhập Mã kích hoạt trên Web để mở cổng ghép nối.');
      err.statusCode = 403;
      throw err;
    }
    if (device.provisioning_status === 'active') {
      const err = new Error('Thiết bị đã ghép nối trước đó. Để cấp lại khóa mới, vui lòng gửi yêu cầu tới Quản trị viên.');
      err.statusCode = 409;
      throw err;
    }
    if (device.provisioning_status !== 'pairing_open') {
      const err = new Error('Thiết bị chưa sẵn sàng ghép nối.');
      err.statusCode = 403;
      throw err;
    }

    if (!device.pairing_expires_at || new Date(device.pairing_expires_at).getTime() < Date.now()) {
      const err = new Error('Cửa sổ ghép nối đã hết hạn. Vui lòng bấm "Gia hạn ghép nối" trên giao diện Web.');
      err.statusCode = 410;
      throw err;
    }

    const { rawKey, hash } = this.generateApiKey();
    const completed = await this.deviceRepo.completeHardwarePairing({
      deviceId: device.id,
      apiKeyHash: hash
    });

    if (!completed) {
      const err = new Error('Thiết bị vừa hoàn tất ghép nối ở một yêu cầu khác.');
      err.statusCode = 409;
      throw err;
    }

    pairAttemptTracker.delete(normalizedMac);
    return {
      deviceId: device.id,
      deviceCode: device.device_code,
      deviceName: device.name,
      deviceType: device.type,
      hardwareMac: normalizedMac,
      apiKey: rawKey
    };
  }

  // ==============================================================
  // LUỒNG ADMIN XUẤT XƯỞNG TRỰC TIẾP / KHO (GIỮ TƯƠNG THÍCH)
  // ==============================================================

  /**
   * UC-03 (Admin): Xuất xưởng thiết bị mới (lưu kho chờ kích hoạt hoặc gán thẳng cho chủ vườn)
   */
  async registerDevice({ name, type, ownerId = null, hardwareMac = '' }) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('Tên thiết bị không được để trống.');
    }
    if (trimmedName.length > 100) {
      throw new Error('Tên thiết bị tối đa 100 ký tự.');
    }
    if (!['fixed', 'handheld'].includes(type)) {
      throw new Error("Loại thiết bị chỉ có thể là 'fixed' (cố định) hoặc 'handheld' (cầm tay).");
    }

    const resolvedOwnerId = ownerId === null || ownerId === undefined || ownerId === ''
      ? null
      : Number(ownerId);

    if (resolvedOwnerId !== null) {
      if (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0) {
        throw new Error('Tài khoản chủ sở hữu không hợp lệ.');
      }
      const targetUser = await this.userRepo.findById(resolvedOwnerId);
      if (!targetUser) {
        const err = new Error('Không tìm thấy tài khoản người dùng được chỉ định.');
        err.statusCode = 404;
        throw err;
      }
    }

    const normalizedMac = String(hardwareMac || '').trim()
      ? this.normalizeMacAddress(hardwareMac)
      : null;

    if (normalizedMac) {
      const macExists = await this.deviceRepo.findByMac(normalizedMac);
      if (macExists) {
        const err = new Error(`Mã phần cứng ${normalizedMac} đã tồn tại trên hệ thống.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Kiểm tra trùng tên trong cùng phạm vi sở hữu (hoặc cùng kho)
    const existing = await this.deviceRepo.findByName(trimmedName, resolvedOwnerId);
    if (existing) {
      throw new Error(`Đã tồn tại trạm đo có tên "${trimmedName}". Vui lòng chọn tên khác.`);
    }

    const deviceCode = await this.generateUniqueDeviceCode(type);
    const isStock = resolvedOwnerId === null;
    const claimPin = isStock ? this.generateSixDigitCode() : null;
    const claimedAt = isStock ? null : new Date();
    const { rawKey, hash } = this.generateApiKey();

    const deviceId = await this.deviceRepo.create({
      name: trimmedName,
      type,
      deviceCode,
      hardwareMac: normalizedMac,
      apiKeyHash: hash,
      ownerId: resolvedOwnerId,
      claimPin,
      provisioningStatus: isStock ? 'unclaimed' : 'active',
      claimedAt
    });

    const createdDevice = await this.deviceRepo.findPublicById(deviceId, true);

    return {
      device: createdDevice,
      deviceCode,
      hardwareMac: normalizedMac,
      claimPin,
      apiKey: rawKey
    };
  }

  /**
   * Nông dân kích hoạt thiết bị xuất xưởng sẵn bằng Mã thiết bị + Mã PIN
   */
  async claimDevice({ deviceCode, claimPin, customName = '', currentUser }) {
    this.assertNotLocked(claimAttemptTracker, currentUser.id, 'Bạn đã nhập sai mã kích hoạt quá nhiều lần');

    const cleanCode = String(deviceCode || '').trim().toUpperCase();
    const cleanPin = String(claimPin || '').trim();
    const trimmedCustomName = String(customName || '').trim();

    if (!cleanCode) {
      const err = new Error('Vui lòng nhập Mã thiết bị.');
      err.statusCode = 400;
      throw err;
    }
    if (!cleanPin) {
      const err = new Error('Vui lòng nhập Mã PIN kích hoạt 6 chữ số.');
      err.statusCode = 400;
      throw err;
    }
    if (trimmedCustomName.length > 100) {
      const err = new Error('Tên khu vườn / trạm đo tối đa 100 ký tự.');
      err.statusCode = 400;
      throw err;
    }

    const device = await this.deviceRepo.findByCode(cleanCode);
    if (!device) {
      this.recordAttemptFailure(claimAttemptTracker, currentUser.id);
      const err = new Error('Không tìm thấy thiết bị với mã này.');
      err.statusCode = 404;
      throw err;
    }

    if (device.owner_id === currentUser.id) {
      const err = new Error('Trạm đo này đã nằm trong danh sách quản lý của bạn.');
      err.statusCode = 400;
      throw err;
    }

    if (device.owner_id !== null) {
      const err = new Error('Thiết bị này đã được liên kết với một tài khoản khác.');
      err.statusCode = 409;
      throw err;
    }

    if (!device.claim_pin || device.claim_pin !== cleanPin) {
      this.recordAttemptFailure(claimAttemptTracker, currentUser.id);
      const err = new Error('Mã PIN kích hoạt không chính xác.');
      err.statusCode = 400;
      throw err;
    }

    let finalName = trimmedCustomName || device.name;
    const duplicateName = await this.deviceRepo.findByName(finalName, currentUser.id, device.id);
    if (duplicateName) {
      if (trimmedCustomName) {
        const err = new Error(`Trong vườn của bạn đã có trạm mang tên "${finalName}". Vui lòng chọn tên khác.`);
        err.statusCode = 409;
        throw err;
      }
      finalName = `${device.name} (${device.device_code})`;
    }

    const claimed = await this.deviceRepo.claimDevice({
      id: device.id,
      ownerId: currentUser.id,
      name: finalName
    });

    if (!claimed) {
      const err = new Error('Thiết bị vừa được kích hoạt bởi một yêu cầu khác.');
      err.statusCode = 409;
      throw err;
    }

    claimAttemptTracker.delete(currentUser.id);
    return await this.deviceRepo.findPublicById(device.id, currentUser.role === 'admin');
  }

  /**
   * Hủy liên kết trạm khỏi tài khoản hiện tại để chuyển nhượng
   */
  async unclaimDevice(deviceId, currentUser) {
    const device = await this.assertDeviceAccess(deviceId, currentUser);
    if (device.owner_id === null) {
      const err = new Error('Thiết bị này hiện chưa được liên kết với tài khoản nào.');
      err.statusCode = 400;
      throw err;
    }
    if (['pending_approval', 'rejected'].includes(device.provisioning_status)) {
      const err = new Error('Trạm đang chờ duyệt hoặc đã bị từ chối. Bạn có thể hủy yêu cầu thay vì gỡ trạm.');
      err.statusCode = 400;
      throw err;
    }

    const newClaimPin = this.generateSixDigitCode();
    await this.deviceRepo.releaseDevice({ id: deviceId, newClaimPin });

    return {
      deviceId,
      deviceName: device.name,
      deviceCode: device.device_code,
      newClaimPin
    };
  }

  /**
   * Admin gán trực tiếp trạm cho người dùng hoặc thu hồi về kho
   */
  async assignDevice(deviceId, ownerId) {
    const device = await this.deviceRepo.findById(deviceId);
    if (!device) {
      const err = new Error('Không tìm thấy thiết bị yêu cầu.');
      err.statusCode = 404;
      throw err;
    }

    const resolvedOwnerId = ownerId === null || ownerId === undefined || ownerId === ''
      ? null
      : Number(ownerId);

    if (resolvedOwnerId === null) {
      const newClaimPin = this.generateSixDigitCode();
      await this.deviceRepo.releaseDevice({ id: deviceId, newClaimPin });
      return {
        device: await this.deviceRepo.findPublicById(deviceId, true),
        newClaimPin
      };
    }

    if (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0) {
      const err = new Error('Tài khoản chủ sở hữu không hợp lệ.');
      err.statusCode = 400;
      throw err;
    }

    const targetUser = await this.userRepo.findById(resolvedOwnerId);
    if (!targetUser) {
      const err = new Error('Không tìm thấy người dùng được chọn.');
      err.statusCode = 404;
      throw err;
    }

    const duplicate = await this.deviceRepo.findByName(device.name, resolvedOwnerId, deviceId);
    if (duplicate) {
      const err = new Error(`Tài khoản "${targetUser.full_name}" đã có trạm đo mang tên "${device.name}". Vui lòng đổi tên trước khi bàn giao.`);
      err.statusCode = 409;
      throw err;
    }

    await this.deviceRepo.assignDevice({ id: deviceId, ownerId: resolvedOwnerId });
    return {
      device: await this.deviceRepo.findPublicById(deviceId, true),
      newClaimPin: null
    };
  }

  /**
   * Đổi tên trạm đo (Chủ sở hữu hoặc Admin)
   */
  async renameDevice(deviceId, newName, currentUser) {
    const device = await this.assertDeviceAccess(deviceId, currentUser);
    const trimmed = String(newName || '').trim();
    if (!trimmed) {
      const err = new Error('Tên trạm đo không được để trống.');
      err.statusCode = 400;
      throw err;
    }
    if (trimmed.length > 100) {
      const err = new Error('Tên trạm đo tối đa 100 ký tự.');
      err.statusCode = 400;
      throw err;
    }

    const duplicate = await this.deviceRepo.findByName(trimmed, device.owner_id, deviceId);
    if (duplicate) {
      const err = new Error(`Đã có trạm đo mang tên "${trimmed}" trong danh sách này.`);
      err.statusCode = 409;
      throw err;
    }

    await this.deviceRepo.renameDevice({ id: deviceId, name: trimmed });
    return await this.deviceRepo.findPublicById(deviceId, currentUser?.role === 'admin');
  }

  /**
   * Lấy danh sách trạm đo
   */
  async getAllDevices(ownerId = null, includeAdminFields = false) {
    return await this.deviceRepo.findAll(ownerId, includeAdminFields);
  }

  /**
   * Lấy thông tin thiết bị và kiểm tra quyền truy cập của người dùng
   */
  async assertDeviceAccess(deviceId, currentUser) {
    const device = await this.deviceRepo.findById(deviceId);
    if (!device) {
      const err = new Error('Không tìm thấy thiết bị yêu cầu.');
      err.statusCode = 404;
      throw err;
    }
    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền thao tác trên trạm đo này.');
      err.statusCode = 403;
      throw err;
    }
    return device;
  }

  /**
   * UC-04 (Admin): Cấp lại API Key trực tiếp
   */
  async regenerateApiKey(deviceId, currentUser = null) {
    const device = await this.assertDeviceAccess(deviceId, currentUser);

    const { rawKey, hash } = this.generateApiKey();
    await this.deviceRepo.updateApiKeyHash(deviceId, hash);

    return {
      deviceId,
      deviceName: device.name,
      deviceCode: device.device_code,
      newApiKey: rawKey
    };
  }

  /**
   * Bật/Tắt trạng thái hoạt động của thiết bị
   */
  async toggleStatus(deviceId, isActive, currentUser = null) {
    await this.assertDeviceAccess(deviceId, currentUser);
    await this.deviceRepo.toggleActive(deviceId, isActive);
    return { success: true, is_active: isActive };
  }

  /**
   * Xóa vĩnh viễn thiết bị (Admin)
   */
  async deleteDevice(deviceId, currentUser = null) {
    await this.assertDeviceAccess(deviceId, currentUser);
    await this.deviceRepo.delete(deviceId);
    return { success: true };
  }
}
