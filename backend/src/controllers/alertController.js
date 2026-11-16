import { AlertService } from '../services/alertService.js';

const alertService = new AlertService();

export class AlertController {
  /**
   * GET /api/alerts
   * UC-12: Lấy danh sách cảnh báo
   */
  async getAll(req, res) {
    try {
      const ownerId = req.user?.role === 'admin' ? null : (req.user?.id || 1);
      const deviceId = req.query.deviceId ? Number(req.query.deviceId) : null;
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const alerts = await alertService.getAlerts({
        deviceId,
        unreadOnly,
        ownerId,
        limit
      });

      return res.status(200).json({
        success: true,
        data: alerts
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/alerts/unread-count
   * Lấy số lượng cảnh báo chưa xử lý cho chuông thông báo (UC-12 Step 1)
   */
  async getUnreadCount(req, res) {
    try {
      const ownerId = req.user?.role === 'admin' ? null : (req.user?.id || 1);
      const deviceId = req.query.deviceId ? Number(req.query.deviceId) : null;

      const result = await alertService.getUnreadCount({ ownerId, deviceId });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PATCH /api/alerts/:id/resolve
   * UC-13 Step 1, 2, 3: Xử lý một cảnh báo cụ thể
   */
  async resolveOne(req, res) {
    try {
      const { id } = req.params;
      const { actionTaken } = req.body || {};

      const result = await alertService.resolveAlert(Number(id), actionTaken, req.user);

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

  /**
   * PATCH /api/alerts/resolve-all
   * UC-13 Step 1a, 2, 3: Đánh dấu tất cả cảnh báo là đã đọc / đã xử lý
   */
  async resolveAll(req, res) {
    try {
      const ownerId = req.user?.role === 'admin' ? null : (req.user?.id || 1);
      const deviceId = req.body?.deviceId ? Number(req.body.deviceId) : null;

      const result = await alertService.resolveAllAlerts({ ownerId, deviceId });

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }
}
