import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'app-screens');
const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const appUrl = 'http://127.0.0.1:3000/';
const accounts = {
  admin: { email: 'admin@gmail.com', password: 'admin123' },
  farmer: { email: 'user@gmail.com', password: 'user123' },
};

await fs.mkdir(outDir, { recursive: true });

const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(root, '.app-browser-profile')}`, 'about:blank',
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

  let nextId = 0; const pending = new Map();
  socket.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error')) problems.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p = {}) => send(m, p, sessionId);
  await call('Page.enable'); await call('Runtime.enable');

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
    const file = `${name}.png`;
    await fs.writeFile(path.join(outDir, file), Buffer.from(png.data, 'base64'));
    const audit = await evaluate(`(() => {
      const de = document.documentElement, body = document.body;
      const wide = de.scrollWidth - de.clientWidth;
      const bad = [...de.querySelectorAll('*')].filter(el => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.right > de.clientWidth + 2 || b.left < -2);
      }).slice(0, 6).map(el => el.tagName + '.' + String(el.className).slice(0, 60) + '|' + (el.textContent || '').trim().slice(0, 45));
      const txt = body.innerText || '';
      const h1 = document.querySelector('h1')?.innerText || document.querySelector('h2')?.innerText || '';
      return { h1: h1.slice(0, 80), chars: txt.length, mojibake: txt.includes('\\uFFFD'), horizontalOverflow: wide, offenders: bad,
        oldTokens: [...de.querySelectorAll('[class*="rounded-card"],[class*="shadow-subtle"],[class*="#27864B"]')].length,
        bodyBg: getComputedStyle(body).backgroundColor,
        h1Font: h1 ? getComputedStyle(document.querySelector('h1') || document.querySelector('h2')).fontFamily.slice(0, 40) : '' };
    })()`);
    shots.push({ name, ...audit });
    return audit;
  }

  // 1. Login screen, desktop + mobile
  await setViewport(1440, 900, false);
  await call('Page.navigate', { url: appUrl });
  await evaluate(ready);
  await evaluate(`localStorage.clear(); 'cleared'`);
  await call('Page.navigate', { url: appUrl });
  await evaluate(ready);
  await wait(1500);
  await capture('01-login-desktop');

  await setViewport(390, 844, true);
  await wait(600);
  await capture('02-login-mobile');

  // 2. Authenticated screens
  for (const [role, acc] of Object.entries(accounts)) {
    await setViewport(1440, 900, false);
    await call('Page.navigate', { url: appUrl });
    await evaluate(ready);
    await wait(700);
    await evaluate(`(async () => {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(acc)}) });
      const json = await res.json();
      localStorage.setItem('agro_token', json.data.token);
      localStorage.setItem('agro_user', JSON.stringify(json.data.user));
      return json.success;
    })()`);
    await call('Page.navigate', { url: appUrl });
    await evaluate(ready);
    await wait(2500);
    await capture(`03-${role}-landing`);

    const labels = await evaluate(`[...document.querySelectorAll('.app-sidebar .nav-item')].map(n => n.innerText.trim().replace(/\\s+/g, ' '))`);
    const only = (process.env.ONLY || '').split('|').filter(Boolean);
    for (let i = 0; i < labels.length; i += 1) {
      if (only.length && !only.includes(labels[i])) continue;
      const clicked = await evaluate(`(() => { const els = [...document.querySelectorAll('.app-sidebar .nav-item')]; const el = els[${i}]; if (!el) return 'missing'; el.click(); return el.innerText.trim().slice(0, 30); })()`);
      await wait(1800);
      console.log(`${role} tab ${i} [${labels[i]}] -> ${clicked}`);
      await capture(`${role === 'admin' ? '1' : '2'}0-${role}-tab${i}`);
    }

    // mobile shell + hamburger
    await setViewport(390, 844, true);
    await wait(800);
    await capture(`90-${role}-mobile-landing`);
    const drawer = await evaluate(`(() => {
      const btn = document.querySelector('.mobile-menu-button');
      if (!btn) return 'missing hamburger';
      btn.click();
      const open = document.querySelector('.app-sidebar')?.classList.contains('is-open');
      document.querySelector('.sidebar-backdrop')?.click();
      const closed = !document.querySelector('.app-sidebar')?.classList.contains('is-open');
      return 'open=' + open + ' closedAfterBackdrop=' + closed;
    })()`);
    shots.push({ name: `${role}-mobile-drawer`, h1: drawer, chars: 0, mojibake: false, horizontalOverflow: 0, offenders: [], oldTokens: 0 });
    await setViewport(1440, 900, false);
  }

  // 3. Drawer check on devices admin screen (create device panel, no submit)
  await evaluate(`(() => { const b=[...document.querySelectorAll('.app-sidebar .nav-item')].find(n=>/Thiết bị|trạm/i.test(n.textContent)); b && b.click(); return !!b; })()`);
  await wait(1500);
  const drawerState = await evaluate(`(() => {
    const openBtn = [...document.querySelectorAll('button')].find(b => /Thêm trạm|Thêm thiết bị|Tạo trạm/i.test(b.textContent));
    if (!openBtn) return 'no add button';
    openBtn.click();
    const d = document.querySelector('dialog.drawer');
    return 'dialogPresent=' + !!d + ' open=' + (d ? d.open : 'n/a');
  })()`);
  await capture('95-drawer-device-create');
  await evaluate(`(() => { const d = document.querySelector('dialog.drawer'); if (d?.open) d.close(); return 'closed'; })()`);

  await fs.writeFile(path.join(root, 'app-verification.json'), JSON.stringify({ shots, problems }, null, 2));
  console.log(JSON.stringify({ screens: shots.length, problems: problems.slice(0, 12), drawerState }, null, 1));
  socket.close();
} finally {
  await fs.writeFile(path.join(root, 'app-verification.json'), JSON.stringify({ shots, problems }, null, 2)).catch(() => {});
  console.log('screens captured: ' + shots.length);
  browser.kill();
}
