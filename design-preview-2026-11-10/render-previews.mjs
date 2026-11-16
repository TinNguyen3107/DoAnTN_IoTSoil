import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const browserPath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/mockups.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain; charset=utf-8');
    res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
});
await new Promise(resolve => server.listen(4318, '127.0.0.1', resolve));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${path.join(root, '.preview-browser-profile')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browserSocket;
try {
  browserSocket = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 30000);
    const onData = data => { const match = data.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } };
    browser.stderr.on('data', onData);
    browser.on('error', reject);
    browser.on('exit', code => { clearTimeout(timeout); reject(new Error('Browser exited: ' + code)); });
  });
  const socket = new WebSocket(browserSocket);
  await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true}); });
  let nextId=0; const pending=new Map(); const errors=[];
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data); if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}} if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(method,params={})=>send(method,params,sessionId);
  await call('Page.enable');await call('Runtime.enable');await call('DOM.enable');await call('CSS.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1510,height:1140,deviceScaleFactor:1.5,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:4318/mockups.html?view=monitor'});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await evaluate(`new Promise(resolve => {if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true})})`);
  const views=await evaluate('Object.keys(names)');
  const report=[];
  for(let i=0;i<views.length;i++){
    const view=views[i];
    await evaluate(`render(${JSON.stringify(view)}); new Promise(async resolve=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r})));requestAnimationFrame(()=>requestAnimationFrame(resolve))})`);
    const check=await evaluate(`(()=>{const screen=document.querySelector('#screen');const r=screen.getBoundingClientRect();const nodes=[...screen.querySelectorAll('h1,h2,h3,p,table,label,.btn,.npk-row,.journal-day,.side-link,.chart,.chart-x')];return {view:currentView,title:document.title,clip:{x:r.x,y:r.y,width:r.width,height:r.height,scale:1},overflow:nodes.filter(n=>{const b=n.getBoundingClientRect();return b.right>r.right+1||b.left<r.left-1||b.bottom>r.bottom-29}).map(n=>({text:n.textContent.slice(0,90),bottom:Math.round(n.getBoundingClientRect().bottom-r.top)})),brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,badText:screen.textContent.includes('�'),contentLength:screen.textContent.length}})()`);
    const png=await call('Page.captureScreenshot',{format:'png',clip:check.clip,captureBeyondViewport:true});
    const filename=`${String(i+1).padStart(2,'0')}-${view}.png`;
    await fs.writeFile(path.join(root,'images',filename),Buffer.from(png.data,'base64'));
    report.push({...check,file:filename});
    console.log(JSON.stringify({view,file:filename,overflow:check.overflow,brokenImages:check.brokenImages}));
  }
  await evaluate("render('monitor'); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const {root:documentRoot}=await call('DOM.getDocument');
  const {nodeId}=await call('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'#screen h1'});
  const fonts=await call('CSS.getPlatformFontsForNode',{nodeId});
  const golden=await evaluate(`(()=>{document.querySelector('[data-view="fertilizer"]').click();const result=currentView==='fertilizer';document.querySelector('[data-view="crops"]').click();return {monitorToFertilizer:result,fertilizerToCrops:currentView==='crops'}})()`);
  await call('Page.navigate',{url:'http://127.0.0.1:3000'});
  await evaluate(`new Promise(resolve => {if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true})})`);
  await evaluate(`new Promise(resolve=>{if(document.querySelector('h2'))return resolve();const observer=new MutationObserver(()=>{if(document.querySelector('h2')){observer.disconnect();resolve()}});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{observer.disconnect();resolve()},8000)})`);
  const currentApp=await evaluate('({title:document.title,heading:document.querySelector("h2")?.textContent,bodyLength:document.body.textContent.length})');
  const oldScreenshot=await call('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(path.join(root,'current-interface-reference.png'),Buffer.from(oldScreenshot.data,'base64'));
  await call('Page.navigate',{url:'http://127.0.0.1:4318/index.html'});
  await evaluate(`new Promise(resolve => {if(document.readyState==='complete')resolve();else window.addEventListener('load',resolve,{once:true})})`);
  const compare=await evaluate(`(()=>{const r=document.querySelector('#comparison').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
  const comparePng=await call('Page.captureScreenshot',{format:'png',clip:compare,captureBeyondViewport:true});
  await fs.writeFile(path.join(root,'images','00-comparison.png'),Buffer.from(comparePng.data,'base64'));
  const galleryCheck=await evaluate(`(()=>{document.querySelector('[data-filter="admin"]').click();const filtered=[...document.querySelectorAll('#gallery article')].filter(n=>!n.hidden);document.querySelector('[data-filter="all"]').click();document.querySelector('#gallery .zoom').click();const modalOpened=document.querySelector('dialog').open;document.querySelector('dialog .close').click();return {adminFilterCount:filtered.length,modalOpened,modalClosed:!document.querySelector('dialog').open,brokenImages:[...document.images].filter(i=>i.src&&!i.complete).length}})()`);
  report.push({view:'comparison',file:'00-comparison.png',galleryCheck});
  await fs.writeFile(path.join(root,'verification.json'),JSON.stringify({report,fonts,golden,currentApp,errors},null,2));
  console.log(JSON.stringify({fonts,golden,currentApp,errors}));
  socket.close();
} finally {
  browser.kill();
  server.close();
}
