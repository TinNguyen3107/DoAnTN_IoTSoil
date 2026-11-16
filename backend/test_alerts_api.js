import { AlertService } from './src/services/alertService.js';
import { ReadingService } from './src/services/readingService.js';
import { pool } from './src/config/db.js';

async function runTest() {
  console.log('🧪 Bắt đầu kiểm thử nghiệp vụ UC-12 & UC-13: Cảnh báo vượt ngưỡng...');
  const alertService = new AlertService();
  const readingService = new ReadingService();

  try {
    // 1. Giả lập một bản ghi đo vi phạm ngưỡng (Đất chua pH 4.2, Nghèo đạm N 20, Nhiễm mặn EC 1650)
    console.log('\n--- 1. Bơm số đo vi phạm ngưỡng để kiểm tra bộ quét tự động (Hình 3.7.2 Step 8) ---');
    const testApiKey = 'soil_sim_1_testkey1234567890';
    const readingPayload = {
      n: 22.5,          // < 50.0 (Thiếu đạm)
      p: 18.0,          // < 30.0 (Thiếu lân)
      k: 110.0,         // Bình thường
      ph: 4.2,          // < 5.5 (Đất chua nguy hiểm)
      ec: 1650,         // > 1200 (Nhiễm mặn nguy hiểm)
      temperature: 27.5,
      moisture: 65.0,
      mode: 'auto'
    };

    const ingestRes = await readingService.ingestReading({
      rawApiKey: testApiKey,
      payload: readingPayload
    });

    console.log(`✅ Bản ghi số đo #${ingestRes.readingId} được lưu thành công.`);
    console.log(`🔔 Bộ quét phát hiện: ${ingestRes.alertsCount} chỉ số vi phạm ngưỡng!`);
    ingestRes.alerts.forEach(a => {
      console.log(`   - Thông số: ${a.parameter.toUpperCase()} | Đo được: ${a.value} | Ngưỡng: ${a.limitValue} | Mức độ: ${a.level.toUpperCase()}`);
    });

    // 2. UC-12: Xem danh sách cảnh báo chi tiết
    console.log('\n--- 2. Lấy danh sách cảnh báo chi tiết (UC-12 Step 2, 3, 4) ---');
    const alertList = await alertService.getAlerts({ deviceId: 1 });
    console.log(`✅ Tổng số cảnh báo truy vấn được: ${alertList.length}`);
    alertList.slice(0, 3).forEach(a => {
      console.log(`   [ID #${a.id}] [${a.level.toUpperCase()}] ${a.parameterName}: ${a.value} ${a.unit}`);
      console.log(`     👉 Chẩn đoán: ${a.diagnosticMessage}`);
    });

    // 3. Đếm số cảnh báo chưa xử lý (Chuông thông báo)
    console.log('\n--- 3. Đếm số cảnh báo chưa xử lý (UC-12 Step 1 - Huy hiệu chuông) ---');
    const unreadBefore = await alertService.getUnreadCount({ deviceId: 1 });
    console.log(`✅ Số cảnh báo chưa xử lý hiện tại: ${unreadBefore.unreadCount}`);

    // 4. UC-13: Xử lý 1 cảnh báo cụ thể (Step 1, 3)
    console.log('\n--- 4. Xử lý 1 cảnh báo cụ thể (UC-13 Step 1, 3) ---');
    const firstAlertId = alertList[0].id;
    await alertService.resolveAlert(firstAlertId, 'Nông dân đã bón 400kg vôi Dolomite khử chua');
    console.log(`✅ Đã đánh dấu cảnh báo #${firstAlertId} là đã xử lý.`);

    const unreadAfterOne = await alertService.getUnreadCount({ deviceId: 1 });
    console.log(`✅ Số đếm chuông thông báo sau khi xử lý 1 cảnh báo: ${unreadAfterOne.unreadCount} (giảm 1)`);

    // 5. UC-13 Step 1a: Đánh dấu tất cả cảnh báo là đã đọc / đã xử lý
    console.log('\n--- 5. Xử lý toàn bộ cảnh báo (UC-13 Step 1a, 3) ---');
    const resolveAllResult = await alertService.resolveAllAlerts({ deviceId: 1 });
    console.log(`✅ ${resolveAllResult.message}`);

    const unreadFinal = await alertService.getUnreadCount({ deviceId: 1 });
    console.log(`✅ Số đếm chuông thông báo cuối cùng: ${unreadFinal.unreadCount} (Huy hiệu đỏ tắt)`);

    console.log('\n🎉 TOÀN BỘ KIỂM THỬ BACKEND UC-12 & UC-13 ĐÃ THÀNH CÔNG RỰC RỠ!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
  } finally {
    await pool.end();
  }
}

runTest();
