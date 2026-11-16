/**
 * ==============================================================
 * HỆ THỐNG IoT GIÁM SÁT CHẤT LƯỢNG ĐẤT — HARDWARE SIMULATOR
 * Mô phỏng 2 khâu thực tế:
 *   1. Tự động ghép nối phần cứng qua MAC (POST /api/devices/pair) cho trạm đang mở ghép nối
 *   2. Gửi gói tin số đo 7 thông số (POST /api/readings/ingest) cho trạm đang hoạt động
 * ==============================================================
 */

import http from 'http';
import crypto from 'crypto';
import { pool } from '../backend/src/config/db.js';

const API_HOST = '127.0.0.1';
const API_PORT = 5000;
const PAIR_PATH = '/api/devices/pair';
const INGEST_PATH = '/api/readings/ingest';

function randomRange(min, max, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round((min + Math.random() * (max - min)) * factor) / factor;
}

const SOIL_SCENARIOS = {
  OPTIMAL: {
    label: 'Đất Tốt Phì Nhiêu (Optimal)',
    generator: () => ({
      n: randomRange(75.0, 110.0, 1),
      p: randomRange(45.0, 65.0, 1),
      k: randomRange(120.0, 160.0, 1),
      ph: randomRange(6.0, 6.8, 1),
      ec: Math.round(randomRange(500, 850, 0)),
      temperature: randomRange(24.0, 28.5, 1),
      moisture: randomRange(60.0, 75.0, 1)
    })
  },
  ACIDIC: {
    label: 'Đất Chua Cần Khử Vôi (pH thấp)',
    generator: () => ({
      n: randomRange(40.0, 70.0, 1),
      p: randomRange(20.0, 35.0, 1),
      k: randomRange(60.0, 95.0, 1),
      ph: randomRange(4.0, 4.9, 1),
      ec: Math.round(randomRange(400, 700, 0)),
      temperature: randomRange(25.0, 29.0, 1),
      moisture: randomRange(55.0, 70.0, 1)
    })
  }
};

