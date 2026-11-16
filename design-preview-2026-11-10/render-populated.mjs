// Visual check of the redesigned screens with realistic payloads injected in the
// browser only. No request to /api with a write method is stubbed or sent, so the
// project database stays exactly as it is.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'app-screens-populated');
const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const appUrl = 'http://127.0.0.1:3000/';
const accounts = {
  admin: { email: 'admin@gmail.com', password: 'admin123' },
  farmer: { email: 'user@gmail.com', password: 'user123' },
};

await fs.mkdir(outDir, { recursive: true });

const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const iso = (offsetMinutes) => {
  const d = new Date(now.getTime() - offsetMinutes * 60 * 1000);
  return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

const devices = [
  { id: 1, name: 'Trạm Đồng Ruộng A1', type: 'fixed', is_active: 1, owner_name: 'Nguyễn Văn Bình', last_online: iso(4), total_readings: 428 },
  { id: 2, name: 'Trạm Cầm tay Khe Suối', type: 'handheld', is_active: 1, owner_name: 'Nguyễn Văn Bình', last_online: iso(180), total_readings: 96 },
  { id: 3, name: 'Trạm Nhà Lưới B2', type: 'fixed', is_active: 0, owner_name: 'Trần Thị Hòa', last_online: iso(2880), total_readings: 51 },
];

const mkReading = (offsetMinutes, i, mode) => ({
  id: 1000 + i,
  device_id: 1,
  measured_at: iso(offsetMinutes),
  mode,
  n: Number((58 + Math.sin(i / 3) * 14).toFixed(1)),
  p: Number((41 + Math.cos(i / 4) * 9).toFixed(1)),
  k: Number((126 + Math.sin(i / 5) * 22).toFixed(1)),
  ph: Number((6.3 + Math.sin(i / 6) * 0.5).toFixed(2)),
  ec: Math.round(640 + Math.cos(i / 3) * 180),
  temperature: Number((26 + Math.sin(i / 4) * 3.4).toFixed(1)),
  moisture: Number((66 + Math.cos(i / 5) * 9).toFixed(1)),
});

const latest = { ...mkReading(4, 0, 'auto'), device_name: 'Trạm Đồng Ruộng A1', device_type: 'fixed' };

// 40 bản ghi cách nhau 8 giờ, phủ 13 ngày gần nhất
const historyReadings = [];
for (let i = 0; i < 40; i += 1) historyReadings.push(mkReading(i * 480, i, i % 5 === 0 ? 'manual' : 'auto'));

const summary = {
  n: { min: 44.1, max: 72.0, avg: 58.4, latest: 61.2 },
  p: { min: 32.4, max: 50.1, avg: 41.7, latest: 43.9 },
  k: { min: 104.2, max: 148.6, avg: 126.3, latest: 131.8 },
  ph: { min: 5.81, max: 6.79, avg: 6.31, latest: 6.44 },
  ec: { min: 462, max: 820, avg: 641, latest: 702 },
  temperature: { min: 22.6, max: 29.4, avg: 26.1, latest: 27.3 },
  moisture: { min: 57.1, max: 75.0, avg: 66.4, latest: 68.2 },
};

const events = [
  { id: 1, eventType: 'Bón lót urê', amount: 24, unit: 'kg', eventDate: dateKey(new Date(now.getTime() - 6 * 864e5)), notes: 'Bón trước gieo xạ 3 ngày, vùi lấp ngay sau bón.', deviceId: 1, deviceName: 'Trạm Đồng Ruộng A1', deviceType: 'fixed' },
  { id: 2, eventType: 'Tưới thúc NPK', amount: 18, unit: 'kg', eventDate: dateKey(new Date(now.getTime() - 3 * 864e5)), notes: 'Hòa loãng tưới gốc vào buổi chiều mát.', deviceId: 1, deviceName: 'Trạm Đồng Ruộng A1', deviceType: 'fixed' },
  { id: 3, eventType: 'Bón vôi cải tạo', amount: 300, unit: 'kg', eventDate: dateKey(new Date(now.getTime() - 1 * 864e5)), notes: 'Nâng pH với lô đất chua nhẹ.', deviceId: 2, deviceName: 'Trạm Cầm tay Khe Suối', deviceType: 'handheld' },
];

const history = {
  device: { id: 1, name: devices[0].name, type: 'fixed' },
  range: { fromDate: dateKey(new Date(now.getTime() - 13 * 864e5)), toDate: dateKey(now) },
  totalReadings: historyReadings.length,
  isDownsampled: false,
  readings: historyReadings.map(r => {
    const d = new Date(r.measured_at.replace(' ', 'T'));
    return { ...r, timeLabel: `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`, dateOnly: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, isoDate: dateKey(d) };
  }),
  events,
  summary,
};

const alerts = [
  { id: 11, parameterName: 'Độ chua (pH)', value: 5.32, limitValue: 5.5, unit: '', level: 'warning', diagnosticMessage: 'pH thấp hơn ngưỡng dưới, đất đang chua. Kiểm tra lại liều lượng vôi và nguồn nước tưới.', deviceName: 'Trạm Đồng Ruộng A1', deviceType: 'fixed', isResolved: 0, actionTaken: null, createdAt: iso(320) },
  { id: 12, parameterName: 'Đạm (N)', value: 38.4, limitValue: 50, unit: 'mg/kg', level: 'critical', diagnosticMessage: 'Hàm lượng đạm dưới ngưỡng, cây có dấu hiệu thiếu đạm. Cân nhắc bón thúc theo định mức khuyến nghị.', deviceName: 'Trạm Cầm tay Khe Suối', deviceType: 'handheld', isResolved: 0, actionTaken: null, createdAt: iso(1500) },
  { id: 13, parameterName: 'Độ dẫn điện (EC)', value: 1320, limitValue: 1200, unit: 'µS/cm', level: 'warning', diagnosticMessage: 'EC vượt ngưỡng, có thể do bón phân dư hoặc nước nhiễm mặn.', deviceName: 'Trạm Nhà Lưới B2', deviceType: 'fixed', isResolved: 1, actionTaken: 'Đã tưới rửa mặn và theo dõi lại sau 24 giờ.', createdAt: iso(4300) },
];

const crops = [
  { id: 1, name: 'Lúa', n_min: 60, n_max: 90, p2o5_min: 40, p2o5_max: 60, k2o_min: 100, k2o_max: 140, ph_min: 5.5, ph_max: 6.5, ec_max: 1200 },
  { id: 2, name: 'Ngô', n_min: 70, n_max: 100, p2o5_min: 45, p2o5_max: 65, k2o_min: 110, k2o_max: 150, ph_min: 5.6, ph_max: 7.0, ec_max: 1300 },
  { id: 3, name: 'Rau cải', n_min: 50, n_max: 80, p2o5_min: 35, p2o5_max: 55, k2o_min: 90, k2o_max: 130, ph_min: 6.0, ph_max: 7.0, ec_max: 1000 },
];

const fertilizer = {
  currentValues: { n: 58.4, p: 41.7, k: 126.3 },
  targetValues: { n: 75, p2o5: 50, k2o: 120 },
  fertilizers: { urea: 18.6, superPhosphate: 10.2, potassiumChloride: 0 },
  isTotallySurplus: false,
  adviceMessage: 'Khuyến nghị bổ sung phân bón cân đối cho diện tích 1.0 ha nhằm đạt năng suất tối ưu cho Lúa.',
  schedule: [
    { stage: 'Bón lót', timing: 'Trước gieo 3 ngày', urea: 0, superPhosphate: 10.2, potassiumChloride: 0, notes: 'Toàn bộ lân bón lót để bộ rễ hấp thụ sớm.' },
    { stage: 'Bón thúc đợt 1', timing: 'Sau gieo 18-22 ngày', urea: 9.3, superPhosphate: 0, potassiumChloride: 0, notes: 'Phát triển thân lá, kết hợp nhổ cỏ.' },
    { stage: 'Bón thúc đợt 2', timing: 'Sau gieo 40-45 ngày', urea: 9.3, superPhosphate: 0, potassiumChloride: 0, notes: 'Nuôi đòng, giảm nguy cơ đổ ngã.' },
  ],
};

const suitable = {
  currentSoil: { ph: 6.44, ec: 702, n: 61.2, p: 43.9, k: 131.8 },
  needsSoilAmendment: false,
  amendmentAdvice: '',
  topCrops: [
    { id: 1, name: 'Lúa', score: 88, pros: ['pH nằm trong dải sinh trưởng tối ưu', 'Đạm và kali sát ngưỡng nhu cầu', 'EC thấp, không rủi ro mặn'], cons: ['Cần bổ sung đạm bón thúc để đạt năng suất cao nhất.'] },
    { id: 2, name: 'Ngô', score: 74, pros: ['Đất đủ kali cho giai đoạn nuôi trái', 'Kết cấu thoát nước tốt'], cons: ['Nhu cầu đạm cao hơn hiện trạng đất', 'Nhạy với hạn trong giai đoạn trổ cờ.'] },
    { id: 3, name: 'Rau cải', score: 61, pros: ['Cần ít phân kali hơn cây lương thực'], cons: ['Độ chua hơi thấp cho nhóm rau ăn lá', 'Nhạy cảm với EC cao sau khi bón thúc.'] },
  ],
};

const stubs = [
  [/\/api\/devices(\?|$)/, () => devices],
  [/\/api\/readings\/latest/, () => latest],
  [/\/api\/readings\/history/, () => history],
  [/\/api\/alerts\/unread-count/, () => ({ unreadCount: alerts.filter(a => !a.isResolved).length })],
  [/\/api\/alerts\?unreadOnly=true&limit=5/, () => alerts.filter(a => !a.isResolved).slice(0, 5)],
  [/\/api\/alerts(\?|$)/, () => alerts],
  [/\/api\/field-events/, () => events],
  [/\/api\/recommendations\/crops/, () => crops],
  [/\/api\/recommendations\/fertilizer/, () => fertilizer],
  [/\/api\/recommendations\/suitable-crops/, () => suitable],
];

const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(root, '.pop-browser-profile')}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const problems = [];
const shots = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  const browserSocket = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('browser start timeout')), 30000);
    const onData = d => { const m = d.toString().match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timeout); resolve(m[1]); } };
    browser.stderr.on('data', onData);
    browser.on('error', reject);
    browser.on('exit', c => { clearTimeout(timeout); reject(new Error('browser exited ' + c)); });
  });

  const socket = new WebSocket(browserSocket);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });

  let nextId = 0; const pending = new Map(); const handlers = [];
  socket.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
    if (msg.method) handlers.forEach(h => h(msg));
    if (msg.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') problems.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p = {}) => send(m, p, sessionId);
  await call('Page.enable'); await call('Runtime.enable');

  await call('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:3000/api/*', requestStage: 'Request' }] });
  handlers.push(msg => {
    if (msg.method !== 'Fetch.requestPaused' || msg.sessionId !== sessionId) return;
    const { requestId, request } = msg.params;
    const match = request.method === 'GET' ? stubs.find(([re]) => re.test(request.url)) : null;
    if (match) {
      const body = Buffer.from(JSON.stringify({ success: true, data: match[1]() }), 'utf8').toString('base64');
      call('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body,
      }).catch(() => {});
    } else {
      call('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  });

  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  const ready = `new Promise(resolve => { if (document.readyState === 'complete') return resolve(); window.addEventListener('load', resolve, { once: true }); })`;

  async function setViewport(width, height, mobile) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async function capture(name) {
    const png = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(outDir, `${name}.png`), Buffer.from(png.data, 'base64'));
    const audit = await evaluate(`(() => {
      const de = document.documentElement, body = document.body;
      const txt = body.innerText || '';
      const h1 = document.querySelector('h1')?.innerText || '';
      return { h1: h1.slice(0, 70), chars: txt.length, mojibake: txt.includes('\\uFFFD'),
        horizontalOverflow: de.scrollWidth - de.clientWidth,
        rows: document.querySelectorAll('.data-table tbody tr').length,
        charts: document.querySelectorAll('.recharts-line-curve').length,
        oldTokens: [...de.querySelectorAll('[class*="rounded-card"],[class*="shadow-subtle"]')].length };
    })()`);
    shots.push({ name, ...audit });
    console.log(`${name.padEnd(26)} h1="${audit.h1}" rows=${audit.rows} lines=${audit.charts} chars=${audit.chars} ovf=${audit.horizontalOverflow}`);
    return audit;
  }

  for (const [role, acc] of Object.entries(accounts)) {
    await setViewport(1440, 900, false);
    await call('Page.navigate', { url: appUrl });
    await evaluate(ready);
    await wait(600);
    await evaluate(`(async () => {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(acc)}) });
      const json = await res.json();
      localStorage.setItem('agro_token', json.data.token);
      localStorage.setItem('agro_user', JSON.stringify(json.data.user));
      return json.success;
    })()`);
    await call('Page.navigate', { url: appUrl });
    await evaluate(ready);
    await wait(2200);
    await capture(`${role}-00-landing`);

    const labels = await evaluate(`[...document.querySelectorAll('.app-sidebar .nav-item')].map(n => n.innerText.trim().replace(/\\s+/g, ' '))`);
    for (let i = 0; i < labels.length; i += 1) {
      await evaluate(`document.querySelectorAll('.app-sidebar .nav-item')[${i}]?.click()`);
      await wait(1600);
      await capture(`${role}-${pad(i)}-${labels[i].replace(/[^\p{L}\p{N}]+/gu, '-')}`);
    }

    // sub-tab: Gợi ý cây trồng trong trang Tư vấn
    if (role === 'admin') {
      await evaluate(`(() => { const b=[...document.querySelectorAll('.app-sidebar .nav-item')].find(n=>/Tư vấn/.test(n.textContent)); b && b.click(); return !!b; })()`);
      await wait(1600);
      const switched = await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Gợi ý cây trồng/.test(x.textContent)); if(!b) return 'missing'; b.click(); return 'clicked'; })()`);
      await wait(1500);
      console.log(`crops sub-tab -> ${switched}`);
      await capture('admin-crops-subtab');
      const advice = await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/Tính phân bón cho/.test(x.textContent)); if(!b) return 'missing'; b.click(); return 'clicked'; })()`);
      await wait(1600);
      console.log(`crop -> fertilizer handoff -> ${advice}`);
      await capture('admin-crop-to-fertilizer');

      // surplus branch
      const surplus = await evaluate(`(() => {
        const sel = document.getElementById('rec-crop');
        if (!sel) return 'no crop select';
        sel.value = '2'; sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 'set';
      })()`);
      console.log('crop change ->', surplus);
      await wait(1500);
      await capture('admin-fertilizer-crop-change');

      // mobile analytics
      await setViewport(390, 844, true);
      await evaluate(`(() => { const els=[...document.querySelectorAll('.app-sidebar .nav-item')]; const b=els.find(n=>/Lịch sử/.test(n.textContent)); b && b.click(); return !!b; })()`);
      await wait(1800);
      await capture('admin-mobile-analytics');
      await setViewport(1440, 900, false);
    }
  }

  await fs.writeFile(path.join(root, 'populated-verification.json'), JSON.stringify({ shots, problems }, null, 2));
  console.log(JSON.stringify({ screens: shots.length, problems: problems.slice(0, 10) }, null, 1));
  socket.close();
} finally {
  await fs.writeFile(path.join(root, 'populated-verification.json'), JSON.stringify({ shots, problems }, null, 2)).catch(() => {});
  console.log('populated screens captured: ' + shots.length);
  browser.kill();
}
