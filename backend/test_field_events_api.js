const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTest() {
  console.log('========================================================');
  console.log('KIỂM THỬ TỰ ĐỘNG UC-14: NHẬT KÝ CANH TÁC & BÓN PHÂN');
  console.log('========================================================\n');

  try {
    // 1. Đăng nhập Admin
    console.log('1. Đăng nhập tài khoản...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@soilwatch.vn', password: 'Admin@123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    const authHeaders = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    console.log('   => Đăng nhập thành công.\n');

    // 2. Lấy trạm đo để ghi nhật ký
    const devRes = await fetch(`${BASE_URL}/devices`, { headers: authHeaders });
    const devData = await devRes.json();
    const testDeviceId = devData.data[0].id;
    console.log(`2. Chọn trạm đo ID #${testDeviceId} để ghi nhật ký.\n`);

    // 3. Test Alt 6a: Ngày thực hiện ở tương lai (Phải bị từ chối)
    console.log('3. Kiểm thử Alt 6a: Nhập ngày ở tương lai (2099-01-01)...');
    const futureRes = await fetch(`${BASE_URL}/field-events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        deviceId: testDeviceId,
        eventType: 'Bón thúc',
        amount: 25.0,
        unit: 'kg/sào',
        eventDate: '2099-01-01',
        notes: 'Thử nghiệm nhập ngày tương lai'
      })
    });
    if (futureRes.status === 400) {
      const errJson = await futureRes.json();
      console.log(`   => [PASS] Alt 6a: Hệ thống từ chối ngày tương lai: "${errJson.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng mã lỗi 400 nhưng nhận: ${futureRes.status}`);
    }

    // 4. Test Luồng chính: Tạo sự kiện hợp lệ (Step 6, 7, 8, 9)
    console.log('4. Kiểm thử Luồng chính: Ghi nhận sự kiện canh tác hợp lệ...');
    const today = new Date().toISOString().slice(0, 10);
    const createRes = await fetch(`${BASE_URL}/field-events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        deviceId: testDeviceId,
        eventType: 'Bón thúc đợt 2',
        amount: 35.5,
        unit: 'kg/sào',
        eventDate: today,
        notes: 'Bón phân NPK 20-20-15 kết hợp tưới ẩm đất'
      })
    });
    const createData = await createRes.json();
    if (!createData.success) throw new Error('Tạo sự kiện thất bại: ' + createData.message);
    const createdId = createData.data.id;
    console.log(`   => [PASS] Đã lưu sự kiện ID #${createdId}: ${createData.data.eventType} - ${createData.data.amount} ${createData.data.unit}\n`);

    // 5. Test Lấy danh sách sự kiện (Step 2 & 3)
    console.log('5. Kiểm thử lấy danh sách sự kiện (GET /api/field-events)...');
    const listRes = await fetch(`${BASE_URL}/field-events?deviceId=${testDeviceId}`, { headers: authHeaders });
    const listData = await listRes.json();
    if (!listData.success) throw new Error('Lấy danh sách thất bại');
    const found = listData.data.find(e => e.id === createdId);
    if (!found) throw new Error('Không tìm thấy sự kiện vừa tạo trong danh sách');
    console.log(`   => [PASS] Đã nạp ${listData.data.length} sự kiện; tìm thấy sự kiện ID #${createdId}\n`);

    // 6. Test Alt 5a: Xóa sự kiện canh tác nhập sai
    console.log('6. Kiểm thử Alt 5a: Xóa sự kiện canh tác nhập sai...');
    const delRes = await fetch(`${BASE_URL}/field-events/${createdId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const delData = await delRes.json();
    if (!delData.success) throw new Error('Xóa sự kiện thất bại: ' + delData.message);
    console.log(`   => [PASS] Alt 5a: Đã xóa thành công sự kiện ID #${createdId}\n`);

    console.log('========================================================');
    console.log('TẤT CẢ CÁC CA KIỂM THỬ UC-14 ĐÃ VƯỢT QUA 100%!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runTest();
