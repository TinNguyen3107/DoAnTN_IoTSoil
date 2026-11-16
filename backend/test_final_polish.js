const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTest() {
  console.log('========================================================');
  console.log('KIỂM THỬ BỔ SUNG: SYSTEM CONFIGS & ESP32 DUAL PAYLOAD');
  console.log('========================================================\n');

  try {
    // 1. Đăng nhập Admin
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@soilwatch.vn', password: 'Admin@123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    const adminHeaders = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Test GET /api/system-configs
    console.log('1. Kiểm thử GET /api/system-configs...');
    const cfgRes = await fetch(`${BASE_URL}/system-configs`, { headers: adminHeaders });
    const cfgData = await cfgRes.json();
    if (!cfgData.success || !cfgData.data.map.UREA_N_PERCENT) {
      throw new Error('Không lấy được system_configs');
    }
    console.log('   => [PASS] Đọc cấu hình từ DB:', cfgData.data.map);

    // 3. Test PUT /api/system-configs (cập nhật và khôi phục)
    console.log('\n2. Kiểm thử PUT /api/system-configs (lưu vào MySQL)...');
    const updRes = await fetch(`${BASE_URL}/system-configs`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ UREA_N_PERCENT: 45, SOIL_BULK_DENSITY: 1.25 })
    });
    const updData = await updRes.json();
    if (!updData.success || updData.data.map.UREA_N_PERCENT !== 45) {
      throw new Error('Cập nhật system_configs thất bại');
    }
    console.log('   => [PASS] Đã cập nhật UREA_N_PERCENT = 45 vào MySQL');

    // Khôi phục mặc định
    await fetch(`${BASE_URL}/system-configs`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ UREA_N_PERCENT: 46, SOIL_BULK_DENSITY: 1.3 })
    });
    console.log('   => Đã khôi phục cấu hình mặc định (46%, 1.3 tấn/m3).');

    // 4. Test Ingest API hỗ trợ cả format cũ (nitrogen/phosphorus/potassium/humidity) lẫn chuẩn mới (n/p/k/moisture)
    console.log('\n3. Kiểm thử Ingest API với cả 2 định dạng payload từ phần cứng ESP32...');
    const rawApiKey = 'soil_sim_1_testkey1234567890';

    // Format A: Payload tên đầy đủ
    const resFull = await fetch(`${BASE_URL}/readings/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': rawApiKey
      },
      body: JSON.stringify({
        nitrogen: 88,
        phosphorus: 52,
        potassium: 145,
        ph: 6.3,
        ec: 620,
        temperature: 26.8,
        humidity: 70.5
      })
    });
    const dataFull = await resFull.json();
    if (!dataFull.success || dataFull.data.values.n !== 88 || dataFull.data.values.moisture !== 70.5) {
      throw new Error('Không parse được payload tên đầy đủ: ' + JSON.stringify(dataFull));
    }
    console.log('   => [PASS] Nhận diện chuẩn xác payload tên đầy đủ (nitrogen, humidity...)');

    // Format B: Payload chuẩn mới từ esp32_agroprecision.ino
    const resShort = await fetch(`${BASE_URL}/readings/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': rawApiKey
      },
      body: JSON.stringify({
        n: 92,
        p: 55,
        k: 150,
        ph: 6.4,
        ec: 640,
        temperature: 27.0,
        moisture: 71.2,
        mode: 'manual'
      })
    });
    const dataShort = await resShort.json();
    if (!dataShort.success || dataShort.data.values.n !== 92 || dataShort.data.values.moisture !== 71.2) {
      throw new Error('Không parse được payload chuẩn mới: ' + JSON.stringify(dataShort));
    }
    console.log('   => [PASS] Nhận diện chuẩn xác payload chuẩn mới (n, p, k, moisture, mode)');

    console.log('\n========================================================');
    console.log('TẤT CẢ KIỂM THỬ BỔ SUNG ĐÃ VƯỢT QUA 100%!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runTest();
