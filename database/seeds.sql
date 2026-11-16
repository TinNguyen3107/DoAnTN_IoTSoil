-- ==============================================================
-- DỮ LIỆU KHỞI TẠO BAN ĐẦU (SEED DATA)
-- 2 tài khoản chuẩn hệ thống:
--   Admin: admin@gmail.com / admin123
--   User : user@gmail.com  / user123
-- ==============================================================

USE `soil_iot_db`;

-- 1. TÀI KHOẢN MẪU (2 tài khoản: 1 Admin, 1 User)
INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role`, `is_active`) VALUES
(1, 'admin@gmail.com', '$2a$10$SjFtXsk78AMEQKtTaONFIuQoj0Y5O/gk3cm6OZsuGNleCLrrcbm3K', 'Quản Trị Viên', 'admin', 1),
(2, 'user@gmail.com', '$2a$10$2XbvtvXMPJ.F4cGEKumH2.5fzW.o/pX4SnMeJRblh4YLXxF22ro6m', 'Người Dùng Nông Dân', 'user', 1)
ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`), `full_name` = VALUES(`full_name`), `role` = VALUES(`role`), `is_active` = VALUES(`is_active`);

-- 2. DẢI NGƯỠNG AN TOÀN MẶC ĐỊNH CHO THỔ NHƯỠNG (Tiêu chuẩn Nông nghiệp Việt Nam)
INSERT INTO `thresholds` (`parameter`, `low_limit`, `high_limit`, `owner_id`) VALUES
('ph', 5.5, 7.0, 1),
('ec', 300.0, 1200.0, 1),
('n', 50.0, 150.0, 1),
('p', 30.0, 80.0, 1),
('k', 80.0, 200.0, 1),
('temperature', 18.0, 35.0, 1),
('moisture', 50.0, 80.0, 1);

-- 3. DANH MỤC CÂY TRỒNG VÀ ĐỊNH MỨC N-P-K, pH CHUẨN
INSERT INTO `crops` (`name`, `n_min`, `n_max`, `p2o5_min`, `p2o5_max`, `k2o_min`, `k2o_max`, `ph_min`, `ph_max`, `ec_max`, `description`) VALUES
('Cây Lúa Nước (Giai đoạn đẻ nhánh - làm đòng)', 60.0, 120.0, 40.0, 80.0, 70.0, 140.0, 5.5, 6.8, 1200, 'Cây lương thực chủ lực, cần độ ẩm cao và tỷ lệ N-P-K cân đối'),
('Cây Ngô / Bắp', 70.0, 140.0, 50.0, 90.0, 80.0, 160.0, 5.8, 7.2, 1100, 'Nhu cầu Đạm và Lân cao ở giai đoạn trổ cờ'),
('Cây Cà Phê (Giai đoạn nuôi quả)', 80.0, 160.0, 45.0, 85.0, 100.0, 220.0, 5.2, 6.5, 1000, 'Cần hàm lượng Kali cao giúp chắc hạt và giữ nước mùa khô'),
('Cây Hồ Tiêu', 70.0, 130.0, 40.0, 75.0, 90.0, 180.0, 5.5, 6.5, 900, 'Rất mẫn cảm với úng nước và đất quá chua hoặc quá mặn'),
('Rau Ăn Lá (Cải, Xà lách, Rau muống)', 80.0, 150.0, 30.0, 60.0, 50.0, 110.0, 6.0, 7.0, 1000, 'Nhu cầu Đạm cao để phát triển sinh khối thân lá nhanh'),
('Cây Có Múi (Cam, Bưởi, Quýt)', 75.0, 145.0, 50.0, 90.0, 95.0, 200.0, 5.5, 6.8, 1100, 'Cần bón cân đối theo từng thời kỳ ra hoa và nuôi quả')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- 4. CẤU HÌNH HỆ THỐNG DÙNG CHO ENGINE TÍNH TOÁN PHÂN BÓN
INSERT INTO `system_configs` (`cfg_key`, `cfg_value`, `description`) VALUES
('UREA_N_PERCENT', '46', 'Hàm lượng N nguyên chất trong phân Urê (%)'),
('SUPER_PHOSPHATE_P_PERCENT', '16', 'Hàm lượng P2O5 trong phân Supe Lân (%)'),
('POTASSIUM_CHLORIDE_K_PERCENT', '60', 'Hàm lượng K2O trong phân Kali Clorua (%)'),
('SOIL_DEPTH_M', '0.2', 'Độ sâu tầng đất canh tác tiêu chuẩn (m)'),
('SOIL_BULK_DENSITY', '1.3', 'Dung trọng đất trung bình (tấn/m3)'),
('AREA_M2_PER_HA', '10000', 'Diện tích 1 héc-ta (m2)')
ON DUPLICATE KEY UPDATE `cfg_value` = VALUES(`cfg_value`);
