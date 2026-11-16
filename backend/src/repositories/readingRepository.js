import { pool } from '../config/db.js';

export class ReadingRepository {
  /**
   * Tìm thiết bị theo mã băm SHA-256 của API Key
   */
  async findDeviceByApiKeyHash(apiKeyHash) {
    const [rows] = await pool.query(
      `SELECT id, name, type, is_active, provisioning_status, owner_id, last_online 
       FROM devices 
       WHERE api_key_hash = ?`,
      [apiKeyHash]
    );
    return rows[0] || null;
  }

  /**
   * Lưu bản ghi đo mới vào bảng readings
   */
  async create({ deviceId, measuredAt, mode, n, p, k, ph, ec, temperature, moisture }) {
    const [result] = await pool.query(
      `INSERT INTO readings 
        (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, measuredAt, mode, n, p, k, ph, ec, temperature, moisture]
    );
    return result.insertId;
  }

  /**
   * Cập nhật thời điểm kết nối gần nhất của trạm
   */
  async updateDeviceLastOnline(deviceId, timestamp) {
    await pool.query(
      `UPDATE devices SET last_online = ? WHERE id = ?`,
      [timestamp, deviceId]
    );
  }

  /**
   * Lấy bản ghi số đo mới nhất của một trạm đo
   */
  async findLatestByDeviceId(deviceId) {
    const [rows] = await pool.query(
      `SELECT r.*, d.name as device_name, d.type as device_type
       FROM readings r
       JOIN devices d ON r.device_id = d.id
       WHERE r.device_id = ?
       ORDER BY r.measured_at DESC, r.id DESC
       LIMIT 1`,
      [deviceId]
    );
    return rows[0] || null;
  }

  /**
   * Lấy lịch sử số đo gần đây của một trạm
   */
  async findRecentByDeviceId(deviceId, limit = 20) {
    const [rows] = await pool.query(
      `SELECT * FROM readings 
       WHERE device_id = ? 
       ORDER BY measured_at DESC 
       LIMIT ?`,
      [deviceId, limit]
    );
    return rows;
  }

  /**
   * Tìm thiết bị theo ID (kèm thông tin chủ sở hữu)
   */
  async findDeviceById(deviceId) {
    const [rows] = await pool.query(
      `SELECT id, name, type, owner_id, is_active, last_online 
       FROM devices 
       WHERE id = ?`,
      [deviceId]
    );
    return rows[0] || null;
  }

  /**
   * UC-10 Step 3: Truy vấn chuỗi số đo thổ nhưỡng trong khoảng thời gian đã chọn
   */
  async findHistory({ deviceId, fromDate, toDate }) {
    const [rows] = await pool.query(
      `SELECT id, device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture 
       FROM readings 
       WHERE device_id = ? 
         AND measured_at >= ? 
         AND measured_at <= ? 
       ORDER BY measured_at ASC`,
      [deviceId, fromDate, toDate]
    );
    return rows;
  }

  /**
   * UC-10 Step 4: Đồng thời truy vấn danh sách sự kiện canh tác / bón phân trong khoảng ngày tương ứng
   */
  async findFieldEvents({ deviceId, fromDate, toDate }) {
    const [rows] = await pool.query(
      `SELECT id, device_id, event_type, amount, unit, event_date, notes 
       FROM field_events 
       WHERE device_id = ? 
         AND event_date >= DATE(?) 
         AND event_date <= DATE(?) 
       ORDER BY event_date ASC`,
      [deviceId, fromDate, toDate]
    );
    return rows;
  }

  /**
   * UC-11 Step 3: Truy vấn 100% dữ liệu gốc phục vụ kết xuất tệp CSV
   */
  async findExportData({ deviceId, fromDate, toDate }) {
    const [rows] = await pool.query(
      `SELECT r.id, r.measured_at, r.mode, r.n, r.p, r.k, r.ph, r.ec, r.temperature, r.moisture,
              d.id as device_id, d.name as device_name, d.type as device_type
       FROM readings r
       JOIN devices d ON r.device_id = d.id
       WHERE r.device_id = ? 
         AND r.measured_at >= ? 
         AND r.measured_at <= ? 
       ORDER BY r.measured_at ASC`,
      [deviceId, fromDate, toDate]
    );
    return rows;
  }
}
