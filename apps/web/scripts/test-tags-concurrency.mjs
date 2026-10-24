/** Local real Chromium, native Web Crypto + IndexedDB, deterministic two-tab races. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 4197, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.GHOSTPAY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const egress = [], results = [];
  for (const page of pages) {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4197') return route.continue();
      egress.push(url.origin); return route.abort();
    });
    await page.goto('http://127.0.0.1:4197/');
  }
  const [a,b] = pages;
  async function setup() {
    for (const page of pages) await page.evaluate(async () => {
      const { IdbTagStore } = await import('/src/lib/idbStore.ts'); const { TagVault } = await import('/src/lib/tags.ts');
      window.tagStore = new IdbTagStore(); window.tagVault = new TagVault(window.tagStore);
      window.tagKey = () => new Uint8Array(32).fill(7);
      window.tagPayload = n => ({ stealthAddress: `0x${n.toString(16).padStart(40, '0')}`, announcementId: `0x${'ab'.repeat(32)}:0`, logIndex: 0, clientLabel: `private-label-${n}` });
      window.pauseCommit = () => { window.commitPaused = false; let release; const pause = new Promise(resolve => { release = resolve; }); window.releaseCommit = release;
        for (const name of ['put','applyBatch']) { const original=window.tagStore[name].bind(window.tagStore); window.tagStore[name]=async(...args)=>{ window.commitPaused=true; await pause; return original(...args); }; } };
    });
  }
  async function reset() {
    for (const page of pages) await page.reload();
    await setup();
    await a.evaluate(() => window.tagVault.wipe());
    for (const page of pages) await page.evaluate(() => window.tagVault.unlock(window.tagKey()));
  }
  async function pending(page, expression) {
    await page.evaluate(operation => { window.pauseCommit(); const pending = operation === 'save' ? window.tagVault.save(1,window.tagPayload(1)) : window.tagVault.rotateKeys(window.tagKey()); window.operation = pending.then(()=>'committed',e=>`rejected: ${e.message}`); }, expression);
    await page.waitForFunction(() => window.commitPaused);
  }
  async function finish(page) { return page.evaluate(async () => { window.releaseCommit(); return window.operation; }); }
  async function check(name, run) { try { await reset(); await run(); results.push({name, pass:true}); } catch(e) { results.push({name, pass:false, error:e.message}); } }
  // Independent previous-release v1 database + chain-only-AAD ciphertext fixture.
  await a.evaluate(async () => {
    const hex = value => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2,'0')).join('');
    const utf8 = value => new TextEncoder().encode(value);
    const salt = new Uint8Array(32).fill(13);
    const base = await crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'HKDF',false,['deriveKey']);
    const aes = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:utf8('GhostPay/local-tags/v1/aes-gcm')},base,{name:'AES-GCM',length:256},false,['encrypt']);
    const hmac = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:utf8('GhostPay/local-tags/v1/hmac')},base,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']);
    const body = {stealthAddress:`0x${'01'.repeat(20)}`,announcementId:`0x${'ab'.repeat(32)}:0`,logIndex:0,clientLabel:'previous-release-private-label'};
    const checkIv = crypto.getRandomValues(new Uint8Array(12)), iv=crypto.getRandomValues(new Uint8Array(12));
    const meta={salt:hex(salt),check:{iv:hex(checkIv),ciphertext:hex(await crypto.subtle.encrypt({name:'AES-GCM',iv:checkIv,additionalData:utf8('GhostPay/tag/v1|0'),tagLength:128},aes,utf8('ghostpay-tag-profile-ok')))}};
    const record={schemaVersion:1,chainId:1,recordId:'c'.repeat(32),createdAt:101,updatedAt:202,
      lookupKey:hex(await crypto.subtle.sign('HMAC',hmac,utf8(`1|${body.stealthAddress}`))),iv:hex(iv),
      ciphertext:hex(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:utf8('GhostPay/tag/v1|1'),tagLength:128},aes,utf8(JSON.stringify(body))))};
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ghostpay-tags',1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('records',{keyPath:'recordId'}).createIndex('lookup',['chainId','lookupKey'],{unique:false});db.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction(['records','meta'],'readwrite');tx.objectStore('records').put(record);tx.objectStore('meta').put(meta,'profile');tx.oncomplete=resolve;tx.onabort=reject;});
    window.oldTagDatabase=db;
  });
  await setup();
  try {
    const result=await b.evaluate(async()=>window.tagStore.getMeta().then(()=>false,e=>/older GhostPay tabs/.test(e.message)));
    assert.equal(result,true,'v2 upgrade must fail closed while a v1 connection is open');
    results.push({name:'in-place upgrade blocks old-tab writers',pass:true});
  } catch(e) { results.push({name:'in-place upgrade blocks old-tab writers',pass:false,error:e.message}); }
  finally { await a.evaluate(()=>window.oldTagDatabase.close()); }
  try {
    await b.evaluate(()=>window.tagVault.unlock(window.tagKey()));
    const migrated=await b.evaluate(async()=>{
      const payload=await window.tagVault.find(1,`0x${'01'.repeat(20)}`);
      const records=await window.tagStore.getAll();
      const oldCannotReopen=await new Promise(resolve=>{const r=indexedDB.open('ghostpay-tags',1);r.onsuccess=()=>{r.result.close();resolve(false);};r.onerror=()=>resolve(r.error.name==='VersionError');});
      return {label:payload.clientLabel,record:records[0],oldCannotReopen};
    });
    assert.equal(migrated.label,'previous-release-private-label');
    assert.equal(migrated.record.schemaVersion,2);assert.equal(migrated.record.recordId,'c'.repeat(32));
    assert.equal(migrated.record.createdAt,101);assert.equal(migrated.record.updatedAt,202);
    assert.equal(migrated.oldCannotReopen,true);
    results.push({name:'v1 ciphertext validated and migrated in place; old scripts cannot reopen',pass:true});
  } catch(e) { results.push({name:'v1 ciphertext validated and migrated in place; old scripts cannot reopen',pass:false,error:e.message}); }
  await check('two-tab stale replace preview preserves new save', async () => {
    await a.evaluate(async () => { window.preview = await window.tagVault.previewImport([], 'replace'); });
    await b.evaluate(() => window.tagVault.save(1,window.tagPayload(1)));
    const result=await a.evaluate(async()=>window.tagVault.applyImport(window.preview).then(()=>'committed',e=>`rejected: ${e.message}`));
    assert.match(result,/^rejected:/); assert.equal(await b.evaluate(async()=>(await window.tagVault.list()).length),1);
  });
  await check('two-tab wipe rejects in-flight save and stale unlocked tab', async () => {
    await pending(b,'save'); await a.evaluate(()=>window.tagVault.wipe());
    assert.match(await finish(b),/^rejected:/);
    assert.equal(await a.evaluate(async()=>(await window.tagStore.getAll()).length),0);
    assert.equal(await b.evaluate(async()=>window.tagVault.save(1,window.tagPayload(2)).then(()=>false,()=>true)),true);
  });
  await check('two-tab rotation rejects in-flight old-key save', async () => {
    await pending(b,'save'); await a.evaluate(()=>window.tagVault.rotateKeys(window.tagKey()));
    assert.match(await finish(b),/^rejected:/);
    await b.evaluate(()=>window.tagVault.unlock(window.tagKey())); await b.evaluate(()=>window.tagVault.save(1,window.tagPayload(2)));
    assert.equal(await a.evaluate(async()=>(await window.tagVault.list()).length),1);
  });
  await check('two-tab rotation preserves save made during re-encryption', async () => {
    await a.evaluate(()=>window.tagVault.save(1,window.tagPayload(1)));
    await pending(a,'rotate'); await b.evaluate(()=>window.tagVault.save(1,window.tagPayload(2)));
    assert.match(await finish(a),/^rejected:/);
    await a.evaluate(()=>window.tagVault.unlock(window.tagKey())); assert.equal(await a.evaluate(async()=>(await window.tagVault.list()).length),2);
    assert.equal(await a.evaluate(()=>window.tagVault.rotateKeys(window.tagKey())),2);
    await b.evaluate(()=>window.tagVault.unlock(window.tagKey())); assert.equal(await b.evaluate(async()=>(await window.tagVault.list()).length),2);
  });
  await check('lock while rotation awaits commit never restores keys', async () => {
    await pending(a,'rotate'); await a.evaluate(()=>window.tagVault.lock());
    assert.match(await finish(a),/^rejected:/); assert.equal(await a.evaluate(()=>window.tagVault.unlocked),false);
    assert.equal(await b.evaluate(()=>window.tagVault.keyVersion()),1);
  });
  await check('native transaction abort rolls back all writes on late guard', async () => {
    await a.evaluate(()=>window.tagVault.save(1,window.tagPayload(1)));
    assert.equal(await a.evaluate(async()=>{
      const s=await window.tagStore.getSnapshot(); let calls=0;
      try { await window.tagStore.applyBatch({puts:[],deleteIds:s.records.map(r=>r.recordId)},s,()=>{ if(++calls>3)throw new Error('late lock'); }); return false; } catch { return (await window.tagStore.getAll()).length===1; }
    }),true);
  });
  await check('exact snapshot detects an out-of-band encrypted-record write without revision bump', async () => {
    await a.evaluate(()=>window.tagVault.save(1,window.tagPayload(1)));
    assert.equal(await a.evaluate(async()=>{
      const snapshot=await window.tagStore.getSnapshot();
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ghostpay-tags',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({...snapshot.records[0],updatedAt:snapshot.records[0].updatedAt+1});tx.oncomplete=resolve;tx.onabort=reject;});db.close();
      const current=await window.tagStore.getSnapshot();
      if(current.revision!==snapshot.revision)return false;
      try { await window.tagStore.applyBatch({puts:[],deleteIds:[snapshot.records[0].recordId]},snapshot);return false; }
      catch { return (await window.tagStore.getAll()).length===1; }
    }),true);
  });
  await check('exact snapshot detects an out-of-band profile change without revision bump', async () => {
    assert.equal(await a.evaluate(async()=>{
      const snapshot=await window.tagStore.getSnapshot();
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ghostpay-tags',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({...snapshot.meta,keyVersion:9},'profile');tx.oncomplete=resolve;tx.onabort=reject;});db.close();
      try { await window.tagStore.applyBatch({puts:[],deleteIds:[],meta:snapshot.meta},snapshot);return false; }
      catch { return (await window.tagStore.getMeta()).keyVersion===9; }
    }),true);
  });
  await check('rejects oversized merged batch before it can create an unreadable store', async () => {
    await a.evaluate(()=>window.tagVault.save(1,window.tagPayload(1)));
    assert.equal(await a.evaluate(async()=>{
      const snapshot=await window.tagStore.getSnapshot();
      const puts=Array.from({length:100001},(_,i)=>({...snapshot.records[0],recordId:i.toString(16).padStart(32,'0')}));
      try {await window.tagStore.applyBatch({puts,deleteIds:[]},snapshot);return false;}
      catch(e){const current=await window.tagStore.getSnapshot();return /Too many tags/.test(e.message)&&current.records.length===1&&current.revision===snapshot.revision;}
    }),true);
  });
  assert.deepEqual(egress,[],'no external network requests');
  console.log(JSON.stringify(results,null,2));
  assert.equal(results.filter(r=>!r.pass).length,0,'all native two-tab checks must pass');
  const dump=await a.evaluate(async()=>JSON.stringify(await window.tagStore.getAll())); assert.equal(dump.includes('private-label'),false);
  console.log('PASS: native Chromium two-tab save/import/rotate/wipe, lifetime/rollback guards, ciphertext-only, no external egress.');
} finally { await browser?.close(); await server.close(); }
