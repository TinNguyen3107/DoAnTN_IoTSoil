import { ThresholdRepository } from '../repositories/thresholdRepository.js';

// Siêu dữ liệu chuẩn nông học của từng thông số
const PARAMETER_METADATA = {
  ph: { name: 'Độ chua (pH)', unit: 'Scale', minBound: 0.0, maxBound: 14.0, defaultLow: 5.5, defaultHigh: 6.5, desc: 'Dải an toàn cho rễ hấp thu dinh dưỡng khoáng' },
  ec: { name: 'Độ dẫn điện (EC)', unit: 'µS/cm', minBound: 0, maxBound: 5000, defaultLow: 300.0, defaultHigh: 800.0, desc: 'Ngưỡng kiểm soát mặn và nồng độ muối hòa tan' },
  n: { name: 'Đạm tổng số (N)', unit: 'mg/kg', minBound: 0, maxBound: 1000, defaultLow: 50.0, defaultHigh: 150.0, desc: 'Quyết định sự phát triển sinh khối thân, cành và lá' },
  p: { name: 'Lân dễ tiêu (P)', unit: 'mg/kg', minBound: 0, maxBound: 1000, defaultLow: 30.0, defaultHigh: 80.0, desc: 'Kích thích phát triển rễ non và mầm hoa' },
  k: { name: 'Kali trao đổi (K)', unit: 'mg/kg', minBound: 0, maxBound: 1000, defaultLow: 80.0, defaultHigh: 200.0, desc: 'Tăng cường sức chống chịu sâu bệnh và nuôi quả chắc hạt' },
  temperature: { name: 'Nhiệt độ đất', unit: '°C', minBound: -20, maxBound: 80, defaultLow: 18.0, defaultHigh: 35.0, desc: 'Nhiệt độ thích hợp cho hệ vi sinh vật đất hoạt động' },
  moisture: { name: 'Độ ẩm đất', unit: '%', minBound: 0, maxBound: 100, defaultLow: 50.0, defaultHigh: 80.0, desc: 'Dung tích ẩm đồng ruộng tối thích' }
};

export class ThresholdService {
  constructor() {
    this.thresholdRepo = new ThresholdRepository();
  }

  /**
   * Lấy danh sách ngưỡng kèm thông tin siêu dữ liệu chuẩn nông học
   */
  async getThresholds(ownerId = 1) {
    const rawList = await this.thresholdRepo.findAll(ownerId);

    // Bổ sung siêu dữ liệu cho từng thông số
    return rawList.map(item => {
      const meta = PARAMETER_METADATA[item.parameter] || {};
      return {
        id: item.id,
        parameter: item.parameter,
        name: meta.name || item.parameter,
        unit: meta.unit || '',
        low_limit: parseFloat(item.low_limit),
        high_limit: parseFloat(item.high_limit),
        description: meta.desc || '',
        updated_at: item.updated_at
      };
    });
  }

  /**
   * Lấy cấu hình ngưỡng mặc định theo chuẩn nông nghiệp Việt Nam (UC-05 Step 4a)
   */
  getDefaultStandards() {
    return Object.entries(PARAMETER_METADATA).map(([param, meta]) => ({
      parameter: param,
      name: meta.name,
      unit: meta.unit,
      low_limit: meta.defaultLow,
      high_limit: meta.defaultHigh,
      description: meta.desc
    }));
  }

  /**
   * UC-05: Cập nhật dải ngưỡng cảnh báo mới
   */
  async updateThresholds(thresholdList, ownerId = 1) {
    if (!Array.isArray(thresholdList) || thresholdList.length === 0) {
      const err = new Error('Danh sách ngưỡng cập nhật không hợp lệ.');
      err.statusCode = 400;
      throw err;
    }

    // Kiểm tra ràng buộc logic nghiêm ngặt theo kịch bản UC-05 Step 6
    for (const item of thresholdList) {
      const { parameter, low_limit, high_limit } = item;
      const meta = PARAMETER_METADATA[parameter];

      if (!meta) {
        const err = new Error(`Thông số "${parameter}" không thuộc danh mục cảm biến của hệ thống.`);
        err.statusCode = 400;
        throw err;
      }

      const numLow = parseFloat(low_limit);
      const numHigh = parseFloat(high_limit);

      if (isNaN(numLow) || isNaN(numHigh)) {
        const err = new Error(`Giá trị ngưỡng của ${meta.name} phải là số hợp lệ.`);
        err.statusCode = 400;
        throw err;
      }

      // Ràng buộc Step 6: Mức tối thiểu phải nhỏ hơn Mức tối đa
      if (numLow >= numHigh) {
        const err = new Error(`Lỗi logic tại thông số "${meta.name}": Ngưỡng tối thiểu (${numLow}) phải nhỏ hơn Ngưỡng tối đa (${numHigh}).`);
        err.statusCode = 400;
        throw err;
      }

      // Ràng buộc giá trị nằm trong thang đo cảm biến
      if (numLow < meta.minBound || numHigh > meta.maxBound) {
        const err = new Error(`Giá trị của "${meta.name}" vượt thang đo vật lý của cảm biến (${meta.minBound} đến ${meta.maxBound} ${meta.unit}).`);
        err.statusCode = 400;
        throw err;
      }

      item.low_limit = numLow;
      item.high_limit = numHigh;
    }

    // Lưu vào MySQL
    await this.thresholdRepo.batchUpdate(thresholdList, ownerId);

    // Trả về danh sách mới sau khi lưu
    return await this.getThresholds(ownerId);
  }
}
