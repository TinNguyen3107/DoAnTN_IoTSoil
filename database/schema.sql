-- ==============================================================
-- HỆ THỐNG IoT GIÁM SÁT ĐA CHẾ ĐỘ CHẤT LƯỢNG ĐẤT VÀ TỐI ƯU PHÂN BÓN
-- DATABASE SCHEMA (MySQL 8.0+)
-- ==============================================================

CREATE DATABASE IF NOT EXISTS `soil_iot_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `soil_iot_db`;

-- 1. BẢNG NGƯỜI DÙNG (users)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(120) NOT NULL UNIQUE,
  `password_hash` CHAR(60) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG THIẾT BỊ / TRẠM ĐO (devices)
-- Hỗ trợ 2 chế độ thiết bị: 'fixed' (cố định) và 'handheld' (cầm tay)
CREATE TABLE IF NOT EXISTS `devices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('fixed', 'handheld') NOT NULL,
  `device_code` VARCHAR(32) NULL UNIQUE COMMENT 'Mã định danh phần cứng (VD: AGRO-F-7K9M2P)',
  `hardware_mac` VARCHAR(32) NULL UNIQUE COMMENT 'Địa chỉ MAC hoặc mã chip ESP32 (VD: A4:CF:12:88:9B:01)',
  `api_key_hash` CHAR(64) NOT NULL UNIQUE,
  `owner_id` INT NULL,
  `claim_pin` VARCHAR(12) NULL COMMENT 'Mã PIN kích hoạt 6 số cho trạm xuất xưởng kho',
  `provisioning_status` ENUM('pending_approval', 'awaiting_activation', 'pairing_open', 'active', 'rejected', 'unclaimed') NOT NULL DEFAULT 'active',
  `activation_code` VARCHAR(12) NULL COMMENT 'Mã kích hoạt 6 số Admin cấp sau khi duyệt yêu cầu',
  `pairing_expires_at` DATETIME NULL COMMENT 'Thời hạn đóng cửa sổ ghép nối tự động qua MAC',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `last_online` DATETIME NULL,
  `claimed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_devices_owner` FOREIGN KEY (`owner_id`) 
    REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX `idx_devices_type` (`type`),
  INDEX `idx_devices_active` (`is_active`),
  INDEX `idx_devices_prov_status` (`provisioning_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2b. BẢNG YÊU CẦU CẤP TRẠM & CẤP LẠI KHÓA (device_requests)
CREATE TABLE IF NOT EXISTS `device_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `device_id` INT NULL,
  `user_id` INT NOT NULL,
  `request_type` ENUM('new_device', 'rekey') NOT NULL,
  `hardware_mac` VARCHAR(32) NOT NULL,
  `requested_name` VARCHAR(100) NOT NULL,
  `device_type` ENUM('fixed', 'handheld') NOT NULL,
  `reason` VARCHAR(255) NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `activation_code` VARCHAR(12) NULL,
  `admin_note` VARCHAR(255) NULL,
  `resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_dev_req_device` FOREIGN KEY (`device_id`)
    REFERENCES `devices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dev_req_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_dev_req_status` (`status`),
  INDEX `idx_dev_req_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG CẤU HÌNH NGƯỠNG CẢNH BÁO (thresholds)
CREATE TABLE IF NOT EXISTS `thresholds` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `parameter` VARCHAR(30) NOT NULL, -- 'n', 'p', 'k', 'ph', 'ec', 'temperature', 'moisture'
  `low_limit` DECIMAL(6,1) NOT NULL,
  `high_limit` DECIMAL(6,1) NOT NULL,
  `owner_id` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_thresholds_owner` FOREIGN KEY (`owner_id`) 
    REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_thresholds_param` (`parameter`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG BẢN GHI SỐ ĐO THỔ NHƯỠNG (readings)
CREATE TABLE IF NOT EXISTS `readings` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `device_id` INT NOT NULL,
  `measured_at` DATETIME NOT NULL,
  `mode` ENUM('auto', 'manual') NOT NULL,
  `n` DECIMAL(5,1) NOT NULL COMMENT 'Đạm (mg/kg)',
  `p` DECIMAL(5,1) NOT NULL COMMENT 'Lân (mg/kg)',
  `k` DECIMAL(5,1) NOT NULL COMMENT 'Kali (mg/kg)',
  `ph` DECIMAL(3,1) NOT NULL COMMENT 'Độ chua pH',
  `ec` INT NOT NULL COMMENT 'Độ dẫn điện (uS/cm)',
  `temperature` DECIMAL(4,1) NOT NULL COMMENT 'Nhiệt độ (độ C)',
  `moisture` DECIMAL(4,1) NOT NULL COMMENT 'Độ ẩm đất (%)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_readings_device` FOREIGN KEY (`device_id`) 
    REFERENCES `devices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_readings_device_time` (`device_id`, `measured_at`),
  INDEX `idx_readings_mode` (`mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG CẢNH BÁO VƯỢT NGƯỠNG (alerts)
CREATE TABLE IF NOT EXISTS `alerts` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `reading_id` BIGINT NULL,
  `device_id` INT NOT NULL,
  `parameter` VARCHAR(30) NOT NULL,
  `level` ENUM('warning', 'danger') NOT NULL,
  `value` DECIMAL(6,1) NOT NULL,
  `limit_value` DECIMAL(6,1) NOT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_resolved` BOOLEAN NOT NULL DEFAULT FALSE,
  `action_taken` VARCHAR(255) NULL,
  `resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_alerts_reading` FOREIGN KEY (`reading_id`) 
    REFERENCES `readings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_alerts_device` FOREIGN KEY (`device_id`) 
    REFERENCES `devices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_alerts_read` (`is_read`),
  INDEX `idx_alerts_device` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG NHẬT KÝ CANH TÁC & BÓN PHÂN (field_events)
CREATE TABLE IF NOT EXISTS `field_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `device_id` INT NOT NULL,
  `event_type` VARCHAR(80) NOT NULL COMMENT 'Bón lót, Bón thúc, Rửa mặn, Bón vôi, Tưới ẩm...',
  `amount` DECIMAL(6,1) NOT NULL,
  `unit` VARCHAR(20) NOT NULL COMMENT 'kg/ha, kg/sào, tấn/ha...',
  `event_date` DATE NOT NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_events_device` FOREIGN KEY (`device_id`) 
    REFERENCES `devices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_events_device_date` (`device_id`, `event_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. BẢNG DANH MỤC CÂY TRỒNG VÀ ĐỊNH MỨC DINH DƯỠNG (crops)
CREATE TABLE IF NOT EXISTS `crops` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(80) NOT NULL UNIQUE,
  `n_min` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Đạm min (mg/kg)',
  `n_max` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Đạm max (mg/kg)',
  `p2o5_min` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Lân P2O5 min (mg/kg)',
  `p2o5_max` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Lân P2O5 max (mg/kg)',
  `k2o_min` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Kali K2O min (mg/kg)',
  `k2o_max` DECIMAL(6,1) NOT NULL COMMENT 'Nhu cầu Kali K2O max (mg/kg)',
  `ph_min` DECIMAL(3,1) NOT NULL,
  `ph_max` DECIMAL(3,1) NOT NULL,
  `ec_max` INT NOT NULL DEFAULT 1200 COMMENT 'Độ mặn tối đa chịu được (uS/cm)',
  `description` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BẢNG CẤU HÌNH THÔNG SỐ TOÀN HỆ THỐNG (system_configs)
CREATE TABLE IF NOT EXISTS `system_configs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cfg_key` VARCHAR(50) NOT NULL UNIQUE,
  `cfg_value` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
