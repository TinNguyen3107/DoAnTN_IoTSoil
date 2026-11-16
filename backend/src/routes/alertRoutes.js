import { Router } from 'express';
import { AlertController } from '../controllers/alertController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new AlertController();

// UC-12: Lấy danh sách cảnh báo
router.get('/', authenticateToken, (req, res) => controller.getAll(req, res));

// UC-12: Đếm số lượng chưa xử lý (chuông thông báo)
router.get('/unread-count', authenticateToken, (req, res) => controller.getUnreadCount(req, res));

// UC-13: Xử lý một cảnh báo
router.patch('/:id/resolve', authenticateToken, (req, res) => controller.resolveOne(req, res));

// UC-13 Step 1a: Xử lý tất cả cảnh báo
router.patch('/resolve-all', authenticateToken, (req, res) => controller.resolveAll(req, res));

export default router;
