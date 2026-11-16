import { RecommendationService } from '../services/recommendationService.js';

const recommendationService = new RecommendationService();

export class RecommendationController {
  /**
   * GET /api/recommendations/crops
   * Lấy danh mục tất cả cây trồng
   */
  async getCrops(req, res) {
    try {
      const crops = await recommendationService.getAllCrops();
      return res.status(200).json({
        success: true,
        data: crops
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/recommendations/fertilizer?deviceId=...&cropId=...&area=...&unit=...
   * UC-15: Tư vấn định lượng phân bón NPK thương phẩm
   */
  async getFertilizerAdvice(req, res) {
    try {
      const { deviceId, cropId, area, unit } = req.query;
      const advice = await recommendationService.calculateFertilizerRecommendation({
        deviceId,
        cropId,
        area,
        unit,
        currentUser: req.user
      });

      return res.status(200).json({
        success: true,
        data: advice
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
   * GET /api/recommendations/suitable-crops?deviceId=...
   * UC-16: Gợi ý giống cây trồng phù hợp nhất (Top 3)
   */
  async getSuitableCrops(req, res) {
    try {
      const { deviceId } = req.query;
      const result = await recommendationService.recommendSuitableCrops({
        deviceId,
        currentUser: req.user
      });

      return res.status(200).json({
        success: true,
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
}
