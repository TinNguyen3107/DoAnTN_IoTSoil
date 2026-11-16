import { Router } from 'express';
import { FieldEventController } from '../controllers/fieldEventController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new FieldEventController();

// Toàn bộ các thao tác nhật ký đều yêu cầu người dùng đăng nhập xác thực
router.use(requireAuth);

// UC-14 Step 2: Lấy danh sách sự kiện
router.get('/', (req, res) => controller.list(req, res));

// UC-14 Step 7: Ghi nhận sự kiện canh tác mới
router.post('/', (req, res) => controller.create(req, res));

// UC-14 Alt 5a: Xóa sự kiện nhập sai
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
