import { DeviceService } from '../services/deviceService.js';

const deviceService = new DeviceService();

export class DeviceController {
  /**
   * GET /api/devices
   */
  async getAll(req, res) {
    try {
      const isAdmin = req.user?.role === 'admin';
      const ownerId = isAdmin
        ? (req.query.ownerId ? Number(req.query.ownerId) : null)
        : req.user?.id;
      const devices = await deviceService.getAllDevices(ownerId, isAdmin);
      return res.status(200).json({
        success: true,
        data: devices
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/devices/requests
   */
  async getRequests(req, res) {
    try {
      const requests = await deviceService.getRequests({
        currentUser: req.user,
        status: req.query.status || null
      });
      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/request
   * Nông dân tạo trạm thủ công kèm Mã phần cứng (MAC) và gửi yêu cầu Admin duyệt
   */
  async requestProvisioning(req, res) {
    try {
      const { name, type, hardwareMac, reason } = req.body || {};
      const result = await deviceService.requestDeviceProvisioning({
        name,
        type,
        hardwareMac,
        reason,
        currentUser: req.user
      });

      return res.status(201).json({
        success: true,
        message: `Đã gửi yêu cầu kích hoạt trạm "${result.device.name}". Vui lòng chờ Quản trị viên duyệt và cấp mã.`,
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/:id/request-rekey
   * Nông dân gửi yêu cầu Admin cấp lại Key cho trạm đang dùng
   */
  async requestRekey(req, res) {
    try {
      const { id } = req.params;
      const { newHardwareMac, reason } = req.body || {};
      const request = await deviceService.requestRekey({
        deviceId: Number(id),
        newHardwareMac,
        reason,
        currentUser: req.user
      });

      return res.status(201).json({
        success: true,
        message: 'Đã gửi yêu cầu cấp lại khóa tới Quản trị viên. Khóa cũ vẫn giữ nguyên cho đến khi Admin duyệt.',
        data: request
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/requests/:requestId/approve (Admin only)
   */
  async approveRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { adminNote } = req.body || {};
      const result = await deviceService.approveRequest(Number(requestId), { adminNote });

      return res.status(200).json({
        success: true,
        message: `Đã duyệt yêu cầu! Mã kích hoạt (${result.activationCode}) đã được gửi về tài khoản nông dân.`,
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/requests/:requestId/reject (Admin only)
   */
  async rejectRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { adminNote } = req.body || {};
      const result = await deviceService.rejectRequest(Number(requestId), { adminNote });

      return res.status(200).json({
        success: true,
        message: 'Đã từ chối yêu cầu.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * DELETE /api/devices/requests/:requestId
   */
  async cancelRequest(req, res) {
    try {
      const { requestId } = req.params;
      const result = await deviceService.cancelRequest(Number(requestId), req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã hủy / xóa yêu cầu thành công.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/:id/activate
   * Nông dân nhập Mã kích hoạt Admin gửi để mở cổng ghép nối tự động cho cảm biến
   */
  async activate(req, res) {
    try {
      const { id } = req.params;
      const { activationCode } = req.body || {};
      const device = await deviceService.activateDeviceWithCode(Number(id), activationCode, req.user);

      return res.status(200).json({
        success: true,
        message: `Đã kích hoạt trạm "${device.name}"! Cổng ghép nối tự động qua MAC đang mở trong 15 phút.`,
        data: device
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/:id/reopen-pairing
   */
  async reopenPairing(req, res) {
    try {
      const { id } = req.params;
      const device = await deviceService.reopenPairingWindow(Number(id), req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã gia hạn cửa sổ ghép nối phần cứng thêm 15 phút.',
        data: device
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/pair (Public cho phần cứng ESP32 / Simulator)
   * Cảm biến gửi MAC lên để tự động nhận API Key đúng 1 lần khi cổng ghép nối đang mở
   */
  async pair(req, res) {
    try {
      const { mac, hardwareMac } = req.body || {};
      const result = await deviceService.pairHardwareDevice({
        hardwareMac: hardwareMac || mac
      });

      return res.status(200).json({
        success: true,
        message: 'Ghép nối phần cứng thành công! Thiết bị đã nhận API Key.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices (Admin only)
   * Xuất xưởng trạm đo mới
   */
  async create(req, res) {
    try {
      const { name, type, ownerId, hardwareMac } = req.body || {};
      const resolvedOwnerId = ownerId === null || ownerId === undefined || ownerId === ''
        ? null
        : Number(ownerId);

      const result = await deviceService.registerDevice({
        name,
        type,
        ownerId: resolvedOwnerId,
        hardwareMac
      });

      return res.status(201).json({
        success: true,
        message: 'Đã xuất xưởng trạm đo mới thành công!',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/claim
   */
  async claim(req, res) {
    try {
      const { deviceCode, claimPin, customName } = req.body || {};
      const claimed = await deviceService.claimDevice({
        deviceCode,
        claimPin,
        customName,
        currentUser: req.user
      });

      return res.status(200).json({
        success: true,
        message: `Đã kích hoạt thành công trạm "${claimed.name}" vào vườn của bạn.`,
        data: claimed
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/:id/unclaim
   */
  async unclaim(req, res) {
    try {
      const { id } = req.params;
      const result = await deviceService.unclaimDevice(Number(id), req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã gỡ liên kết thiết bị thành công.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PATCH /api/devices/:id/assign (Admin only)
   */
  async assign(req, res) {
    try {
      const { id } = req.params;
      const { ownerId } = req.body || {};
      const result = await deviceService.assignDevice(Number(id), ownerId);

      return res.status(200).json({
        success: true,
        message: ownerId ? 'Đã bàn giao trạm đo cho tài khoản được chọn.' : 'Đã thu hồi trạm về kho chờ kích hoạt.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PATCH /api/devices/:id/rename
   */
  async rename(req, res) {
    try {
      const { id } = req.params;
      const { name } = req.body || {};
      const updated = await deviceService.renameDevice(Number(id), name, req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã cập nhật tên trạm đo.',
        data: updated
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/devices/:id/regenerate-key (Admin only)
   */
  async regenerateKey(req, res) {
    try {
      const { id } = req.params;
      const result = await deviceService.regenerateApiKey(Number(id), req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã cấp lại API Key mới. Khóa cũ đã bị vô hiệu hóa.',
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PATCH /api/devices/:id/status
   */
  async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const result = await deviceService.toggleStatus(Number(id), isActive, req.user);

      return res.status(200).json({
        success: true,
        message: `Đã ${isActive ? 'kích hoạt' : 'tạm dừng'} nhận dữ liệu từ trạm.`,
        data: result
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * DELETE /api/devices/:id (Admin only)
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      await deviceService.deleteDevice(Number(id), req.user);

      return res.status(200).json({
        success: true,
        message: 'Đã xóa thiết bị khỏi hệ thống.'
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }
}
