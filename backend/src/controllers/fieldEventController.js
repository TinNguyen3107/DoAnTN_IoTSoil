import { FieldEventService } from '../services/fieldEventService.js';

const fieldEventService = new FieldEventService();

export class FieldEventController {
  /**
   * GET /api/field-events
   * UC-14 Step 2: Lấy danh sách sự kiện canh tác
   */
  async list(req, res) {
    try {
      const { deviceId } = req.query;
      const events = await fieldEventService.getFieldEvents({
        deviceId,
        currentUser: req.user
      });

      return res.status(200).json({
        success: true,
        data: events
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/field-events
   * UC-14 Step 6, 7, 8, 9: Thêm mới sự kiện canh tác
   */
  async create(req, res) {
    try {
      const { deviceId, eventType, amount, unit, eventDate, notes } = req.body;
      const result = await fieldEventService.createFieldEvent({
        deviceId,
        eventType,
        amount,
        unit,
        eventDate,
        notes,
        currentUser: req.user
      });

      return res.status(201).json({
        success: true,
        message: 'Ghi nhận nhật ký canh tác thành công!',
        data: result
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * DELETE /api/field-events/:id
   * UC-14 Alt 5a: Xóa sự kiện nhập sai
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const result = await fieldEventService.deleteFieldEvent(id, req.user);

      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        message: err.message
      });
    }
  }
}
