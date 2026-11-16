import { pool } from '../config/db.js';

export class UserRepository {
  /**
   * Tìm người dùng theo Email
   */
  async findByEmail(email) {
    if (!email) return null;
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE email = ?`,
      [email.trim().toLowerCase()]
    );
    return rows[0] || null;
  }

  /**
   * Tìm người dùng theo ID
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Tạo tài khoản người dùng mới (vai trò mặc định là 'user' - Nông dân)
   */
  async create({ email, passwordHash, fullName, role = 'user' }) {
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [email.trim().toLowerCase(), passwordHash, fullName.trim(), role]
    );
    return result.insertId;
  }

  /**
   * Lấy danh sách toàn bộ người dùng kèm số lượng trạm đo sở hữu
   */
  async findAll() {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              COUNT(d.id) as devices_count
       FROM users u
       LEFT JOIN devices d ON d.owner_id = u.id
       GROUP BY u.id
       ORDER BY u.id ASC`
    );
    return rows;
  }

  /**
   * Cập nhật trạng thái kích hoạt tài khoản
   */
  async updateStatus(id, isActive) {
    const [result] = await pool.query(
      `UPDATE users SET is_active = ? WHERE id = ?`,
      [isActive ? 1 : 0, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Phân quyền vai trò mới
   */
  async updateRole(id, role) {
    const [result] = await pool.query(
      `UPDATE users SET role = ? WHERE id = ?`,
      [role, id]
    );
    return result.affectedRows > 0;
  }
}
