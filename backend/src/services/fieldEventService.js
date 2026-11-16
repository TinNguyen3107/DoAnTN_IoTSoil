import { FieldEventRepository } from '../repositories/fieldEventRepository.js';
import { DeviceRepository } from '../repositories/deviceRepository.js';

const formatLocalDate = (input) => {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    return input.slice(0, 10);
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export class FieldEventService {
  constructor() {
    this.fieldEventRepo = new FieldEventRepository();
    this.deviceRepo = new DeviceRepository();
  }

  /**
   * UC-14 Step 2 & 3: Lấy danh sách sự kiện canh tác
   */
  async getFieldEvents({ deviceId, currentUser }) {
    const isAdmin = currentUser?.role === 'admin';
    const ownerId = currentUser?.id;

    const events = await this.fieldEventRepo.findAll({
      deviceId: deviceId ? Number(deviceId) : null,
      ownerId,
      isAdmin
    });

    return events.map(e => ({
      id: e.id,
      deviceId: e.device_id,
      deviceName: e.device_name,
      deviceType: e.device_type,
      eventType: e.event_type,
      amount: Number(e.amount),
      unit: e.unit,
      eventDate: formatLocalDate(e.event_date),
      notes: e.notes,
      createdAt: e.created_at
    }));
  }

  /**
   * UC-14 Step 7 & 8: Thêm sự kiện canh tác / bón phân mới
   */
  async createFieldEvent({ deviceId, eventType, amount, unit, eventDate, notes, currentUser }) {
    if (!deviceId) throw new Error('Vui lòng chọn trạm đo / vị trí lô đất áp dụng.');
    if (!eventType || !eventType.trim()) throw new Error('Vui lòng chọn hoặc nhập loại can thiệp canh tác.');
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Liều lượng phân bón / vật tư không hợp lệ (phải là số > 0).');
    }

    if (!unit || !unit.trim()) throw new Error('Vui lòng chọn đơn vị tính (kg/sào, kg/ha, tấn/ha...).');
    if (!eventDate) throw new Error('Vui lòng chọn ngày thực hiện canh tác.');

    // UC-14 Alt 6a: Kiểm tra ngày thực hiện không được ở tương lai (theo ngày địa phương)
    const today = formatLocalDate(new Date());
    if (eventDate > today) {
      const err = new Error('Ngày thực hiện canh tác không hợp lệ: Không được chọn mốc thời gian ở tương lai.');
      err.statusCode = 400;
      throw err;
    }

    // Kiểm tra quyền sở hữu thiết bị
    const device = await this.deviceRepo.findById(Number(deviceId));
    if (!device) throw new Error('Trạm đo được chọn không tồn tại trên hệ thống.');

    if (currentUser?.role !== 'admin' && device.owner_id !== currentUser?.id) {
      const err = new Error('Bạn không có quyền ghi nhận nhật ký cho trạm đo này.');
      err.statusCode = 403;
      throw err;
    }

    const newId = await this.fieldEventRepo.create({
      deviceId: Number(deviceId),
      eventType: eventType.trim(),
      amount: numAmount,
      unit: unit.trim(),
      eventDate,
      notes: notes ? notes.trim() : null
    });

    return {
      id: newId,
      deviceId: Number(deviceId),
      deviceName: device.name,
      eventType: eventType.trim(),
      amount: numAmount,
      unit: unit.trim(),
      eventDate,
      notes: notes ? notes.trim() : null
    };
  }

  /**
   * UC-14 Alt 5a: Xóa bản ghi sự kiện nhập sai
   */
  async deleteFieldEvent(id, currentUser) {
    if (!id) throw new Error('Thiếu mã định danh sự kiện cần xóa.');

    const event = await this.fieldEventRepo.findById(Number(id));
    if (!event) {
      const err = new Error('Sự kiện canh tác không tồn tại hoặc đã bị xóa trước đó.');
      err.statusCode = 404;
      throw err;
    }

    if (currentUser?.role !== 'admin' && event.owner_id !== currentUser?.id) {
      const err = new Error('Bạn không có quyền xóa bản ghi nhật ký này.');
      err.statusCode = 403;
      throw err;
    }

    await this.fieldEventRepo.delete(Number(id));
    return { success: true, message: 'Đã xóa sự kiện canh tác thành công.' };
  }
}
