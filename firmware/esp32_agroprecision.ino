/**
 * =========================================================================================
 * AGROPRECISION IOT — FIRMWARE ĐO ĐẠC CHẤT LƯỢNG ĐẤT ĐA CHẾ ĐỘ (ESP32 / ESP32-S3)
 * =========================================================================================
 * Tính năng tích hợp:
 *  1. Giao tiếp cảm biến đất NPK 7-in-1 (RS485 Modbus RTU, Baudrate 9600).
 *  2. Hỗ trợ 2 chế độ hoạt động:
 *     - Fixed Node (IS_FIXED_NODE = true): Tự động đồng bộ giờ NTP, đo định kỳ & ngủ sâu Deep Sleep.
 *     - Handheld Node (IS_FIXED_NODE = false): Cầm tay bấm nút đo tức thì, xem kết quả trên OLED.
 *  3. Lưu đệm bộ nhớ Flash (NVS Preferences) khi mất sóng Wi-Fi ngoài đồng & tự động đồng bộ bù.
 *  4. Gửi gói tin JSON bảo mật qua Header "x-api-key" tới máy chủ Node.js (Port 5000).
 * =========================================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <time.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =========================================================================================
// 1. CẤU HÌNH THÔNG SỐ WI-FI, MÁY CHỦ & CHẾ ĐỘ THIẾT BỊ (CẦN ĐIỀN TRƯỚC KHI NẠP CODE)
// =========================================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";         // Thay bằng tên Wi-Fi của bạn
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";     // Thay bằng mật khẩu Wi-Fi

// Địa chỉ API tiếp nhận dữ liệu (Chạy local: thay bằng IP máy tính xem từ lệnh `ipconfig`)
const char* SERVER_URL    = "http://192.168.1.15:5000/api/readings/ingest";

// Sao chép chuỗi API Key 32 ký tự từ giao diện Web (Mục "Quản lý trạm đo -> Thêm trạm / Cấp lại Key")
const char* API_KEY       = "soil_sim_1_testkey1234567890";

// Chế độ hoạt động:
// - false: Thiết bị Cầm Tay Dã Ngoại (Chờ bấm nút GPIO18, tự động lưu Flash nếu mất Wi-Fi)
// - true : Trạm Cố Định (Đo tự động theo chu kỳ NTP, gửi server rồi ngủ sâu Deep Sleep)
const bool IS_FIXED_NODE        = false;
const uint64_t SLEEP_SECONDS    = 60 * 60; // Chu kỳ ngủ 1 giờ (3600 giây) cho Trạm Cố Định

// =========================================================================================
// 2. ĐỊNH NGHĨA CHÂN KẾT NỐI PHẦN CỨNG (PINOUT)
// =========================================================================================
// Màn hình OLED SSD1306 (I2C)
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define I2C_SDA_PIN   21
#define I2C_SCL_PIN   22
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Module RS485 MAX485 (UART2)
#define RS485_RX_PIN  16
#define RS485_TX_PIN  17
#define RS485_DE_RE   4

// Nút bấm vật lý & Đèn LED báo trạng thái
#define BUTTON_PIN    18
#define LED_GREEN_PIN 19
#define LED_RED_PIN   23

// Bộ nhớ NVS lưu đệm Offline (UC-06)
Preferences offlineStorage;
const int MAX_OFFLINE_RECORDS = 20;

// Cấu trúc 7 thông số thổ nhưỡng
struct SoilData {
  float temperature;  // °C
  float moisture;     // %
  uint16_t ec;        // µS/cm
  uint16_t n;         // Đạm (mg/kg)
  uint16_t p;         // Lân (mg/kg)
  uint16_t k;         // Kali (mg/kg)
  float ph;           // Scale 0-14
  bool isValid;
};

SoilData currentSoil;
unsigned long lastSyncCheck = 0;

// =========================================================================================
// 3. TIỆN ÍCH THỜI GIAN THỰC NTP (GMT+7 VIỆT NAM)
// =========================================================================================
String getIsoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 1000)) {
    return ""; // Chưa đồng bộ được NTP, server sẽ dùng giờ nhận gói tin
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(buf);
}

// =========================================================================================
// 4. TÍNH TOÁN CRC-16 MODBUS RTU & ĐỌC CẢM BIẾN ĐẤT NPK 7-IN-1
// =========================================================================================
uint16_t calculateModbusCRC(const uint8_t* buffer, uint8_t length) {
  uint16_t crc = 0xFFFF;
  for (uint8_t i = 0; i < length; i++) {
    crc ^= (uint16_t)buffer[i];
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x0001) crc = (crc >> 1) ^ 0xA001;
      else crc = crc >> 1;
    }
  }
  return crc;
}

bool readSoilSensor(SoilData &data) {
  const uint8_t SENSOR_ADDR = 0x02;
  const uint8_t FUNC_READ   = 0x03;
  const uint16_t START_REG  = 0x0000;
  const uint16_t REG_COUNT  = 0x0008;

  uint8_t requestFrame[8] = {
    SENSOR_ADDR,
    FUNC_READ,
    (uint8_t)((START_REG >> 8) & 0xFF),
    (uint8_t)(START_REG & 0xFF),
    (uint8_t)((REG_COUNT >> 8) & 0xFF),
    (uint8_t)(REG_COUNT & 0xFF),
    0, 0
  };

  uint16_t crc = calculateModbusCRC(requestFrame, 6);
  requestFrame[6] = crc & 0xFF;
  requestFrame[7] = (crc >> 8) & 0xFF;

  // Bật chế độ Phát
  digitalWrite(RS485_DE_RE, HIGH);
  delay(5);
  while (Serial2.available()) Serial2.read();

  Serial2.write(requestFrame, sizeof(requestFrame));
  Serial2.flush();

  // Chuyển về chế độ Thu
  digitalWrite(RS485_DE_RE, LOW);
  delay(5);

  const uint8_t EXPECTED_LEN = 21;
  uint8_t responseBuffer[32];
  uint8_t bytesRead = 0;
  unsigned long startTime = millis();

  while ((millis() - startTime < 1500) && (bytesRead < EXPECTED_LEN)) {
    if (Serial2.available()) {
      responseBuffer[bytesRead++] = Serial2.read();
    }
  }

  if (bytesRead < EXPECTED_LEN) {
    Serial.printf("[MODBUS] Timeout! Nhan duoc %d / %d bytes\n", bytesRead, EXPECTED_LEN);
    data.isValid = false;
    return false;
  }

  if (responseBuffer[0] != SENSOR_ADDR || responseBuffer[1] != FUNC_READ) {
    Serial.println("[MODBUS] Sai dia chi hoac ma ham phan hoi!");
    data.isValid = false;
    return false;
  }

  uint16_t receivedCRC = responseBuffer[EXPECTED_LEN - 2] | (responseBuffer[EXPECTED_LEN - 1] << 8);
  uint16_t calculatedCRC = calculateModbusCRC(responseBuffer, EXPECTED_LEN - 2);
  if (receivedCRC != calculatedCRC) {
    Serial.println("[MODBUS] Loi toan ven CRC!");
    data.isValid = false;
    return false;
  }

  // Giải mã thanh ghi theo chuẩn cảm biến 7in1/8in1 RS485
  int16_t rawTemp = (int16_t)((responseBuffer[3] << 8) | responseBuffer[4]);
  data.temperature = rawTemp / 10.0;

  uint16_t rawMoist = (responseBuffer[5] << 8) | responseBuffer[6];
  data.moisture = rawMoist / 10.0;

  data.ec = (responseBuffer[7] << 8) | responseBuffer[8];
  // Thanh ghi 3 (Byte 9,10) là Salinity
  data.n  = (responseBuffer[11] << 8) | responseBuffer[12];
  data.p  = (responseBuffer[13] << 8) | responseBuffer[14];
  data.k  = (responseBuffer[15] << 8) | responseBuffer[16];

  uint16_t rawPH = (responseBuffer[17] << 8) | responseBuffer[18];
  data.ph = rawPH / 10.0;
  data.isValid = true;

  Serial.printf("[SOIL] N:%u P:%u K:%u | pH:%.2f | EC:%u | T:%.1fC | Am:%.1f%%\n",
                data.n, data.p, data.k, data.ph, data.ec, data.temperature, data.moisture);
  return true;
}

// =========================================================================================
// 5. HIỂN THỊ MÀN HÌNH OLED SSD1306
// =========================================================================================
void showOLEDMessage(const String& l1, const String& l2, const String& l3 = "") {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 5);  display.println(l1);
  display.setCursor(0, 25); display.println(l2);
  if (l3.length() > 0) {
    display.setCursor(0, 45); display.println(l3);
  }
  display.display();
}

void showSoilDataOnOLED(const SoilData& d, bool synced) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(synced ? "AGRO IOT [CLOUD OK]" : "AGRO IOT [FLASH SAVED]");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  display.setCursor(0, 14);
  display.printf("T:%.1fC   Am:%.1f%%", d.temperature, d.moisture);
  display.setCursor(0, 26);
  display.printf("pH:%.2f  EC:%u", d.ph, d.ec);
  display.setCursor(0, 38);
  display.printf("N:%u  P:%u  K:%u", d.n, d.p, d.k);

  display.setCursor(0, 52);
  if (d.ph < 5.5)       display.print("Canh bao: Dat chua!");
  else if (d.ec > 800)  display.print("Canh bao: Nhiem man!");
  else                  display.print("Trang thai: Dat tot");

  display.display();
}

// =========================================================================================
// 6. ĐÓNG GÓI JSON, GỬI HTTP POST & BỘ NHỚ ĐỆM OFFLINE (FLASH NVS)
// =========================================================================================
String buildJsonPayload(const SoilData& d) {
  String modeStr = IS_FIXED_NODE ? "auto" : "manual";
  String ts = getIsoTimestamp();

  String json = "{";
  json += "\"n\":" + String(d.n) + ",";
  json += "\"p\":" + String(d.p) + ",";
  json += "\"k\":" + String(d.k) + ",";
  json += "\"ph\":" + String(d.ph, 2) + ",";
  json += "\"ec\":" + String(d.ec) + ",";
  json += "\"temperature\":" + String(d.temperature, 1) + ",";
  json += "\"moisture\":" + String(d.moisture, 1) + ",";
  json += "\"mode\":\"" + modeStr + "\"";
  if (ts.length() > 0) {
    json += ",\"measured_at\":\"" + ts + "\"";
  }
  json += "}";
  return json;
}

bool postJsonToCloud(const String& jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int httpCode = http.POST(jsonPayload);
  if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
    Serial.printf("[HTTP] Dong bo thanh cong! Ma: %d\n", httpCode);
    http.end();
    return true;
  } else {
    Serial.printf("[HTTP] Loi gui du lieu! Ma: %d\n", httpCode);
    http.end();
    return false;
  }
}

void saveToOfflineQueue(const String& jsonPayload) {
  offlineStorage.begin("soil_queue", false);
  int count = offlineStorage.getInt("count", 0);
  if (count >= MAX_OFFLINE_RECORDS) {
    Serial.println("[FLASH] Bo nho dem da day, ghi de ban ghi cu...");
    count = MAX_OFFLINE_RECORDS - 1;
  }
  String key = "rec_" + String(count);
  offlineStorage.putString(key.c_str(), jsonPayload);
  offlineStorage.putInt("count", count + 1);
  offlineStorage.end();
  Serial.printf("[FLASH] Da luu tam vao Flash (%d ban ghi cho dong bo).\n", count + 1);
}

void flushOfflineQueue() {
  if (WiFi.status() != WL_CONNECTED) return;

  offlineStorage.begin("soil_queue", false);
  int count = offlineStorage.getInt("count", 0);
  if (count == 0) {
    offlineStorage.end();
    return;
  }

  Serial.printf("[SYNC] Phat hien %d ban ghi Offline, dang dong bo bu...\n", count);
  int remaining = 0;
  for (int i = 0; i < count; i++) {
    String key = "rec_" + String(i);
    String payload = offlineStorage.getString(key.c_str(), "");
    if (payload.length() > 0) {
      if (!postJsonToCloud(payload)) {
        // Nếu vẫn lỗi mạng, giữ lại phần còn chưa gửi
        String keepKey = "rec_" + String(remaining++);
        offlineStorage.putString(keepKey.c_str(), payload);
      } else {
        delay(100);
      }
    }
  }
  offlineStorage.putInt("count", remaining);
  offlineStorage.end();
  if (remaining == 0) {
    Serial.println("[SYNC] Da dong bo bu 100% du lieu Offline len Server!");
  }
}

// =========================================================================================
// 7. CHU TRÌNH ĐO ĐẠC HOÀN CHỈNH
// =========================================================================================
void executeMeasurementCycle() {
  showOLEDMessage("DANG DO CAM BIEN...", "Doc RS485 Modbus", "Vui long cho...");
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);

  if (readSoilSensor(currentSoil)) {
    digitalWrite(LED_GREEN_PIN, HIGH);
    String payload = buildJsonPayload(currentSoil);
    bool synced = postJsonToCloud(payload);

    if (!synced) {
      // Mất Wi-Fi ngoài ruộng -> Lưu đệm Flash (UC-06)
      saveToOfflineQueue(payload);
    } else {
      // Đồng bộ luôn các bản ghi cũ nếu có
      flushOfflineQueue();
    }
    showSoilDataOnOLED(currentSoil, synced);
  } else {
    digitalWrite(LED_RED_PIN, HIGH);
    showOLEDMessage("[LOI CAM BIEN!]", "Kiem tra day RS485", "Nguon & Chan A/B");
  }
}

// =========================================================================================
// 8. SETUP & LOOP
// =========================================================================================
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(RS485_DE_RE, OUTPUT);
  digitalWrite(RS485_DE_RE, LOW);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);

  Serial2.begin(9600, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    showOLEDMessage("AGROPRECISION IOT", "Dang ket noi Wi-Fi...", WIFI_SSID);
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long startWait = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startWait < 8000) {
    delay(300);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Connected IP: ");
    Serial.println(WiFi.localIP());
    // Đồng bộ đồng hồ NTP múi giờ Việt Nam (GMT+7)
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
    flushOfflineQueue();
    showOLEDMessage("WIFI SAN SANG", WiFi.localIP().toString(), "Nhan nut de do...");
  } else {
    Serial.println("[WIFI] Che do Offline (Luu dem Flash).");
    showOLEDMessage("CHE DO OFFLINE", "Luu Flash khi mat mang", "Nhan nut de do...");
  }

  // Nếu là Trạm cố định (UC-07): Đo ngay 1 lần rồi vào Deep Sleep tiết kiệm pin
  if (IS_FIXED_NODE) {
    executeMeasurementCycle();
    Serial.printf("[DEEP SLEEP] Ngu %llu giay...\n", SLEEP_SECONDS);
    esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
    esp_deep_sleep_start();
  }
}

void loop() {
  // Kiểm tra nút bấm đo thủ công (UC-06)
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(50);
    if (digitalRead(BUTTON_PIN) == LOW) {
      executeMeasurementCycle();
      while (digitalRead(BUTTON_PIN) == LOW) delay(20);
      delay(400);
    }
  }

  // Mỗi 30 giây nếu có Wi-Fi trở lại thì tự động xả hàng đợi Flash
  if (millis() - lastSyncCheck > 30000) {
    lastSyncCheck = millis();
    if (WiFi.status() == WL_CONNECTED) {
      flushOfflineQueue();
    }
  }

  delay(20);
}
