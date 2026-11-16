import { ReadingService } from '../services/readingService.js';

const readingService = new ReadingService();

export class ReadingController {
  /**
   * POST /api/readings/ingest
   * Cổng tiếp nhận số đo từ thiết bị IoT (ESP32-S3 cố định hoặc Thiết bị cầm tay)
   */
  async ingest(req, res) {
    try {
      // Đọc API Key từ Header 'x-api-key' (chuẩn IoT) hoặc body fallback
      const rawApiKey = req.headers['x-api-key'] || req.body?.api_key;
      const payload = req.body;

      const result = await readingService.ingestReading({
        rawApiKey,
        payload
      });

      return res.status(201).json({
        success: true,
        message: 'Tiếp nhận bản ghi số đo thành công!',
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
   * GET /api/readings/latest?deviceId=...
   * Lấy bản ghi số đo mới nhất của một trạm
   */
  async getLatest(req, res) {
    try {
      const { deviceId } = req.query;
      const reading = await readingService.getLatestReading(deviceId, req.user);

      return res.status(200).json({
        success: true,
        data: reading
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/readings/device/:deviceId/recent
   * Lấy danh sách số đo gần đây của trạm
   */
  async getRecent(req, res) {
    try {
      const { deviceId } = req.params;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const readings = await readingService.getRecentReadings(deviceId, limit, req.user);

      return res.status(200).json({
        success: true,
        data: readings
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/readings/history?deviceId=...&fromDate=...&toDate=...
   * UC-10: Tra cứu biểu đồ chuỗi thời gian kết hợp sự kiện bón phân
   */
  async getHistory(req, res) {
    try {
      const { deviceId, fromDate, toDate } = req.query;
      const result = await readingService.getTelemetryHistory({
        deviceId,
        fromDate,
        toDate,
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

  /**
   * GET /api/readings/export-csv?deviceId=...&fromDate=...&toDate=...
   * UC-11: Xuất báo cáo dữ liệu đo lường định dạng CSV (UTF-8 BOM)
   */
  async exportCsv(req, res) {
    try {
      const { deviceId, fromDate, toDate } = req.query;
      const { filename, csvContent, totalRows } = await readingService.generateCsvExport({
        deviceId,
        fromDate,
        toDate,
        currentUser: req.user
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Total-Rows', totalRows);

      const buffer = Buffer.from(csvContent, 'utf8');
      return res.status(200).send(buffer);
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        message: err.message
      });
    }
  }
}
