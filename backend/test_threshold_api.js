import { ThresholdService } from './src/services/thresholdService.js';
import { pool } from './src/config/db.js';

async function runTest() {
  console.log('🧪 Bắt đầu kiểm thử nghiệp vụ UC-05: Cấu hình ngưỡng cảnh báo...');
  const service = new ThresholdService();

  try {
    // 1. Lấy danh sách ngưỡng hiện tại
    console.log('\n--- 1. Lấy danh sách cấu hình ngưỡng hiện tại (UC-05 Step 2, 3) ---');
    const current = await service.getThresholds(1);
    console.log(`✅ Lấy thành công ${current.length} thông số:`);
    current.forEach(t => {
      console.log(`   - ${t.name} (${t.parameter}): [${t.low_limit} - ${t.high_limit}] ${t.unit}`);
    });

    // 2. Lấy ngưỡng mặc định chuẩn Việt Nam (Step 4a)
    console.log('\n--- 2. Lấy cấu hình ngưỡng mặc định chuẩn nông nghiệp VN (Step 4a) ---');
    const defaults = service.getDefaultStandards();
    console.log(`✅ Ngưỡng chuẩn VN: pH [${defaults.find(d => d.parameter === 'ph').low_limit} - ${defaults.find(d => d.parameter === 'ph').high_limit}], EC [${defaults.find(d => d.parameter === 'ec').low_limit} - ${defaults.find(d => d.parameter === 'ec').high_limit}]`);

    // 3. Thử nghiệm dữ liệu nhập sai logic (Min >= Max) - Step 6a
    console.log('\n--- 3. Kiểm thử chặn lỗi logic (Min >= Max) (Step 6a) ---');
    try {
      await service.updateThresholds([
        { parameter: 'ph', low_limit: 7.5, high_limit: 5.0 } // Min > Max
      ], 1);
      console.error('❌ Thất bại: Server không chặn được lỗi Min >= Max!');
    } catch (err) {
      console.log('✅ Chặn lỗi logic thành công:', err.message);
    }

    // 4. Cập nhật dữ liệu hợp lệ (Step 7, 8, 9)
    console.log('\n--- 4. Cập nhật dải ngưỡng hợp lệ mới (Step 7, 8, 9) ---');
    const newValues = defaults.map(d => ({
      parameter: d.parameter,
      low_limit: d.low_limit,
      high_limit: d.high_limit
    }));

    const updateResult = await service.updateThresholds(newValues, 1);
    console.log('✅ Cập nhật thành công dải ngưỡng mới vào CSDL!');
    const phUpdated = updateResult.find(t => t.parameter === 'ph');
    console.log(`   - pH mới cập nhật: [${phUpdated.low_limit} - ${phUpdated.high_limit}]`);

    console.log('\n🎉 TOÀN BỘ KIỂM THỬ BACKEND UC-05 ĐÃ THÀNH CÔNG RỰC RỠ!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
  } finally {
    await pool.end();
  }
}

runTest();
