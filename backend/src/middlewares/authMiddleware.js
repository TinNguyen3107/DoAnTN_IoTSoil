import { AuthService } from '../services/authService.js';
import { UserRepository } from '../repositories/userRepository.js';

const authService = new AuthService();
const userRepo = new UserRepository();

/**
 * Middleware xác thực Token JWT và đồng bộ trạng thái/quyền mới nhất từ CSDL
 */
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Yêu cầu bị từ chối: Chưa đăng nhập hoặc thiếu mã Token xác thực.'
    });
  }

  const decoded = authService.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Mã xác thực JWT không hợp lệ hoặc đã hết thời hạn hiệu lực. Vui lòng đăng nhập lại.'
    });
  }

  try {
    const dbUser = await userRepo.findById(decoded.id);
    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không còn tồn tại trên hệ thống. Vui lòng đăng nhập lại.'
      });
    }
    if (!dbUser.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị Quản trị viên tạm khóa.'
      });
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      role: dbUser.role
    };
    return next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực phiên đăng nhập.'
    });
  }
};

export const requireAuth = authenticateToken;

/**
 * Middleware phân quyền Quản trị viên (Admin only)
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Truy cập bị từ chối: Bạn không có quyền Quản trị viên (Admin) để thực hiện thao tác này.'
    });
  }
  next();
};
