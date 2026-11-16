import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new AuthController();

// UC-01: Đăng ký tài khoản
router.post('/register', (req, res) => controller.register(req, res));

// UC-02: Đăng nhập hệ thống
router.post('/login', (req, res) => controller.login(req, res));

// Lấy thông tin tài khoản hiện tại (yêu cầu JWT)
router.get('/me', authenticateToken, (req, res) => controller.getProfile(req, res));

export default router;
