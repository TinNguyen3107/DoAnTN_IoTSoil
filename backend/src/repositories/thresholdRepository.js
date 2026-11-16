import { pool } from '../config/db.js';

export class ThresholdRepository {
  /**
   * Lấy danh sách dải ngưỡng hiện tại theo chủ sở hữu (hoặc mặc định owner_id = 1)
   */
  async findAll(ownerId = 1) {
    const [rows] = await pool.query(
      `SELECT id, parameter, low_limit, high_limit, owner_id, updated_at 
       FROM thresholds 
       WHERE owner_id = ? OR owner_id = 1
       ORDER BY FIELD(parameter, 'ph', 'ec', 'n', 'p', 'k', 'temperature', 'moisture')`,
      [ownerId || 1]
    );

    // Loại bỏ bản ghi trùng nếu user có cấu hình riêng đè lên mặc định
    const paramMap = new Map();
    rows.forEach(r => {
      // Ưu tiên bản ghi của chính ownerId trước, nếu không có thì lấy của admin (owner_id = 1)
      if (!paramMap.has(r.parameter) || r.owner_id === ownerId) {
        paramMap.set(r.parameter, r);
      }
    });

    return Array.from(paramMap.values());
  }

  /**
   * Cập nhật hàng loạt dải ngưỡng trong Transaction
   */
  async batchUpdate(thresholdList, ownerId = 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const item of thresholdList) {
        // Kiểm tra xem đã có ngưỡng của owner_id này cho parameter chưa
        const [existing] = await conn.query(
          `SELECT id FROM thresholds WHERE parameter = ? AND owner_id = ?`,
          [item.parameter, ownerId]
        );

        if (existing.length > 0) {
          await conn.query(
            `UPDATE thresholds 
             SET low_limit = ?, high_limit = ?, updated_at = NOW() 
             WHERE parameter = ? AND owner_id = ?`,
            [item.low_limit, item.high_limit, item.parameter, ownerId]
          );
        } else {
          await conn.query(
            `INSERT INTO thresholds (parameter, low_limit, high_limit, owner_id) 
             VALUES (?, ?, ?, ?)`,
            [item.parameter, item.low_limit, item.high_limit, ownerId]
          );
        }
      }

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
