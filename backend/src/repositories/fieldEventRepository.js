import { pool } from '../config/db.js';

export class FieldEventRepository {
  /**
   * UC-14 Step 3: Truy vấn danh sách sự kiện canh tác
   */
  async findAll({ deviceId, ownerId, isAdmin }) {
    let query = `
      SELECT e.id, e.device_id, e.event_type, e.amount, e.unit, e.event_date, e.notes, e.created_at,
             d.name as device_name, d.type as device_type, d.owner_id
      FROM field_events e
      JOIN devices d ON e.device_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (deviceId) {
      query += ` AND e.device_id = ?`;
      params.push(deviceId);
    }

    if (!isAdmin && ownerId) {
      query += ` AND d.owner_id = ?`;
      params.push(ownerId);
    }

    query += ` ORDER BY e.event_date DESC, e.id DESC`;

    const [rows] = await pool.query(query, params);
    return rows;
  }

  /**
   * Tìm sự kiện theo ID
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT e.*, d.name as device_name, d.owner_id
       FROM field_events e
       JOIN devices d ON e.device_id = d.id
       WHERE e.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * UC-14 Step 8: Lưu sự kiện mới vào cơ sở dữ liệu
   */
  async create({ deviceId, eventType, amount, unit, eventDate, notes }) {
    const [result] = await pool.query(
      `INSERT INTO field_events (device_id, event_type, amount, unit, event_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deviceId, eventType, amount, unit, eventDate, notes || null]
    );
    return result.insertId;
  }

  /**
   * UC-14 Alt 5a: Xóa bản ghi sự kiện nhập sai
   */
  async delete(id) {
    const [result] = await pool.query(
      `DELETE FROM field_events WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }
}
