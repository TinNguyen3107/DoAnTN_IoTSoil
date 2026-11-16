import { Router } from 'express';
import { ReadingController } from '../controllers/readingController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new ReadingController();

// Route tiếp nhận dữ liệu từ cảm biến IoT (UC-06 / UC-07)
router.post('/ingest', (req, res) => controller.ingest(req, res));

// Route lấy số đo mới nhất
router.get('/latest', requireAuth, (req, res) => controller.getLatest(req, res));

// Route lấy các số đo gần đây của thiết bị
router.get('/device/:deviceId/recent', requireAuth, (req, res) => controller.getRecent(req, res));

// UC-10: Tra cứu lịch sử biến thiên kết hợp sự kiện canh tác
router.get('/history', requireAuth, (req, res) => controller.getHistory(req, res));

// UC-11: Xuất báo cáo dữ liệu định dạng CSV (UTF-8 BOM)
router.get('/export-csv', requireAuth, (req, res) => controller.exportCsv(req, res));

export default router;
