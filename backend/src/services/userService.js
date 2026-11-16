import { UserRepository } from '../repositories/userRepository.js';

export class UserService {
  constructor() {
    this.userRepo = new UserRepository();
  }

  /**
   * UC-17 Step 4: Lấy danh sách toàn bộ người dùng kèm số lượng trạm đo sở hữu
   */
  async getAllUsers() {
    const users = await this.userRepo.findAll();
    return users.map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role === 'user' ? 'farmer' : u.role, // Chuẩn hóa 'user' thành 'farmer'
      isActive: Boolean(u.is_active),
      devicesCount: Number(u.devices_count || 0),
      createdAt: u.created_at
    }));
  }

  /**
   * UC-17 Step 9: Khóa hoặc kích hoạt lại tài khoản
   */
  async toggleUserStatus({ targetUserId, isActive, adminUser }) {
    const targetId = Number(targetUserId);

    // UC-17 Alt 9a: Không cho phép Admin tự khóa tài khoản của chính mình
    if (targetId === adminUser.id && !isActive) {
      const err = new Error('Quy tắc an toàn: Quản trị viên không thể tự khóa tài khoản của chính mình.');
      err.statusCode = 400;
      throw err;
    }

    const target = await this.userRepo.findById(targetId);
    if (!target) {
      const err = new Error('Tài khoản người dùng không tồn tại.');
      err.statusCode = 404;
      throw err;
    }

    await this.userRepo.updateStatus(targetId, isActive);

    return {
      id: targetId,
      email: target.email,
      fullName: target.full_name,
      isActive: Boolean(isActive)
    };
  }

  /**
   * UC-18 Step 7: Phân quyền vai trò người dùng (Admin / Farmer)
   */
  async updateUserRole({ targetUserId, newRole, adminUser }) {
    const targetId = Number(targetUserId);

    // UC-18 Alt 7a: Kiểm tra vai trò hợp lệ
    const validRoles = ['admin', 'farmer', 'user'];
    if (!validRoles.includes(newRole)) {
      const err = new Error(`Vai trò "${newRole}" không hợp lệ. Hệ thống chỉ hỗ trợ "admin" hoặc "farmer".`);
      err.statusCode = 400;
      throw err;
    }

    const normalizedRole = newRole === 'farmer' ? 'user' : newRole;

    const target = await this.userRepo.findById(targetId);
    if (!target) {
      const err = new Error('Tài khoản người dùng không tồn tại.');
      err.statusCode = 404;
      throw err;
    }

    // Nếu Admin tự hạ quyền của chính mình, phải kiểm tra còn Admin khác không
    if (targetId === adminUser.id && normalizedRole !== 'admin') {
      const allUsers = await this.userRepo.findAll();
      const otherAdmins = allUsers.filter(u => u.role === 'admin' && u.id !== adminUser.id && u.is_active);
      if (otherAdmins.length === 0) {
        const err = new Error('Thao tác bị từ chối: Bạn là Quản trị viên duy nhất còn hoạt động. Cần chỉ định một Quản trị viên khác trước khi rời quyền.');
        err.statusCode = 400;
        throw err;
      }
    }

    await this.userRepo.updateRole(targetId, normalizedRole);

    return {
      id: targetId,
      email: target.email,
      fullName: target.full_name,
      role: normalizedRole === 'user' ? 'farmer' : normalizedRole
    };
  }
}
