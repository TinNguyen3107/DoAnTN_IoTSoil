import { SystemConfigService } from '../services/systemConfigService.js';

const configService = new SystemConfigService();

export class SystemConfigController {
  /**
   * GET /api/system-configs
   */
  async getAll(req, res) {
    try {
      const data = await configService.getConfigs();
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
   * PUT /api/system-configs
   * Chỉ Quản trị viên mới được phép cập nhật tham số hệ thống
   */
  async update(req, res) {
    try {
      const updates = req.body;
      const data = await configService.updateConfigs(updates);
      return res.status(200).json({
        success: true,
        message: 'Đã lưu cấu hình tham số nông học vào cơ sở dữ liệu thành công!',
        data
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}
