import { pool } from './src/config/db.js';

const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTest() {
  console.log('========================================================');
  console.log('KIỂM THỬ TỰ ĐỘNG UC-10 (LỊCH SỬ BIẾN THIÊN) & UC-11 (XUẤT CSV)');
  console.log('========================================================\n');

  try {
    // 1. Đăng nhập tài khoản Quản Trị Viên để nhận Token JWT
    console.log('1. Đăng nhập Admin lấy token...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@soilwatch.vn',
        password: 'Admin@123'
      })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Đăng nhập thất bại: ' + loginData.message);
    const token = loginData.data.token;
    const authHeaders = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    console.log('   => Đăng nhập thành công, token:', token.substring(0, 20) + '...\n');

    // 2. Lấy danh sách trạm đo
    console.log('2. Lấy danh sách trạm đo...');
    const devRes = await fetch(`${BASE_URL}/devices`, { headers: authHeaders });
    const devData = await devRes.json();
    const devices = devData.data;
    if (!devices || devices.length === 0) {
      throw new Error('Chưa có trạm đo nào trong CSDL để thử nghiệm.');
    }
    const testDevice = devices[0];
    const deviceId = testDevice.id;
    console.log(`   => Chọn trạm test: ID #${deviceId} - "${testDevice.name}"\n`);

    // 3. Chuẩn bị dữ liệu mẫu 7 ngày trong quá khứ
    console.log('3. Nạp chuỗi dữ liệu 7 ngày kèm sự kiện bón phân...');
    const now = new Date();
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d);
    }

    // Xóa các bản ghi cũ của trạm này để test chính xác
    await pool.query('DELETE FROM readings WHERE device_id = ?', [deviceId]);
    await pool.query('DELETE FROM field_events WHERE device_id = ?', [deviceId]);

    // Chèn 7 ngày số đo tăng dần phản ánh bón thúc ngày thứ 4
    for (let i = 0; i < 7; i++) {
      const d = dates[i];
      const mysqlDate = d.toISOString().slice(0, 19).replace('T', ' ');
      // Giả lập: ngày 0-3 dinh dưỡng thấp, ngày 4 bón phân vọt lên, ngày 5-6 ổn định
      const n = i < 4 ? 70 + i * 2 : 110 - (i - 4) * 3;
      const p = i < 4 ? 40 + i * 1.5 : 65 - (i - 4) * 2;
      const k = i < 4 ? 120 + i * 2 : 160 - (i - 4) * 4;
      const ph = 6.2 + (i % 2 === 0 ? 0.1 : -0.1);
      const ec = i < 4 ? 580 + i * 15 : 750 - (i - 4) * 20;
      const temp = 26.5 + (i * 0.2);
      const moist = 68.0 - (i * 0.5);

      await pool.query(
        `INSERT INTO readings (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
         VALUES (?, ?, 'auto', ?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, mysqlDate, n, p, k, ph, ec, temp, moist]
      );
    }

    // Chèn sự kiện bón phân vào ngày thứ 4
    const fertDate = dates[4].toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO field_events (device_id, event_type, amount, unit, event_date, notes)
       VALUES (?, 'Bón thúc', 25.0, 'kg/sào', ?, 'Bón bổ sung NPK 16-16-8 đón đòng')`,
      [deviceId, fertDate]
    );
    console.log(`   => Đã nạp 7 bản ghi đo và 1 sự kiện bón phân ngày ${fertDate}.\n`);

    // 4. KIỂM THỬ UC-10: Tra cứu lịch sử biến thiên
    console.log('4. KIỂM THỬ UC-10 (GET /api/readings/history)...');
    const fromStr = dates[0].toISOString().slice(0, 10);
    const toStr = dates[6].toISOString().slice(0, 10);
    
    const histRes = await fetch(
      `${BASE_URL}/readings/history?deviceId=${deviceId}&fromDate=${fromStr}&toDate=${toStr}`,
      { headers: authHeaders }
    );
    const histData = await histRes.json();

    if (!histData.success) throw new Error('API History trả về success: false: ' + histData.message);
    const hist = histData.data;
    console.log(`   - Tổng số bản ghi tìm thấy: ${hist.totalReadings}`);
    console.log(`   - Số điểm vẽ biểu đồ: ${hist.readings.length}`);
    console.log(`   - Số sự kiện canh tác đồng bộ: ${hist.events.length}`);
    console.log(`   - Thống kê Đạm (N): Avg = ${hist.summary.n.avg}, Min = ${hist.summary.n.min}, Max = ${hist.summary.n.max}`);
    console.log(`   - Thống kê pH: Avg = ${hist.summary.ph.avg}, Min = ${hist.summary.ph.min}, Max = ${hist.summary.ph.max}`);
    
    if (hist.totalReadings !== 7) throw new Error(`Kỳ vọng 7 bản ghi nhưng nhận ${hist.totalReadings}`);
    if (hist.events.length !== 1) throw new Error(`Kỳ vọng 1 sự kiện bón phân nhưng nhận ${hist.events.length}`);
    console.log('   => [PASS] UC-10 hoạt động chính xác 100% theo sơ đồ luồng chính!\n');

    // 5. KIỂM THỬ UC-10 Alt 3a: Khoảng thời gian không có số đo
    console.log('5. KIỂM THỬ UC-10 Alt 3a (Khoảng ngày không có số đo)...');
    const emptyRes = await fetch(
      `${BASE_URL}/readings/history?deviceId=${deviceId}&fromDate=2020-01-01&toDate=2020-01-02`,
      { headers: authHeaders }
    );
    const emptyHist = await emptyRes.json();
    if (emptyHist.data.totalReadings === 0 && emptyHist.data.readings.length === 0) {
      console.log('   => [PASS] Trả về mảng rỗng chính xác theo kịch bản Alt 3a!\n');
    } else {
      throw new Error('Kịch bản Alt 3a thất bại: Không trả về mảng rỗng.');
    }

    // 6. KIỂM THỬ UC-11: Xuất báo cáo dữ liệu định dạng CSV
    console.log('6. KIỂM THỬ UC-11 (GET /api/readings/export-csv)...');
    const csvRes = await fetch(
      `${BASE_URL}/readings/export-csv?deviceId=${deviceId}&fromDate=${fromStr}&toDate=${toStr}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const contentDisposition = csvRes.headers.get('content-disposition') || '';
    console.log('   - Header Content-Disposition:', contentDisposition);
    if (!contentDisposition.includes('attachment; filename="BaoCao_SoDo_')) {
      throw new Error(`Tên file CSV không đúng chuẩn Table 22: ${contentDisposition}`);
    }

    const arrayBuf = await csvRes.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuf);
    const hasBom = rawBuffer[0] === 0xEF && rawBuffer[1] === 0xBB && rawBuffer[2] === 0xBF;
    console.log(`   - Kiểm tra mã UTF-8 BOM byte (EF BB BF): ${hasBom ? 'CÓ (Chuẩn Microsoft Excel)' : 'THIẾU'}`);
    if (!hasBom) throw new Error('Tệp CSV thiếu UTF-8 BOM!');

    const csvText = rawBuffer.toString('utf8');
    const lines = csvText.trim().split(/\r?\n/);
    console.log(`   - Số dòng trong tệp CSV: ${lines.length} (1 dòng tiêu đề + 7 dòng dữ liệu)`);
    console.log('   - Dòng tiêu đề:', lines[0].replace(/^\uFEFF/, ''));
    console.log('   - Dòng mẫu 1:', lines[1]);

    if (lines.length !== 8) {
      throw new Error(`Kỳ vọng 8 dòng (1 tiêu đề + 7 số đo) nhưng nhận ${lines.length}`);
    }
    console.log('   => [PASS] UC-11 kết xuất CSV UTF-8 BOM thành công 100%!\n');

    // 7. KIỂM THỬ UC-11 Alt 3a: Từ chối xuất nếu khoảng thời gian rỗng
    console.log('7. KIỂM THỬ UC-11 Alt 3a (Từ chối xuất khi không có số đo)...');
    const emptyCsvRes = await fetch(
      `${BASE_URL}/readings/export-csv?deviceId=${deviceId}&fromDate=2020-01-01&toDate=2020-01-02`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (emptyCsvRes.status === 404) {
      const errJson = await emptyCsvRes.json();
      console.log(`   => [PASS] Máy chủ từ chối xuất dữ liệu với mã 404: "${errJson.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng mã lỗi 404 nhưng nhận: ${emptyCsvRes.status}`);
    }

    console.log('========================================================');
    console.log('TẤT CẢ CÁC CA KIỂM THỬ UC-10 & UC-11 ĐÃ VƯỢT QUA 100%!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runTest();
