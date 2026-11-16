import { AuthService } from '../services/authService.js';
import { UserRepository } from '../repositories/userRepository.js';

const authService = new AuthService();
const userRepo = new UserRepository();

export class AuthController {
  /**
   * POST /api/auth/register
   * UC-01: Đăng ký tài khoản
   */
  async register(req, res) {
    try {
      const { email, password, confirmPassword, fullName } = req.body;
      const user = await authService.register({
        email,
        password,
        confirmPassword,
        fullName
      });

      return res.status(201).json({
        success: true,
        message: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.',
        data: user
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
   * POST /api/auth/login
   * UC-02: Đăng nhập hệ thống
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });

      return res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công!',
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
   * GET /api/auth/me
   * Lấy thông tin tài khoản hiện tại từ Token
   */
  async getProfile(req, res) {
    try {
      const user = await userRepo.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thông tin tài khoản.'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          isActive: Boolean(user.is_active)
        }
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }
}
