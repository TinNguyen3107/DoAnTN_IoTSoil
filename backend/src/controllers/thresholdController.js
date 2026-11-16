import { ThresholdService } from '../services/thresholdService.js';

const thresholdService = new ThresholdService();

export class ThresholdController {
  /**
   * GET /api/thresholds
   * Lấy danh sách ngưỡng cảnh báo đang áp dụng (UC-05 Step 2, 3)
   */
  async getAll(req, res) {
    try {
      // Mọi quản trị viên đều cấu hình bộ ngưỡng chuẩn chung (ownerId = 1)
      const data = await thresholdService.getThresholds(1);

      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/thresholds/defaults
   * Lấy cấu hình ngưỡng chuẩn Việt Nam (UC-05 Step 4a)
   */
  async getDefaults(req, res) {
    try {
      const data = thresholdService.getDefaultStandards();
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PUT /api/thresholds
   * Cập nhật dải ngưỡng mới vào CSDL (UC-05 Step 7, 8, 9)
   */
  async update(req, res) {
    try {
      const { thresholds } = req.body;

      const updated = await thresholdService.updateThresholds(thresholds, 1);

      return res.status(200).json({
        success: true,
        message: 'Dải ngưỡng cảnh báo mới đã được cập nhật thành công và có hiệu lực tức thời cho các chu trình đo tiếp theo.',
        data: updated
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
