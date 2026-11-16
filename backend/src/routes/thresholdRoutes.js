import { Router } from 'express';
import { ThresholdController } from '../controllers/thresholdController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new ThresholdController();

// Lấy danh sách ngưỡng hiện tại (mọi người dùng đã đăng nhập đều đọc được để tham chiếu)
router.get('/', authenticateToken, (req, res) => controller.getAll(req, res));

// Lấy cấu hình ngưỡng chuẩn Việt Nam (Step 4a)
router.get('/defaults', authenticateToken, requireAdmin, (req, res) => controller.getDefaults(req, res));

// Cập nhật cấu hình ngưỡng mới (Step 7 - Chỉ Quản trị viên)
router.put('/', authenticateToken, requireAdmin, (req, res) => controller.update(req, res));

export default router;
