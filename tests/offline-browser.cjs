// Real IndexedDB + service-worker regression checks, using an isolated Edge profile.
// Run: node tests/offline-browser.cjs (or set EDGE_PATH to a Chromium executable).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebtech-offline-test-'));
let browser;
let socket;
const server = http.createServer((req, res) => {
  if (req.url === '/offline.js' || req.url === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(fs.readFileSync(path.join(root, req.url === '/offline.js' ? 'src/lib/offline.js' : 'public/sw.js')));
  } else if (req.url.startsWith('/_next/static/')) {
    res.setHeader('Content-Type', 'application/javascript');
    res.end('window.shellLoaded = true;');
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Offline test</title><div>POS shell</div><script src="/_next/static/test.js"></script>');
  }
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  browser.on('error', (error) => { console.error(error.message); });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Could not start headless browser');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (!pending.has(msg.id)) return;
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout: ${method}`)); }, 25000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await call('Page.enable');
  await call('Page.navigate', { url: `${origin}/pos` });
  await sleep(500);
  const checks = await evaluate(`(async () => {
    const m = await import('/offline.js');
    const check = (ok, label) => { if (!ok) throw new Error(label); };
    await m.clearOfflineData();
    const products = [{id:'a',name:'Maize',categoryId:'seed',category:'Seeds',stock:10}, {id:'b',name:'Feed',categoryId:'feed',category:'Feeds',stock:5}];
    await m.saveCatalog(products);
    check(Boolean(await m.getCatalogSavedAt()), 'catalog readiness');
    const body = {clientId:'first',primaryPaymentMethod:'cash',items:[{productId:'a',quantity:3}]};
    await m.queueSale(body);
    await m.queueSale(body);
    check((await m.getQueuedSales()).length === 1, 'duplicate queue entry');
    check((await m.getCatalog()).find(p=>p.id==='a').stock === 7, 'duplicate stock deduction');
    check(await m.saveCatalog(products) === false, 'refresh must preserve unsynced stock');
    let rejected = false;
    try { await m.queueSale({...body,clientId:'bad',items:[{productId:'a',quantity:2},{productId:'b',quantity:6}]}); } catch { rejected = true; }
    check(rejected, 'reject overselling');
    check((await m.getCatalog()).find(p=>p.id==='a').stock === 7, 'rollback all deductions');
    check((await m.getQueuedSales()).length === 1, 'rollback sale');
    rejected = false;
    try { await m.queueSale({...body,clientId:'credit',primaryPaymentMethod:'credit'}); } catch { rejected = true; }
    check(rejected, 'offline credit blocked');
    const many = Array.from({length:70}, (_,i)=>({id:String(i),name:'A'+i,categoryId:'other'}));
    check(m.searchCatalog([...many,...products], '', 'seed').length === 1, 'filter category before limiting');
    const realFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('offline'); };
    await m.syncQueuedSales();
    check((await m.getQueuedSales()).length === 1, 'network failure retains sale');
    window.fetch = async () => new Response('{}',{status:401});
    check((await m.syncQueuedSales()).authRequired, 'expired session reported');
    check((await m.getQueuedSales()).length === 1, 'expired session retains sale');
    let uploads = 0;
    window.fetch = async (_,options) => { uploads++; check(JSON.parse(options.body).clientId === 'first', 'stable upload id'); return new Response('{}'); };
    await Promise.all([m.syncQueuedSales(),m.syncQueuedSales()]);
    check(uploads === 1 && (await m.getQueuedSales()).length === 0, 'one upload and removal on success');
    await m.saveCatalog(products);
    await m.queueSale({...body,clientId:'persisted'});
    window.fetch = realFetch;
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    const ready = await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('message', event => { if(event.data.type === 'offline-ready') resolve(event.data.ready); }, {once:true});
      reg.active.postMessage({type:'warm'});
    });
    check(ready, 'page and assets cached');
    return 'PASS: stock transactions, rollback, retry IDs, category filtering, queue recovery, authentication expiry, service worker warmup';
  })()`);
  console.log(checks);
  await call('Network.enable');
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await call('Page.reload');
  for (let i = 0; i < 120; i++) {
    if (await evaluate('document.body?.textContent.includes("POS shell") && window.shellLoaded === true').catch(() => false)) break;
    await sleep(100);
  }
  assert.equal(await evaluate('document.body.textContent.includes("POS shell") && window.shellLoaded === true'), true, 'offline reload must include assets');
  const persisted = await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('nebtech-offline',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction('sales');const q=t.objectStore('sales').getAll();q.onsuccess=()=>resolve(q.result.map(s=>s.clientId));t.oncomplete=()=>db.close();};})`);
  assert.deepEqual(persisted, ['persisted']);
  console.log('PASS: offline page reload, cached JS execution, queued sale survives reload');
  await call('Browser.close');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  socket?.close();
  browser?.kill();
  server.close();
  // Profile is isolated in the OS temp directory; do not touch the user's browser data.
});
