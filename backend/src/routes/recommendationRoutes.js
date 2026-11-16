import { Router } from 'express';
import { RecommendationController } from '../controllers/recommendationController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = Router();
const controller = new RecommendationController();

// Toàn bộ các API tư vấn nông nghiệp đều yêu cầu đăng nhập
router.use(requireAuth);

// Lấy danh mục cây trồng
router.get('/crops', (req, res) => controller.getCrops(req, res));

// UC-15: Tư vấn liều lượng phân bón NPK
router.get('/fertilizer', (req, res) => controller.getFertilizerAdvice(req, res));

// UC-16: Gợi ý giống cây trồng phù hợp
router.get('/suitable-crops', (req, res) => controller.getSuitableCrops(req, res));

export default router;
