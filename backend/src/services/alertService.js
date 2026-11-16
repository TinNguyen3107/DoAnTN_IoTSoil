import { AlertRepository } from '../repositories/alertRepository.js';
import { ThresholdRepository } from '../repositories/thresholdRepository.js';

// Danh mục chẩn đoán nông học cho từng thông số vi phạm
const AGRONOMIC_DIAGNOSES = {
  ph: {
    name: 'Độ chua (pH)',
    unit: '',
    underflow: (val, limit) => `Độ chua đất đạt pH = ${val} (dưới ngưỡng an toàn ${limit}). Đất bị chua phèn, hạn chế rễ hấp thu Lân và vi lượng. Khuyến nghị: Bón bổ sung vôi nông nghiệp Dolomite (300 – 500 kg/ha).`,
    overflow: (val, limit) => `Độ chua đất đạt pH = ${val} (vượt ngưỡng trần ${limit}). Đất bị kiềm hóa, cây dễ bị vàng lá do thiếu sắt và kẽm. Khuyến nghị: Bón phân hữu cơ hoai mục hoặc lưu huỳnh bột để hạ pH.`
  },
  ec: {
    name: 'Độ dẫn điện (EC)',
    unit: 'µS/cm',
    underflow: (val, limit) => `Độ dẫn điện EC = ${val} µS/cm (dưới mức ${limit}). Đất quá nghèo dinh dưỡng tổng số, khả năng giữ phân kém.`,
    overflow: (val, limit) => `Độ dẫn điện EC = ${val} µS/cm (vượt ngưỡng tối đa ${limit}). Đất có dấu hiệu nhiễm mặn hoặc tích tụ muối khoáng do bón phân quá mức. Khuyến nghị: Dẫn nước ngọt thau rửa đất.`
  },
  n: {
    name: 'Đạm tổng số (N)',
    unit: 'mg/kg',
    underflow: (val, limit) => `Hàm lượng Đạm N = ${val} mg/kg (dưới mức khuyến cáo ${limit}). Cây phát triển còi cọc, lá già bị vàng. Khuyến nghị: Bổ sung phân Urê hoặc phân NPK đạm cao.`,
    overflow: (val, limit) => `Hàm lượng Đạm N = ${val} mg/kg (vượt mức an toàn ${limit}). Thừa đạm làm cây vống lá, dễ đổ ngã và mẫn cảm với sâu bệnh. Khuyến nghị: Ngừng bón phân đạm, tăng cường lân và kali.`
  },
  p: {
    name: 'Lân dễ tiêu (P)',
    unit: 'mg/kg',
    underflow: (val, limit) => `Hàm lượng Lân P = ${val} mg/kg (dưới ngưỡng ${limit}). Bộ rễ kém phát triển, chậm phân hóa mầm hoa. Khuyến nghị: Bón bổ sung Supe Lân hoặc phân lân nung chảy.`,
    overflow: (val, limit) => `Hàm lượng Lân P = ${val} mg/kg (vượt ngưỡng trần ${limit}). Dư thừa lân gây ức chế hấp thu kẽm và sắt trong đất.`
  },
  k: {
    name: 'Kali trao đổi (K)',
    unit: 'mg/kg',
    underflow: (val, limit) => `Hàm lượng Kali K = ${val} mg/kg (dưới mức ${limit}). Cây kém cứng cáp, dễ rụng hoa và quả non. Khuyến nghị: Bón bổ sung phân Kali Clorua hoặc Kali Sunfat.`,
    overflow: (val, limit) => `Hàm lượng Kali K = ${val} mg/kg (vượt ngưỡng ${limit}). Nồng độ kali cao ức chế hấp thu Canxi và Magie.`
  },
  temperature: {
    name: 'Nhiệt độ đất',
    unit: '°C',
    underflow: (val, limit) => `Nhiệt độ đất = ${val}°C (dưới mức ${limit}°C). Đất quá lạnh làm chậm quá trình khoáng hóa dinh dưỡng.`,
    overflow: (val, limit) => `Nhiệt độ đất = ${val}°C (vượt mức ${limit}°C). Nhiệt độ tầng rễ quá nóng có nguy cơ làm tổn thương chóp rễ non. Khuyến nghị: Phủ rơm rạ hoặc bạt phủ nông nghiệp giữ mát gốc.`
  },
  moisture: {
    name: 'Độ ẩm đất',
    unit: '%',
    underflow: (val, limit) => `Độ ẩm tầng canh tác = ${val}% (dưới mức tối thiểu ${limit}%). Đất bị khô hạn, cây héo rũ. Khuyến nghị: Kích hoạt hệ thống tưới nhỏ giọt ngay.`,
    overflow: (val, limit) => `Độ ẩm tầng canh tác = ${val}% (vượt mức ${limit}%). Đất bị ngập úng bí khí, rễ thiếu oxy. Khuyến nghị: Khơi thông rãnh thoát nước chống thối rễ.`
  }
};

export class AlertService {
  constructor() {
    this.alertRepo = new AlertRepository();
    this.thresholdRepo = new ThresholdRepository();
  }

