import { pool, ensureDeviceProvisioningSchema } from '../config/db.js';
import bcrypt from 'bcryptjs';

export const runSeed = async () => {
  console.log('🌱 Bắt đầu làm sạch dữ liệu mock và nạp tài khoản chuẩn...');
  await ensureDeviceProvisioningSchema();
  const conn = await pool.getConnection();

  try {
    // 1. Xóa sạch dữ liệu người dùng, thiết bị và log thử nghiệm trước đó
    await conn.query(`DELETE FROM alerts;`);
    await conn.query(`DELETE FROM field_events;`);
    await conn.query(`DELETE FROM readings;`);
    await conn.query(`DELETE FROM device_requests;`);
    await conn.query(`DELETE FROM devices;`);
    await conn.query(`DELETE FROM thresholds;`);
    await conn.query(`DELETE FROM users;`);

    await conn.query(`ALTER TABLE alerts AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE field_events AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE readings AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE device_requests AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE devices AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE thresholds AUTO_INCREMENT = 1;`);
    await conn.query(`ALTER TABLE users AUTO_INCREMENT = 1;`);

    await conn.beginTransaction();

    // 2. Tạo mật khẩu hash chuẩn bcrypt cost 10 cho 2 tài khoản duy nhất
    const adminPassHash = await bcrypt.hash('admin123', 10);
    const userPassHash = await bcrypt.hash('user123', 10);

    // 3. Nạp đúng 2 tài khoản Admin và User (không có trạm đo hay người dùng mock nào khác)
    await conn.query(`
      INSERT INTO users (id, email, password_hash, full_name, role, is_active)
      VALUES 
        (1, 'admin@gmail.com', ?, 'Quản Trị Viên', 'admin', 1),
        (2, 'user@gmail.com', ?, 'Người Dùng Nông Dân', 'user', 1);
    `, [adminPassHash, userPassHash]);

    // 4. Nạp Cấu hình Ngưỡng an toàn tiêu chuẩn (mặc định hệ thống gắn owner_id = 1)
    await conn.query(`
      INSERT INTO thresholds (parameter, low_limit, high_limit, owner_id)
      VALUES 
        ('ph', 5.5, 7.0, 1),
        ('ec', 300.0, 1200.0, 1),
        ('n', 50.0, 150.0, 1),
        ('p', 30.0, 80.0, 1),
        ('k', 80.0, 200.0, 1),
        ('temperature', 18.0, 35.0, 1),
        ('moisture', 50.0, 80.0, 1);
    `);

    // 5. Nạp Danh mục Cây trồng & Định mức dinh dưỡng (chuẩn nông nghiệp VN)
    await conn.query(`DELETE FROM crops;`);
    await conn.query(`ALTER TABLE crops AUTO_INCREMENT = 1;`);
    await conn.query(`
      INSERT INTO crops (name, n_min, n_max, p2o5_min, p2o5_max, k2o_min, k2o_max, ph_min, ph_max, ec_max, description)
      VALUES 
        ('Cây Lúa Nước (Giai đoạn đẻ nhánh - làm đòng)', 60.0, 120.0, 40.0, 80.0, 70.0, 140.0, 5.5, 6.8, 1200, 'Cây lương thực chủ lực, cần độ ẩm cao và tỷ lệ N-P-K cân đối'),
        ('Cây Ngô / Bắp', 70.0, 140.0, 50.0, 90.0, 80.0, 160.0, 5.8, 7.2, 1100, 'Nhu cầu Đạm và Lân cao ở giai đoạn trổ cờ'),
        ('Cây Cà Phê (Giai đoạn nuôi quả)', 80.0, 160.0, 45.0, 85.0, 100.0, 220.0, 5.2, 6.5, 1000, 'Cần hàm lượng Kali cao giúp chắc hạt và giữ nước mùa khô'),
        ('Cây Hồ Tiêu', 70.0, 130.0, 40.0, 75.0, 90.0, 180.0, 5.5, 6.5, 900, 'Rất mẫn cảm với úng nước và đất quá chua hoặc quá mặn'),
        ('Rau Ăn Lá (Cải, Xà lách, Rau muống)', 80.0, 150.0, 30.0, 60.0, 50.0, 110.0, 6.0, 7.0, 1000, 'Nhu cầu Đạm cao để phát triển sinh khối thân lá nhanh'),
        ('Cây Có Múi (Cam, Bưởi, Quýt)', 75.0, 145.0, 50.0, 90.0, 95.0, 200.0, 5.5, 6.8, 1100, 'Cần bón cân đối theo từng thời kỳ ra hoa và nuôi quả');
    `);

    // 6. Nạp Cấu hình Nông học
    await conn.query(`
      INSERT INTO system_configs (cfg_key, cfg_value, description)
      VALUES 
        ('UREA_N_PERCENT', '46', 'Hàm lượng N nguyên chất trong phân Urê (%)'),
        ('SUPER_PHOSPHATE_P_PERCENT', '16', 'Hàm lượng P2O5 trong phân Supe Lân (%)'),
        ('POTASSIUM_CHLORIDE_K_PERCENT', '60', 'Hàm lượng K2O trong phân Kali Clorua (%)'),
        ('SOIL_DEPTH_M', '0.2', 'Độ sâu tầng đất canh tác tiêu chuẩn (m)'),
        ('SOIL_BULK_DENSITY', '1.3', 'Dung trọng đất trung bình (tấn/m3)'),
        ('AREA_M2_PER_HA', '10000', 'Diện tích 1 héc-ta (m2)')
      ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value);
    `);

    await conn.commit();
    console.log('✅ Hoàn tất dọn sạch dữ liệu mock & khởi tạo 2 tài khoản: admin@gmail.com / user@gmail.com!');
  } catch (err) {
    await conn.rollback();
    console.error('❌ Thất bại khi nạp Seed Data:', err.message);
  } finally {
    conn.release();
  }
};

// Cho phép chạy trực tiếp từ dòng lệnh
if (process.argv[1]?.endsWith('seedRunner.js')) {
  runSeed().then(() => process.exit(0)).catch(() => process.exit(1));
}
