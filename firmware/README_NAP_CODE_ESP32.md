# Hướng Dẫn Nạp Firmware Cho Phần Cứng ESP32

Tệp `esp32_agroprecision.ino` đã được tối ưu hóa để kết nối trực tiếp với hệ thống Backend Node.js (`http://<IP>:5000/api/readings/ingest`) theo cả 2 chế độ:
- **Trạm Cố Định (`IS_FIXED_NODE = true`)**: Tự động đồng bộ giờ NTP Việt Nam (GMT+7), đo định kỳ và đưa ESP32 vào Deep Sleep tiết kiệm pin.
- **Thiết bị Cầm Tay Dã Ngoại (`IS_FIXED_NODE = false`)**: Nhấn nút GPIO18 để đo, hiển thị trực tiếp lên màn hình OLED SSD1306; nếu khu vực ruộng mất sóng Wi-Fi, tự động lưu đệm tối đa 20 bản ghi vào bộ nhớ Flash NVS và tự động đẩy bù lên Web khi có Wi-Fi trở lại.

## 1. Thư viện cần cài đặt trong Arduino IDE
Mở Arduino IDE -> Vào `Tools -> Manage Libraries...` (hoặc `Sketch -> Include Library -> Manage Libraries`), tìm và cài đặt:
1. `Adafruit SSD1306`
2. `Adafruit GFX Library`
*(Các thư viện `WiFi.h`, `HTTPClient.h`, `Wire.h`, `time.h`, `Preferences.h` đã tích hợp sẵn trong gói ESP32 Board Core).*

## 2. Sơ đồ đấu nối phần cứng (Pinout)
- **Màn hình OLED I2C SSD1306:** SDA -> `GPIO21`, SCL -> `GPIO22`, VCC -> `3.3V`, GND -> `GND`
- **Module RS485 (MAX485):**
  - `RO` -> `GPIO16` (RX2)
  - `DI` -> `GPIO17` (TX2)
  - `DE` & `RE` nối chung -> `GPIO4`
  - `A`, `B` -> Dây tín hiệu RS485 của cảm biến đất NPK 7-in-1
- **Nút bấm đo thủ công:** 1 chân vào `GPIO18`, chân còn lại vào `GND`
- **LED trạng thái:** LED Xanh -> `GPIO19`, LED Đỏ -> `GPIO23`

## 3. Cấu hình trước khi bấm Upload
Mở `esp32_agroprecision.ino`, sửa 3 dòng ở đầu file (dòng 23-29):
1. `WIFI_SSID` & `WIFI_PASSWORD`: Tên và mật khẩu Wi-Fi cùng mạng với máy tính đang chạy server.
2. `SERVER_URL`: Mở CMD trên máy tính gõ `ipconfig` để lấy **IPv4 Address** (ví dụ `192.168.1.15`), điền thành:
   `const char* SERVER_URL = "http://192.168.1.15:5000/api/readings/ingest";`
3. `API_KEY`: Đăng nhập vào Web Admin -> **Quản lý trạm đo** -> Thêm trạm mới (hoặc nhấn **Cấp lại Key**) -> Sao chép chuỗi API Key 32 ký tự dán vào đây.
