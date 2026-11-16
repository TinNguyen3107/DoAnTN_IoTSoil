import { Router } from 'express';
import { UserController } from '../controllers/userController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new UserController();

// Toàn bộ các route quản trị người dùng đều yêu cầu quyền Quản Trị Viên (UC-17 Step 3 & UC-18 Step 3)
router.use(authenticateToken);
router.use(requireAdmin);

// UC-17: Lấy danh sách người dùng kèm số trạm đo sở hữu
router.get('/', (req, res) => controller.list(req, res));

// UC-17: Khóa / Mở khóa tài khoản (Alt 9a: Cấm tự khóa)
router.patch('/:id/status', (req, res) => controller.updateStatus(req, res));

// UC-18: Phân quyền vai trò người dùng (Alt 7a: Kiểm tra vai trò hợp lệ)
router.patch('/:id/role', (req, res) => controller.updateRole(req, res));

export default router;
