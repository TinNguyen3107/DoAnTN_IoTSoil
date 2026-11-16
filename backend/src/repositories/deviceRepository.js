import { pool } from '../config/db.js';

export class DeviceRepository {
  /**
   * Tạo mới thiết bị trong database
   */
  async create({
    name,
    type,
    deviceCode,
    hardwareMac = null,
    apiKeyHash,
    ownerId = null,
    claimPin = null,
    provisioningStatus = 'active',
    activationCode = null,
    pairingExpiresAt = null,
    claimedAt = null
  }) {
    const [result] = await pool.query(
      `INSERT INTO devices
        (name, type, device_code, hardware_mac, api_key_hash, owner_id, claim_pin, provisioning_status, activation_code, pairing_expires_at, is_active, claimed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        name,
        type,
        deviceCode,
        hardwareMac,
        apiKeyHash,
        ownerId,
        claimPin,
        provisioningStatus,
        activationCode,
        pairingExpiresAt,
        claimedAt
      ]
    );
    return result.insertId;
  }

  /**
   * Lấy danh sách thiết bị (ẩn claim_pin và activation_code đối với nông dân)
   */
  async findAll(ownerId = null, includeAdminFields = false) {
    const adminCols = includeAdminFields
      ? ', d.claim_pin, d.activation_code, u.email as owner_email'
      : '';

    let sql = `
      SELECT d.id, d.name, d.type, d.device_code, d.hardware_mac, d.owner_id,
             d.provisioning_status, d.pairing_expires_at, d.is_active,
             d.last_online, d.claimed_at, d.created_at,
             u.full_name as owner_name,
             (SELECT COUNT(*) FROM readings r WHERE r.device_id = d.id) as total_readings,
             (SELECT COUNT(*) FROM device_requests dr WHERE dr.device_id = d.id AND dr.status = 'pending') as pending_requests_count
             ${adminCols}
      FROM devices d
      LEFT JOIN users u ON d.owner_id = u.id
    `;
    const params = [];
    if (ownerId) {
      sql += ` WHERE d.owner_id = ?`;
      params.push(ownerId);
    }
    sql += ` ORDER BY d.id DESC`;

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  /**
   * Lấy thông tin chi tiết công khai của 1 thiết bị
   */
  async findPublicById(id, includeAdminFields = false) {
    const adminCols = includeAdminFields
      ? ', d.claim_pin, d.activation_code, u.email as owner_email'
      : '';

    const [rows] = await pool.query(
      `SELECT d.id, d.name, d.type, d.device_code, d.hardware_mac, d.owner_id,
              d.provisioning_status, d.pairing_expires_at, d.is_active,
              d.last_online, d.claimed_at, d.created_at,
              u.full_name as owner_name,
              (SELECT COUNT(*) FROM readings r WHERE r.device_id = d.id) as total_readings,
              (SELECT COUNT(*) FROM device_requests dr WHERE dr.device_id = d.id AND dr.status = 'pending') as pending_requests_count
              ${adminCols}
       FROM devices d
       LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Tìm thiết bị theo ID (nội bộ)
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT * FROM devices WHERE id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Tìm thiết bị theo mã phần cứng (device_code)
   */
  async findByCode(deviceCode) {
    const [rows] = await pool.query(
      `SELECT * FROM devices WHERE device_code = ?`,
      [deviceCode]
    );
    return rows[0] || null;
  }

  /**
   * Tìm thiết bị theo địa chỉ MAC / Serial phần cứng
   */
  async findByMac(hardwareMac) {
    const [rows] = await pool.query(
      `SELECT * FROM devices WHERE hardware_mac = ?`,
      [hardwareMac]
    );
    return rows[0] || null;
  }

  /**
   * Tìm thiết bị theo tên trong phạm vi tài khoản (hoặc trong kho owner_id IS NULL)
   */
  async findByName(name, ownerId, excludeId = null) {
    let sql = `SELECT * FROM devices WHERE name = ? AND provisioning_status != 'rejected'`;
    const params = [name];

    if (ownerId === null || ownerId === undefined) {
      sql += ` AND owner_id IS NULL`;
    } else {
      sql += ` AND owner_id = ?`;
      params.push(ownerId);
    }

    if (excludeId) {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  }

  /**
   * Gắn thiết bị chưa có chủ vào tài khoản nông dân (atomic tránh claim trùng)
   */
  async claimDevice({ id, ownerId, name }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET owner_id = ?, name = ?, claim_pin = NULL, provisioning_status = 'active', claimed_at = NOW()
       WHERE id = ? AND owner_id IS NULL`,
      [ownerId, name, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Thu hồi / Hủy liên kết thiết bị về trạng thái chờ kích hoạt kèm PIN mới
   */
  async releaseDevice({ id, newClaimPin }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET owner_id = NULL, claim_pin = ?, provisioning_status = 'unclaimed',
           activation_code = NULL, pairing_expires_at = NULL, claimed_at = NULL
       WHERE id = ?`,
      [newClaimPin, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Admin bàn giao trực tiếp thiết bị cho một tài khoản
   */
  async assignDevice({ id, ownerId }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET owner_id = ?, claim_pin = NULL, provisioning_status = 'active',
           activation_code = NULL, pairing_expires_at = NULL, claimed_at = COALESCE(claimed_at, NOW())
       WHERE id = ?`,
      [ownerId, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Đổi tên trạm đo
   */
  async renameDevice({ id, name }) {
    const [result] = await pool.query(
      `UPDATE devices SET name = ? WHERE id = ?`,
      [name, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Cập nhật API Key hash mới cho thiết bị (Admin cấp trực tiếp)
   */
  async updateApiKeyHash(id, apiKeyHash) {
    const [result] = await pool.query(
      `UPDATE devices
       SET api_key_hash = ?, provisioning_status = 'active', activation_code = NULL, pairing_expires_at = NULL
       WHERE id = ?`,
      [apiKeyHash, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Đổi trạng thái kích hoạt (Active / Inactive)
   */
  async toggleActive(id, isActive) {
    const [result] = await pool.query(
      `UPDATE devices SET is_active = ? WHERE id = ?`,
      [isActive, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Xóa thiết bị
   */
  async delete(id) {
    const [result] = await pool.query(
      `DELETE FROM devices WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  }

  // ==============================================================
  // QUẢN LÝ YÊU CẦU CẤP TRẠM & GHÉP NỐI TỰ ĐỘNG QUA MAC (CÁCH B)
  // ==============================================================

  async createRequest({ deviceId = null, userId, requestType, hardwareMac, requestedName, deviceType, reason = null }) {
    const [result] = await pool.query(
      `INSERT INTO device_requests
        (device_id, user_id, request_type, hardware_mac, requested_name, device_type, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [deviceId, userId, requestType, hardwareMac, requestedName, deviceType, reason]
    );
    return result.insertId;
  }

  async findRequests({ userId = null, status = null } = {}) {
    let sql = `
      SELECT dr.id, dr.device_id, dr.user_id, dr.request_type, dr.hardware_mac,
             dr.requested_name, dr.device_type, dr.reason, dr.status,
             dr.activation_code, dr.admin_note, dr.resolved_at, dr.created_at,
             u.full_name as requester_name, u.email as requester_email,
             d.name as device_name, d.device_code, d.provisioning_status as device_provisioning_status
      FROM device_requests dr
      JOIN users u ON dr.user_id = u.id
      LEFT JOIN devices d ON dr.device_id = d.id
      WHERE 1 = 1
    `;
    const params = [];

    if (userId) {
      sql += ` AND dr.user_id = ?`;
      params.push(userId);
    }
    if (status) {
      sql += ` AND dr.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY CASE WHEN dr.status = 'pending' THEN 0 ELSE 1 END, dr.id DESC`;

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async findRequestById(requestId) {
    const [rows] = await pool.query(
      `SELECT dr.*, u.full_name as requester_name, u.email as requester_email
       FROM device_requests dr
       JOIN users u ON dr.user_id = u.id
       WHERE dr.id = ?`,
      [requestId]
    );
    return rows[0] || null;
  }

  async findPendingRequestByDeviceId(deviceId) {
    const [rows] = await pool.query(
      `SELECT * FROM device_requests WHERE device_id = ? AND status = 'pending' LIMIT 1`,
      [deviceId]
    );
    return rows[0] || null;
  }

  async findPendingRequestByMac(hardwareMac, excludeDeviceId = null) {
    let sql = `SELECT * FROM device_requests WHERE hardware_mac = ? AND status = 'pending'`;
    const params = [hardwareMac];
    if (excludeDeviceId) {
      sql += ` AND (device_id IS NULL OR device_id != ?)`;
      params.push(excludeDeviceId);
    }
    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  }

  async markRequestApproved({ requestId, activationCode, adminNote = null }) {
    const [result] = await pool.query(
      `UPDATE device_requests
       SET status = 'approved', activation_code = ?, admin_note = ?, resolved_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [activationCode, adminNote, requestId]
    );
    return result.affectedRows > 0;
  }

  async markRequestRejected({ requestId, adminNote = null }) {
    const [result] = await pool.query(
      `UPDATE device_requests
       SET status = 'rejected', admin_note = ?, resolved_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [adminNote, requestId]
    );
    return result.affectedRows > 0;
  }

  async deleteRequestById(requestId) {
    const [result] = await pool.query(
      `DELETE FROM device_requests WHERE id = ?`,
      [requestId]
    );
    return result.affectedRows > 0;
  }

  async prepareDeviceForActivation({ deviceId, hardwareMac = null, placeholderHash, activationCode }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET hardware_mac = COALESCE(?, hardware_mac),
           api_key_hash = ?,
           provisioning_status = 'awaiting_activation',
           activation_code = ?,
           pairing_expires_at = NULL,
           claim_pin = NULL
       WHERE id = ?`,
      [hardwareMac, placeholderHash, activationCode, deviceId]
    );
    return result.affectedRows > 0;
  }

  async markDeviceRejected(deviceId) {
    const [result] = await pool.query(
      `UPDATE devices
       SET provisioning_status = 'rejected', hardware_mac = NULL, activation_code = NULL, pairing_expires_at = NULL
       WHERE id = ?`,
      [deviceId]
    );
    return result.affectedRows > 0;
  }

  async openPairingWindow({ deviceId, expiresAt }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET provisioning_status = 'pairing_open', activation_code = NULL, pairing_expires_at = ?
       WHERE id = ? AND provisioning_status = 'awaiting_activation'`,
      [expiresAt, deviceId]
    );
    return result.affectedRows > 0;
  }

  async reopenPairingWindow({ deviceId, expiresAt }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET pairing_expires_at = ?
       WHERE id = ? AND provisioning_status = 'pairing_open'`,
      [expiresAt, deviceId]
    );
    return result.affectedRows > 0;
  }

  async completeHardwarePairing({ deviceId, apiKeyHash }) {
    const [result] = await pool.query(
      `UPDATE devices
       SET api_key_hash = ?,
           provisioning_status = 'active',
           activation_code = NULL,
           pairing_expires_at = NULL,
           claimed_at = COALESCE(claimed_at, NOW())
       WHERE id = ? AND provisioning_status = 'pairing_open'`,
      [apiKeyHash, deviceId]
    );
    return result.affectedRows > 0;
  }
}
