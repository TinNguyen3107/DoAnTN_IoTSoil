import { UserService } from '../services/userService.js';

const userService = new UserService();

export class UserController {
  /**
   * GET /api/users
   * UC-17 Step 2 & 4: Lấy danh sách toàn bộ người dùng
   */
  async list(req, res) {
    try {
      const users = await userService.getAllUsers();
      return res.status(200).json({
        success: true,
        data: users
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PATCH /api/users/:id/status
   * UC-17 Step 8: Khóa / Mở khóa tài khoản
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái isActive phải là giá trị boolean (true/false).'
        });
      }

      const result = await userService.toggleUserStatus({
        targetUserId: id,
        isActive,
        adminUser: req.user
      });

      return res.status(200).json({
        success: true,
        message: `Đã ${isActive ? 'kích hoạt' : 'tạm khóa'} tài khoản thành công.`,
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
   * PATCH /api/users/:id/role
   * UC-18 Step 6: Phân quyền vai trò mới
   */
  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp vai trò mới (admin hoặc farmer).'
        });
      }

      const result = await userService.updateUserRole({
        targetUserId: id,
        newRole: role,
        adminUser: req.user
      });

      return res.status(200).json({
        success: true,
        message: `Đã cập nhật vai trò người dùng thành "${result.role === 'admin' ? 'Quản trị viên' : 'Nông dân'}" thành công.`,
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
}
