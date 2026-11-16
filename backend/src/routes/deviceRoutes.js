import { Router } from 'express';
import { DeviceController } from '../controllers/deviceController.js';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new DeviceController();

// Cổng ghép nối tự động cho phần cứng ESP32 / Simulator (không yêu cầu JWT, chỉ mở khi Nông dân nhập đúng Mã kích hoạt)
router.post('/pair', (req, res) => controller.pair(req, res));

router.use(authenticateToken);

// Luồng yêu cầu cấp trạm & cấp lại khóa (Cách B)
router.get('/requests', (req, res) => controller.getRequests(req, res));
router.post('/request', (req, res) => controller.requestProvisioning(req, res));
router.post('/requests/:requestId/approve', requireAdmin, (req, res) => controller.approveRequest(req, res));
router.post('/requests/:requestId/reject', requireAdmin, (req, res) => controller.rejectRequest(req, res));
router.delete('/requests/:requestId', (req, res) => controller.cancelRequest(req, res));

router.get('/', (req, res) => controller.getAll(req, res));
router.post('/claim', (req, res) => controller.claim(req, res));

router.post('/:id/request-rekey', (req, res) => controller.requestRekey(req, res));
router.post('/:id/activate', (req, res) => controller.activate(req, res));
router.post('/:id/reopen-pairing', (req, res) => controller.reopenPairing(req, res));
router.post('/:id/unclaim', (req, res) => controller.unclaim(req, res));
router.patch('/:id/rename', (req, res) => controller.rename(req, res));
router.patch('/:id/status', (req, res) => controller.toggleStatus(req, res));

// Quyền quản trị viên / kỹ thuật viên phần cứng
router.post('/', requireAdmin, (req, res) => controller.create(req, res));
router.post('/:id/regenerate-key', requireAdmin, (req, res) => controller.regenerateKey(req, res));
router.patch('/:id/assign', requireAdmin, (req, res) => controller.assign(req, res));
router.delete('/:id', requireAdmin, (req, res) => controller.delete(req, res));

export default router;
