import crypto from 'crypto';
import { ReadingRepository } from '../repositories/readingRepository.js';
import { AlertService } from './alertService.js';

const formatLocalDate = (input) => {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    return input.slice(0, 10);
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatLocalDateTime = (input) => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${formatLocalDate(d)} ${hh}:${min}:${sec}`;
};

export class ReadingService {
  constructor() {
    this.readingRepo = new ReadingRepository();
    this.alertService = new AlertService();
  }

  /**
   * Tính mã băm SHA-256 từ chuỗi API Key thô
   */
  hashApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return '';
    return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
  }

  /**
   * UC-06 & UC-07: Tiếp nhận và xử lý số đo từ thiết bị IoT
   * Kèm tự động quét ngưỡng cảnh báo (Hình 3.7.2 Step 8)
   */
  async ingestReading({ rawApiKey, payload }) {
    // 1. Kiểm tra API Key
    if (!rawApiKey) {
      const err = new Error('Yêu cầu bị từ chối: Thiếu khóa định danh API Key (Header "x-api-key").');
      err.statusCode = 401;
      throw err;
    }

    const keyHash = this.hashApiKey(rawApiKey);
    const device = await this.readingRepo.findDeviceByApiKeyHash(keyHash);

    if (!device) {
      const err = new Error('Xác thực thất bại: Mã API Key không hợp lệ hoặc thiết bị không tồn tại.');
      err.statusCode = 401;
      throw err;
    }

    // 2. Kiểm tra trạng thái cấp phép & hoạt động của thiết bị
    if (device.provisioning_status && device.provisioning_status !== 'active') {
      const err = new Error(`Thiết bị "${device.name}" chưa hoàn tất kích hoạt hoặc đang chờ ghép nối khóa mới.`);
      err.statusCode = 403;
      throw err;
    }

    if (!device.is_active) {
      const err = new Error(`Thiết bị "${device.name}" đang bị quản trị viên tạm khóa. Máy chủ từ chối tiếp nhận gói tin.`);
      err.statusCode = 403;
      throw err;
    }

    // 3. Kiểm tra và chuẩn hóa 7 thông số cảm biến (Hỗ trợ cả key ngắn và key đầy đủ từ phần cứng ESP32)
    const rawN = payload?.n ?? payload?.nitrogen;
    const rawP = payload?.p ?? payload?.phosphorus;
    const rawK = payload?.k ?? payload?.potassium;
    const rawPh = payload?.ph;
    const rawEc = payload?.ec;
    const rawTemp = payload?.temperature;
    const rawMoist = payload?.moisture ?? payload?.humidity;
    const { mode, measured_at } = payload || {};

    const numN = parseFloat(rawN);
    const numP = parseFloat(rawP);
    const numK = parseFloat(rawK);
    const numPh = parseFloat(rawPh);
    const numEc = parseInt(rawEc, 10);
    const numTemp = parseFloat(rawTemp);
    const numMoist = parseFloat(rawMoist);

    if (isNaN(numN) || numN < 0) throw new Error('Chỉ số Đạm (N) không hợp lệ (phải là số >= 0).');
    if (isNaN(numP) || numP < 0) throw new Error('Chỉ số Lân (P) không hợp lệ (phải là số >= 0).');
    if (isNaN(numK) || numK < 0) throw new Error('Chỉ số Kali (K) không hợp lệ (phải là số >= 0).');
    if (isNaN(numPh) || numPh < 0 || numPh > 14) throw new Error('Độ chua (pH) không hợp lệ (thang đo từ 0.0 đến 14.0).');
    if (isNaN(numEc) || numEc < 0) throw new Error('Độ dẫn điện (EC) không hợp lệ (phải là số >= 0).');
    if (isNaN(numTemp) || numTemp < -20 || numTemp > 80) throw new Error('Nhiệt độ đất không hợp lệ (-20°C đến 80°C).');
    if (isNaN(numMoist) || numMoist < 0 || numMoist > 100) throw new Error('Độ ẩm đất không hợp lệ (0% đến 100%).');

    // 4. Xác định chế độ đo (mode: 'auto' | 'manual')
    let resolvedMode = mode;
    if (!['auto', 'manual'].includes(resolvedMode)) {
      resolvedMode = device.type === 'fixed' ? 'auto' : 'manual';
    }

    // 5. Chuẩn hóa thời gian đo (measured_at) theo giờ hệ thống/địa phương
    let measuredAt = new Date();
    if (measured_at) {
      const parsed = new Date(measured_at);
      if (!isNaN(parsed.getTime())) {
        measuredAt = parsed;
      }
    }
    const mysqlDateTime = formatLocalDateTime(measuredAt);

    // 6. Lưu vào cơ sở dữ liệu
    const readingId = await this.readingRepo.create({
      deviceId: device.id,
      measuredAt: mysqlDateTime,
      mode: resolvedMode,
      n: numN,
      p: numP,
      k: numK,
      ph: numPh,
      ec: numEc,
      temperature: numTemp,
      moisture: numMoist
    });

    // 7. Cập nhật thời điểm kết nối gần nhất của trạm
    await this.readingRepo.updateDeviceLastOnline(device.id, mysqlDateTime);

    // 8. TỰ ĐỘNG QUÉT DẢI NGƯỠNG AN TOÀN VÀ SINH CẢNH BÁO (Hình 3.7.2 Step 8)
    const generatedAlerts = await this.alertService.evaluateReadingAndCreateAlerts({
      readingId,
      deviceId: device.id,
      values: {
        n: numN,
        p: numP,
        k: numK,
        ph: numPh,
        ec: numEc,
        temperature: numTemp,
        moisture: numMoist
      },
      ownerId: device.owner_id || 1
    });

    return {
      readingId,
      deviceId: device.id,
      deviceName: device.name,
      deviceType: device.type,
      mode: resolvedMode,
      measuredAt: mysqlDateTime,
      values: {
        n: numN,
        p: numP,
        k: numK,
        ph: numPh,
        ec: numEc,
        temperature: numTemp,
        moisture: numMoist
      },
      alertsCount: generatedAlerts.length,
      alerts: generatedAlerts
    };
  }

  /**
   * Lấy số đo mới nhất của trạm
   */
  async getLatestReading(deviceId, currentUser = null) {
    if (!deviceId) throw new Error('Vui lòng cung cấp mã ID trạm đo.');
    const device = await this.readingRepo.findDeviceById(Number(deviceId));
    if (!device) {
      const err = new Error('Không tìm thấy thông tin trạm đo.');
      err.statusCode = 404;
      throw err;
    }
    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền xem dữ liệu của trạm quan trắc này.');
      err.statusCode = 403;
      throw err;
    }
    return await this.readingRepo.findLatestByDeviceId(Number(deviceId));
  }

  /**
   * Lấy lịch sử số đo gần đây của trạm
   */
  async getRecentReadings(deviceId, limit = 20, currentUser = null) {
    if (!deviceId) throw new Error('Vui lòng cung cấp mã ID trạm đo.');
    const device = await this.readingRepo.findDeviceById(Number(deviceId));
    if (!device) {
      const err = new Error('Không tìm thấy thông tin trạm đo.');
      err.statusCode = 404;
      throw err;
    }
    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền xem dữ liệu của trạm quan trắc này.');
      err.statusCode = 403;
      throw err;
    }
    return await this.readingRepo.findRecentByDeviceId(Number(deviceId), Number(limit));
  }

  /**
   * Tính toán tóm tắt thống kê (Min, Max, Avg, Latest) cho chuỗi số đo
   */
  calculateSummary(readings) {
    if (!readings || readings.length === 0) return null;
    
    const fields = ['n', 'p', 'k', 'ph', 'ec', 'temperature', 'moisture'];
    const summary = {};

    for (const f of fields) {
      const vals = readings.map(r => Number(r[f])).filter(v => !isNaN(v));
      if (vals.length === 0) {
        summary[f] = { min: 0, max: 0, avg: 0, latest: 0 };
        continue;
      }
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = Number((sum / vals.length).toFixed(f === 'ph' || f === 'temperature' ? 2 : 1));
      const latest = Number(readings[readings.length - 1][f]);

      summary[f] = { min, max, avg, latest };
    }

    return summary;
  }

  /**
   * UC-10 Alt 3b: Thu nhỏ mẫu số đo khi khoảng thời gian quá dài (> 500 bản ghi)
   */
  downsampleReadings(readings, targetMax = 300) {
    if (readings.length <= targetMax) return readings;

    const factor = Math.ceil(readings.length / targetMax);
    const downsampled = [];

    for (let i = 0; i < readings.length; i += factor) {
      const bucket = readings.slice(i, i + factor);
      const midReading = bucket[Math.floor(bucket.length / 2)];
      
      const avgN = bucket.reduce((sum, r) => sum + Number(r.n), 0) / bucket.length;
      const avgP = bucket.reduce((sum, r) => sum + Number(r.p), 0) / bucket.length;
      const avgK = bucket.reduce((sum, r) => sum + Number(r.k), 0) / bucket.length;
      const avgPh = bucket.reduce((sum, r) => sum + Number(r.ph), 0) / bucket.length;
      const avgEc = Math.round(bucket.reduce((sum, r) => sum + Number(r.ec), 0) / bucket.length);
      const avgTemp = bucket.reduce((sum, r) => sum + Number(r.temperature), 0) / bucket.length;
      const avgMoist = bucket.reduce((sum, r) => sum + Number(r.moisture), 0) / bucket.length;

      downsampled.push({
        id: midReading.id,
        device_id: midReading.device_id,
        measured_at: midReading.measured_at,
        mode: midReading.mode,
        n: Number(avgN.toFixed(1)),
        p: Number(avgP.toFixed(1)),
        k: Number(avgK.toFixed(1)),
        ph: Number(avgPh.toFixed(2)),
        ec: avgEc,
        temperature: Number(avgTemp.toFixed(1)),
        moisture: Number(avgMoist.toFixed(1)),
        isDownsampledGroup: true
      });
    }

    return downsampled;
  }

  /**
   * UC-10: Xem biểu đồ lịch sử biến thiên theo mốc thời gian
   * Kết hợp chuỗi số đo thổ nhưỡng và các mốc sự kiện canh tác
   */
  async getTelemetryHistory({ deviceId, fromDate, toDate, currentUser }) {
    if (!deviceId) throw new Error('Vui lòng chọn trạm quan trắc.');

    const device = await this.readingRepo.findDeviceById(Number(deviceId));
    if (!device) throw new Error('Không tìm thấy thông tin trạm đo.');

    // Nông dân chỉ được xem dữ liệu trạm của mình
    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền xem dữ liệu của trạm quan trắc này.');
      err.statusCode = 403;
      throw err;
    }

    // Chuẩn hóa khoảng thời gian: Mặc định 7 ngày gần nhất nếu không truyền
    if (fromDate && toDate && fromDate > toDate) {
      const err = new Error('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      err.statusCode = 400;
      throw err;
    }

    let from = fromDate ? `${fromDate} 00:00:00` : '';
    let to = toDate ? `${toDate} 23:59:59` : '';

    if (!from || !to) {
      const now = new Date();
      const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      to = formatLocalDateTime(now);
      from = formatLocalDateTime(past7d);
    }

    // Step 3: Đọc các bản ghi đo thổ nhưỡng trong khoảng ngày
    const rawReadings = await this.readingRepo.findHistory({
      deviceId: device.id,
      fromDate: from,
      toDate: to
    });

    // Step 4: Đồng thời truy vấn danh sách sự kiện bón phân / canh tác
    const rawEvents = await this.readingRepo.findFieldEvents({
      deviceId: device.id,
      fromDate: from,
      toDate: to
    });

    // Alt 3a: Khoảng thời gian chọn không có bản ghi nào
    if (rawReadings.length === 0) {
      return {
        device: { id: device.id, name: device.name, type: device.type },
        range: { fromDate: from.slice(0, 10), toDate: to.slice(0, 10) },
        totalReadings: 0,
        isDownsampled: false,
        readings: [],
        events: rawEvents.map(e => ({
          id: e.id,
          eventType: e.event_type,
          amount: Number(e.amount),
          unit: e.unit,
          eventDate: formatLocalDate(e.event_date),
          notes: e.notes
        })),
        summary: null
      };
    }

    // Tính toán số liệu thống kê tổng hợp trên 100% bản ghi
    const summary = this.calculateSummary(rawReadings);

    // Alt 3b: Khoảng thời gian quá dài (> 500 bản ghi) -> Lấy mẫu đại diện
    const isDownsampled = rawReadings.length > 500;
    const chartReadings = isDownsampled ? this.downsampleReadings(rawReadings, 300) : rawReadings;

    // Định dạng nhãn thời gian thân thiện cho biểu đồ
    const formattedReadings = chartReadings.map(r => {
      const dt = new Date(r.measured_at);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');

      return {
        id: r.id,
        measuredAt: r.measured_at,
        timeLabel: `${dd}/${mm} ${hh}:${min}`,
        dateOnly: `${dd}/${mm}`,
        isoDate: formatLocalDate(dt),
        mode: r.mode,
        n: Number(r.n),
        p: Number(r.p),
        k: Number(r.k),
        ph: Number(r.ph),
        ec: Number(r.ec),
        temperature: Number(r.temperature),
        moisture: Number(r.moisture)
      };
    });

    const formattedEvents = rawEvents.map(e => ({
      id: e.id,
      eventType: e.event_type,
      amount: Number(e.amount),
      unit: e.unit,
      eventDate: formatLocalDate(e.event_date),
      notes: e.notes
    }));

    return {
      device: { id: device.id, name: device.name, type: device.type },
      range: { fromDate: from.slice(0, 10), toDate: to.slice(0, 10) },
      totalReadings: rawReadings.length,
      isDownsampled,
      readings: formattedReadings,
      events: formattedEvents,
      summary
    };
  }

  /**
   * UC-11: Xuất báo cáo dữ liệu đo lường định dạng CSV (UTF-8 BOM)
   */
  async generateCsvExport({ deviceId, fromDate, toDate, currentUser }) {
    if (!deviceId) throw new Error('Vui lòng chọn trạm quan trắc.');

    const device = await this.readingRepo.findDeviceById(Number(deviceId));
    if (!device) throw new Error('Không tìm thấy thông tin trạm đo.');

    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền trích xuất dữ liệu của trạm này.');
      err.statusCode = 403;
      throw err;
    }

    if (fromDate && toDate && fromDate > toDate) {
      const err = new Error('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      err.statusCode = 400;
      throw err;
    }

    const from = fromDate ? `${fromDate} 00:00:00` : '1970-01-01 00:00:00';
    const to = toDate ? `${toDate} 23:59:59` : '2099-12-31 23:59:59';

    // Alt 3b: Bảo toàn 100% dữ liệu gốc khi xuất báo cáo
    const rawReadings = await this.readingRepo.findExportData({
      deviceId: device.id,
      fromDate: from,
      toDate: to
    });

    // Alt 3a: Nếu không có bản ghi nào
    if (rawReadings.length === 0) {
      const err = new Error('Khoảng thời gian đã chọn không có số đo nào để xuất báo cáo.');
      err.statusCode = 404;
      throw err;
    }

    // Tên file chuẩn: BaoCao_SoDo_[DeviceID]_[FromDate]_[ToDate].csv (Quy tắc Table 22)
    const cleanFrom = from.slice(0, 10).replace(/-/g, '');
    const cleanTo = to.slice(0, 10).replace(/-/g, '');
    const filename = `BaoCao_SoDo_${device.id}_${cleanFrom}_${cleanTo}.csv`;

    // Tiêu đề cột tiếng Việt UTF-8 BOM
    const headers = [
      'STT',
      'Thời Gian Đo',
      'Mã Trạm',
      'Tên Trạm Quan Trắc',
      'Phân Loại Trạm',
      'Chế Độ Đo',
      'Đạm N (mg/kg)',
      'Lân P (mg/kg)',
      'Kali K (mg/kg)',
      'Độ Chua pH',
      'Độ Dẫn Điện EC (uS/cm)',
      'Nhiệt Độ Đất (oC)',
      'Độ Ẩm Đất (%)'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(',')];

    rawReadings.forEach((r, idx) => {
      const measuredTime = formatLocalDateTime(r.measured_at);
      const deviceTypeName = r.device_type === 'fixed' ? 'Trạm Cố Định' : 'Cầm Tay Dã Ngoại';
      const modeName = r.mode === 'auto' ? 'Tự Động (NTP)' : 'Thủ Công';

      const line = [
        idx + 1,
        escapeCsv(measuredTime),
        `#00${r.device_id}`,
        escapeCsv(r.device_name),
        escapeCsv(deviceTypeName),
        escapeCsv(modeName),
        r.n,
        r.p,
        r.k,
        r.ph,
        r.ec,
        r.temperature,
        r.moisture
      ].join(',');

      rows.push(line);
    });

    // Thêm UTF-8 BOM (\uFEFF) để Excel hiển thị tiếng Việt chuẩn 100% không bị vỡ font
    const csvContent = '\uFEFF' + rows.join('\r\n');

    return {
      filename,
      csvContent,
      totalRows: rawReadings.length
    };
  }
}
