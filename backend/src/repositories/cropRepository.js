import { pool } from '../config/db.js';

export class CropRepository {
  /**
   * Lấy toàn bộ danh mục cây trồng và định mức dinh dưỡng chuẩn
   */
  async findAll() {
    const [rows] = await pool.query(
      `SELECT id, name, n_min, n_max, p2o5_min, p2o5_max, k2o_min, k2o_max, ph_min, ph_max, ec_max, description 
       FROM crops 
       ORDER BY id ASC`
    );
    return rows;
  }

  /**
   * Tìm thông tin cây trồng theo ID
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, name, n_min, n_max, p2o5_min, p2o5_max, k2o_min, k2o_max, ph_min, ph_max, ec_max, description 
       FROM crops 
       WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }
}
