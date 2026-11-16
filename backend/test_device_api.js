import { DeviceService } from './src/services/deviceService.js';
import { pool } from './src/config/db.js';

async function runTest() {
  console.log('🧪 Bắt đầu kiểm thử nghiệp vụ Chức năng 1.1 (UC-03 & UC-04)...');
  const service = new DeviceService();

  try {
    const suffix = Date.now().toString().slice(-4);
    // 1. Tạo Trạm đo cố định (Fixed Node)
    console.log('\n--- 1. Đăng ký Trạm đo cố định (Fixed Node) ---');
    const fixedNode = await service.registerDevice({
      name: `Trạm Cố Định Test #${suffix}`,
      type: 'fixed',
      ownerId: 1
    });
    console.log('✅ Đăng ký thành công:', fixedNode.device.name);
    console.log('🔑 API Key bản rõ (cấp cho ESP32):', fixedNode.apiKey);
    console.log('🔒 API Key Hash lưu CSDL:', fixedNode.device.api_key_hash);

    // 2. Tạo Thiết bị đo cầm tay (Handheld Node)
    console.log('\n--- 2. Đăng ký Thiết bị đo cầm tay (Handheld Node) ---');
    const handheldNode = await service.registerDevice({
      name: `Máy Đo Cầm Tay Test #${suffix}`,
      type: 'handheld',
      ownerId: 1
    });
    console.log('✅ Đăng ký thành công:', handheldNode.device.name);
    console.log('🔑 API Key bản rõ (nạp cấu hình máy):', handheldNode.apiKey);

    // 3. Kiểm tra danh sách thiết bị
    console.log('\n--- 3. Lấy danh sách thiết bị ---');
    const allDevices = await service.getAllDevices(1);
    console.log(`✅ Tổng số thiết bị trong hệ thống: ${allDevices.length}`);
    allDevices.forEach(d => {
      console.log(`   - [ID: ${d.id}] [${d.type.toUpperCase()}] ${d.name} (Active: ${d.is_active ? 'ON' : 'OFF'})`);
    });

    // 4. Kiểm tra Cấp lại khóa (Regenerate API Key) - UC-04
    console.log('\n--- 4. Kiểm tra Cấp lại API Key (Regenerate Key) ---');
    const regenResult = await service.regenerateApiKey(fixedNode.device.id);
    console.log(`✅ Khóa mới cho trạm [${regenResult.deviceName}]:`, regenResult.newApiKey);

    // 5. Kiểm tra Tạm khóa và Kích hoạt lại
    console.log('\n--- 5. Kiểm tra Tạm khóa thiết bị ---');
    await service.toggleStatus(fixedNode.device.id, 0);
    console.log('✅ Đã tạm khóa trạm cố định');

    console.log('\n🎉 TOÀN BỘ KIỂM THỬ CHỨC NĂNG 1.1 THÀNH CÔNG RỰC RỠ!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
  } finally {
    await pool.end();
  }
}

runTest();
