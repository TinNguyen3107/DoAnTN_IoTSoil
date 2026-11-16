import { pool } from './src/config/db.js';

const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTest() {
  console.log('========================================================');
  console.log('KIỂM THỬ TỰ ĐỘNG UC-15 (TƯ VẤN NPK) & UC-16 (GỢI Ý CÂY TRỒNG)');
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

    // 2. Lấy danh sách cây trồng và trạm đo
    console.log('2. Lấy danh mục cây trồng & trạm đo...');
    const cropsRes = await fetch(`${BASE_URL}/recommendations/crops`, { headers: authHeaders });
    const cropsData = await cropsRes.json();
    if (!cropsData.success || cropsData.data.length === 0) throw new Error('Không lấy được danh mục cây trồng');
    const riceCrop = cropsData.data[0]; // Cây lúa nước
    console.log(`   => Cây test: ID #${riceCrop.id} - ${riceCrop.name}`);

    const devRes = await fetch(`${BASE_URL}/devices`, { headers: authHeaders });
    const devData = await devRes.json();
    const testDeviceId = devData.data[0].id;
    console.log(`   => Trạm test: ID #${testDeviceId}\n`);

    // 3. Chuẩn bị số đo đất thiếu hụt dinh dưỡng (N=65, P=35, K=85, pH=6.2, EC=550)
    console.log('3. Nạp số đo đất thiếu hụt dinh dưỡng...');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      `INSERT INTO readings (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
       VALUES (?, ?, 'auto', 65.0, 35.0, 85.0, 6.2, 550, 26.5, 70.0)`,
      [testDeviceId, now]
    );

    // 4. KIỂM THỬ UC-15: Tư vấn phân bón cho diện tích 1 ha
    console.log('4. Kiểm thử UC-15 (Tư vấn liều lượng NPK cho 1 ha)...');
    const fertRes = await fetch(
      `${BASE_URL}/recommendations/fertilizer?deviceId=${testDeviceId}&cropId=${riceCrop.id}&area=1&unit=ha`,
      { headers: authHeaders }
    );
    const fertData = await fertRes.json();
    if (!fertData.success) throw new Error('Tư vấn phân bón thất bại: ' + fertData.message);
    const f = fertData.data;

    console.log(`   - Chênh lệch thiếu hụt: N = ${f.deltaNutrient.n} mg/kg, P = ${f.deltaNutrient.p} mg/kg, K = ${f.deltaNutrient.k} mg/kg`);
    console.log(`   - Khuyến nghị phân thương phẩm:`);
    console.log(`     + Urê (46% N): ${f.fertilizers.urea} kg/ha`);
    console.log(`     + Super Lân (16% P2O5): ${f.fertilizers.superPhosphate} kg/ha`);
    console.log(`     + Kali Clorua (60% K2O): ${f.fertilizers.potassiumChloride} kg/ha`);
    console.log(`   - Phân chia đợt bón:`);
    f.schedule.forEach(s => {
      console.log(`     * ${s.stage}: Urê ${s.urea} kg, Lân ${s.superPhosphate} kg, Kali ${s.potassiumChloride} kg`);
    });

    if (f.fertilizers.urea <= 0 || f.fertilizers.superPhosphate <= 0 || f.fertilizers.potassiumChloride <= 0) {
      throw new Error('Số liệu tính toán phân bón thương mại không hợp lệ');
    }
    console.log('   => [PASS] UC-15 tính toán định lượng phân bón chuẩn hóa thành công!\n');

    // 5. KIỂM THỬ UC-15 Alt 6a: Đất giàu dinh dưỡng vượt nhu cầu cây
    console.log('5. Kiểm thử UC-15 Alt 6a: Đất dư thừa dinh dưỡng (N=150, P=95, K=220)...');
    await pool.query(
      `INSERT INTO readings (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
       VALUES (?, ?, 'auto', 150.0, 95.0, 220.0, 6.2, 600, 26.5, 70.0)`,
      [testDeviceId, now]
    );

    const surplusRes = await fetch(
      `${BASE_URL}/recommendations/fertilizer?deviceId=${testDeviceId}&cropId=${riceCrop.id}&area=1&unit=ha`,
      { headers: authHeaders }
    );
    const surplusData = await surplusRes.json();
    const sf = surplusData.data;
    if (sf.isTotallySurplus && sf.fertilizers.urea === 0 && sf.fertilizers.superPhosphate === 0 && sf.fertilizers.potassiumChloride === 0) {
      console.log(`   => [PASS] Alt 6a: Phát hiện đất dư thừa, lượng bón = 0 kg: "${sf.adviceMessage}"\n`);
    } else {
      throw new Error('Kịch bản Alt 6a thất bại');
    }

    // 6. KIỂM THỬ UC-16: Gợi ý giống cây trồng phù hợp (Top 3)
    console.log('6. Kiểm thử UC-16 (Gợi ý Top 3 giống cây phù hợp)...');
    // Bơm số đo thổ nhưỡng bình thường (pH=6.2, EC=550, N=85, P=55, K=135)
    await pool.query(
      `INSERT INTO readings (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
       VALUES (?, ?, 'auto', 85.0, 55.0, 135.0, 6.2, 550, 26.5, 70.0)`,
      [testDeviceId, now]
    );

    const cropsRecRes = await fetch(
      `${BASE_URL}/recommendations/suitable-crops?deviceId=${testDeviceId}`,
      { headers: authHeaders }
    );
    const cropsRecData = await cropsRecRes.json();
    if (!cropsRecData.success) throw new Error('Gợi ý cây trồng thất bại');
    const cr = cropsRecData.data;

    console.log(`   - Tìm thấy ${cr.topCrops.length} giống cây trồng thích ứng tốt nhất (Điểm >= 50):`);
    cr.topCrops.forEach((c, idx) => {
      console.log(`     Top ${idx + 1}: ${c.name} (Điểm tương thích: ${c.score}/100)`);
      console.log(`       + Thuận lợi: ${c.pros.join('; ')}`);
    });

    if (cr.topCrops.length === 0 || cr.topCrops[0].score < 50) {
      throw new Error('Không tìm thấy cây phù hợp đạt chuẩn >= 50 điểm');
    }
    console.log('   => [PASS] UC-16 xếp hạng Top 3 cây trồng theo thuật toán Heuristic thành công!\n');

    // 7. KIỂM THỬ UC-16 Alt 4a: Đất bị chua phèn hoặc nhiễm mặn cực độ (pH 3.5, EC 1850)
    console.log('7. Kiểm thử UC-16 Alt 4a: Đất thoái hóa nặng (pH=3.5, EC=1850)...');
    await pool.query(
      `INSERT INTO readings (device_id, measured_at, mode, n, p, k, ph, ec, temperature, moisture)
       VALUES (?, ?, 'auto', 15.0, 10.0, 30.0, 3.5, 1850, 28.0, 50.0)`,
      [testDeviceId, now]
    );

    const badSoilRes = await fetch(
      `${BASE_URL}/recommendations/suitable-crops?deviceId=${testDeviceId}`,
      { headers: authHeaders }
    );
    const badSoilData = await badSoilRes.json();
    const bsr = badSoilData.data;

    if (bsr.needsSoilAmendment && bsr.topCrops.length === 0) {
      console.log(`   => [PASS] Alt 4a: Kích hoạt cảnh báo cải tạo đất trước khi xuống giống:`);
      console.log(`      "${bsr.amendmentAdvice}"\n`);
    } else {
      throw new Error('Kịch bản Alt 4a thất bại');
    }

    console.log('========================================================');
    console.log('TẤT CẢ CÁC CA KIỂM THỬ UC-15 & UC-16 ĐÃ VƯỢT QUA 100%!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runTest();