function postJson(path, payload, apiKey = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    const req = http.request({
      hostname: API_HOST,
      port: API_PORT,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('==============================================================');
  console.log('🌱 AGROPRECISION IoT — HARDWARE SIMULATOR (AUTO-PAIR + INGEST)');
  console.log('==============================================================\n');

  const macArgIndex = process.argv.indexOf('--mac');
  const explicitMac = macArgIndex !== -1 ? process.argv[macArgIndex + 1] : null;

  try {
    if (explicitMac) {
      console.log(`🔗 Đang ghép nối thiết bị có MAC: ${explicitMac}...`);
      const pairRes = await postJson(PAIR_PATH, { mac: explicitMac });
      if (pairRes.statusCode !== 200 || !pairRes.data?.data?.apiKey) {
        console.log(`❌ Ghép nối thất bại (HTTP ${pairRes.statusCode}): ${pairRes.data?.message || JSON.stringify(pairRes.data)}`);
        process.exit(1);
      }

      const paired = pairRes.data.data;
      console.log(`✅ Ghép nối thành công trạm "${paired.deviceName}" (${paired.hardwareMac})!`);
      console.log(`   🔑 API Key nhận được từ Server: ${paired.apiKey}`);

      const scenarioKey = paired.deviceType === 'fixed' ? 'OPTIMAL' : 'ACIDIC';
      const scenario = SOIL_SCENARIOS[scenarioKey];
      const payload = {
        ...scenario.generator(),
        mode: paired.deviceType === 'fixed' ? 'auto' : 'manual',
        measured_at: new Date().toISOString()
      };

      const ingestRes = await postJson(INGEST_PATH, payload, paired.apiKey);
      if (ingestRes.statusCode === 201) {
        console.log(`   📤 Đã gửi bản ghi đầu tiên (#${ingestRes.data.data?.readingId}) — ${scenario.label}`);
      } else {
        console.log(`   ⚠️ Gửi số đo thất bại (HTTP ${ingestRes.statusCode}): ${ingestRes.data?.message}`);
      }
      return;
    }

    const [devices] = await pool.query(
      'SELECT id, name, type, hardware_mac, provisioning_status, is_active FROM devices ORDER BY id ASC'
    );

    if (devices.length === 0) {
      console.log('❌ Chưa có thiết bị nào trong CSDL! Hãy tạo trạm trên giao diện Web trước.');
      process.exit(1);
    }

    console.log(`📡 Tìm thấy ${devices.length} trạm đo trong CSDL:`);
    devices.forEach((d, i) => {
      console.log(`   [${i + 1}] #${d.id} - ${d.name} (${d.hardware_mac || 'Không có MAC'}) [${d.provisioning_status}] [${d.is_active ? 'BẬT' : 'TẠM DỪNG'}]`);
    });

    console.log('\n--- TIẾN HÀNH GHÉP NỐI / GỬI SỐ ĐO ---');
    let sentCount = 0;

    for (const dev of devices) {
      let apiKeyToUse = null;

      if (dev.provisioning_status === 'pairing_open' && dev.hardware_mac) {
        console.log(`\n🔗 [PAIR] Đang ghép nối phần cứng MAC ${dev.hardware_mac} cho "${dev.name}"...`);
        const pairRes = await postJson(PAIR_PATH, { mac: dev.hardware_mac });
        if (pairRes.statusCode === 200 && pairRes.data?.data?.apiKey) {
          apiKeyToUse = pairRes.data.data.apiKey;
          console.log(`   ✅ Ghép nối thành công! Nhận API Key: ${apiKeyToUse}`);
        } else {
          console.log(`   ⚠️ Không ghép nối được (HTTP ${pairRes.statusCode}): ${pairRes.data?.message}`);
          continue;
        }
      } else if (dev.provisioning_status === 'active') {
        apiKeyToUse = `soil_sim_${dev.id}_testkey1234567890`;
        const testHash = crypto.createHash('sha256').update(apiKeyToUse).digest('hex');
        await pool.query('UPDATE devices SET api_key_hash = ? WHERE id = ?', [testHash, dev.id]);
      } else {
        console.log(`\n⏭️  [BỎ QUA] "${dev.name}" đang ở trạng thái "${dev.provisioning_status}" (chưa sẵn sàng đo).`);
        continue;
      }

      const scenarioKey = dev.type === 'fixed' ? 'OPTIMAL' : 'ACIDIC';
      const scenario = SOIL_SCENARIOS[scenarioKey];
      const payload = {
        ...scenario.generator(),
        mode: dev.type === 'fixed' ? 'auto' : 'manual',
        measured_at: new Date().toISOString()
      };

      console.log(`📤 [GỬI] ${dev.name} (${payload.mode.toUpperCase()}) — ${scenario.label}`);
      console.log(`   Số đo: N=${payload.n} | P=${payload.p} | K=${payload.k} mg/kg | pH=${payload.ph} | EC=${payload.ec} µS/cm | T=${payload.temperature}°C | H=${payload.moisture}%`);

      const res = await postJson(INGEST_PATH, payload, apiKeyToUse);
      if (res.statusCode === 201) {
        sentCount++;
        console.log(`   ✅ [THÀNH CÔNG] HTTP 201 — Bản ghi ID: #${res.data.data?.readingId}`);
      } else {
        console.log(`   ⚠️ [TỪ CHỐI] HTTP ${res.statusCode}: ${res.data?.message || JSON.stringify(res.data)}`);
      }
    }

    console.log('\n==============================================================');
    console.log(`🎉 HOÀN TẤT! Đã gửi số liệu cho ${sentCount} trạm sẵn sàng.`);
    console.log('==============================================================');
  } catch (err) {
    console.error('❌ Lỗi giả lập:', err.message);
  } finally {
    await pool.end();
  }
}

main();