  /**
   * Tự động quét số đo đối chiếu dải ngưỡng an toàn và tạo cảnh báo (Hình 3.7.2 Step 8)
   */
  async evaluateReadingAndCreateAlerts({ readingId, deviceId, values, ownerId = 1 }) {
    const activeThresholds = await this.thresholdRepo.findAll(ownerId);
    const generatedAlerts = [];

    for (const th of activeThresholds) {
      const param = th.parameter;
      const val = parseFloat(values[param]);
      if (isNaN(val)) continue;

      const low = parseFloat(th.low_limit);
      const high = parseFloat(th.high_limit);

      let violated = false;
      let limitValue = null;
      let level = 'warning';

      // 1. Kiểm tra dưới ngưỡng tối thiểu (Underflow)
      if (val < low) {
        violated = true;
        limitValue = low;
        // Đánh giá mức độ nghiêm trọng (Danger vs Warning)
        if (param === 'ph' && val < 4.8) level = 'danger'; // Cực chua
        else if (param === 'moisture' && val < low * 0.6) level = 'danger'; // Hạn nặng
        else if (['n', 'p', 'k'].includes(param) && val < low * 0.5) level = 'danger'; // Cạn kiệt dinh dưỡng
      }
      // 2. Kiểm tra vượt ngưỡng tối đa (Overflow)
      else if (val > high) {
        violated = true;
        limitValue = high;
        if (param === 'ec' && val > 1500) level = 'danger'; // Mặn hóa nghiêm trọng
        else if (param === 'ph' && val > 8.0) level = 'danger'; // Kiềm hóa nặng
        else if (param === 'moisture' && val > 90.0) level = 'danger'; // Úng ngập
      }

      // Nếu có vi phạm -> Tạo bản ghi vào bảng alerts
      if (violated) {
        const alertId = await this.alertRepo.create({
          readingId,
          deviceId,
          parameter: param,
          level,
          value: val,
          limitValue
        });

        generatedAlerts.push({
          alertId,
          parameter: param,
          level,
          value: val,
          limitValue
        });
      }
    }

    return generatedAlerts;
  }

  /**
   * UC-12: Lấy danh sách cảnh báo kèm phân tích nông học chi tiết
   */
  async getAlerts({ deviceId = null, unreadOnly = false, ownerId = null, limit = 50 }) {
    const rawAlerts = await this.alertRepo.findAll({ deviceId, unreadOnly, ownerId, limit });

    return rawAlerts.map(a => {
      const diag = AGRONOMIC_DIAGNOSES[a.parameter] || {};
      const isUnderflow = parseFloat(a.value) < parseFloat(a.limit_value);
      const advice = isUnderflow 
        ? diag.underflow?.(a.value, a.limit_value)
        : diag.overflow?.(a.value, a.limit_value);

      return {
        id: a.id,
        readingId: a.reading_id,
        deviceId: a.device_id,
        deviceName: a.device_name,
        deviceType: a.device_type,
        parameter: a.parameter,
        parameterName: diag.name || a.parameter,
        unit: diag.unit || '',
        level: a.level, // 'warning' | 'danger'
        value: parseFloat(a.value),
        limitValue: parseFloat(a.limit_value),
        isRead: Boolean(a.is_read),
        isResolved: Boolean(a.is_resolved),
        actionTaken: a.action_taken,
        resolvedAt: a.resolved_at,
        createdAt: a.created_at,
        diagnosticMessage: advice || `Chỉ số ${a.parameter} vi phạm ngưỡng quy định (${a.value} vs ${a.limit_value})`
      };
    });
  }

  /**
   * Lấy số lượng cảnh báo chưa đọc cho chuông thông báo
   */
  async getUnreadCount({ deviceId = null, ownerId = null } = {}) {
    const count = await this.alertRepo.countUnresolved({ deviceId, ownerId });
    return { unreadCount: count };
  }

  /**
   * UC-13: Xử lý cảnh báo cụ thể (Đánh dấu đã đọc / đã xử lý)
   */
  async resolveAlert(id, actionTaken = 'Đã nắm thông tin và thực hiện cải tạo đất', currentUser = null) {
    const existing = await this.alertRepo.findById(id);
    if (!existing) {
      const err = new Error('Không tìm thấy cảnh báo cần xử lý hoặc cảnh báo đã được giải quyết.');
      err.statusCode = 404;
      throw err;
    }

    if (currentUser && currentUser.role !== 'admin' && existing.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền xử lý cảnh báo của trạm đo khác.');
      err.statusCode = 403;
      throw err;
    }

    const success = await this.alertRepo.resolve(id, actionTaken);
    if (!success) {
      const err = new Error('Không tìm thấy cảnh báo cần xử lý hoặc cảnh báo đã được giải quyết.');
      err.statusCode = 404;
      throw err;
    }
    return { success: true, message: 'Đã đánh dấu cảnh báo là đã xử lý thành công.' };
  }

  /**
   * UC-13 Step 1a: Đánh dấu tất cả cảnh báo là đã đọc
   */
  async resolveAllAlerts({ deviceId = null, ownerId = null } = {}) {
    const affected = await this.alertRepo.resolveAll({ deviceId, ownerId });
    return { success: true, resolvedCount: affected, message: `Đã đánh dấu ${affected} cảnh báo là đã xử lý.` };
  }
}
