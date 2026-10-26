/** Local Chromium checks of real seller-vault IndexedDB across tabs and isolated recovery contexts. No wallets or RPCs. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 4194, strictPort: true },
  // Exercise only the imported vault modules; unrelated UI entry discovery can reload an active crypto operation.
  optimizeDeps: { entries: [], noDiscovery: true },
});
let browser;
const extraContexts = [];
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.GHOSTPAY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const unexpected = [];
  for (const page of pages) {
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4194') {
        if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
        return route.continue();
      }
      unexpected.push(url.origin);
      return route.abort();
    });
    await page.goto('http://127.0.0.1:4194/');
    await page.evaluate(async () => {
      const { IndexedDbKeyVaultStore } = await import('/src/lib/keyVault.ts');
      window.sellerVaultForTest = new IndexedDbKeyVaultStore();
    });
  }
  const [tabA, tabB] = pages;
  const read = (page) => page.evaluate(() => window.sellerVaultForTest.get());
  const put = (page, value) => page.evaluate((value) => window.sellerVaultForTest.putIfEmpty(value, () => {}), value);
  const del = (page, expected) => page.evaluate(async (expected) => {
    try { await window.sellerVaultForTest.delete(expected); return 'deleted'; } catch (error) { return error.name; }
  }, expected);

  assert.equal(await read(tabA), undefined, 'fresh browser context starts without a vault');

  // V1: a save whose session is revoked while the write is pending must abort inside the transaction.
  const stale = await tabA.evaluate(async () => {
    let calls = 0;
    try {
      await window.sellerVaultForTest.putIfEmpty('stale ciphertext', () => {
        if (++calls > 1) throw new Error('session revoked while the IndexedDB add was pending');
      });
      return { rejected: false, calls };
    } catch { return { rejected: true, calls }; }
  });
  assert.equal(stale.rejected, true, 'stale save must reject');
  assert.equal(stale.calls, 2, 'guard must run after DB open and again inside the transaction');
  assert.equal(await read(tabB), undefined, 'aborted save must leave the store empty for every tab');

  // V2: tab B opens a delete confirmation for A; tab A replaces A with B; tab B's stale confirm must not delete B.
  await put(tabA, 'ciphertext-a');
  const confirmedInB = await read(tabB);
  assert.equal(confirmedInB, 'ciphertext-a');
  assert.equal(await del(tabA, 'ciphertext-a'), 'deleted');
  await put(tabA, 'ciphertext-b');
  assert.equal(await del(tabB, confirmedInB), 'VaultChangedError', 'stale confirmation must report a changed vault');
  assert.equal(await read(tabA), 'ciphertext-b', 'replacement must survive byte-for-byte');

  // Concurrent stale confirmations from both tabs against the current record: exactly one deletes, B is not recreated.
  const race = await Promise.all([del(tabA, 'ciphertext-b'), del(tabB, 'ciphertext-b')]);
  assert.deepEqual(race.slice().sort(), ['VaultChangedError', 'deleted'], 'exactly one tab may delete the confirmed record');
  assert.equal(await read(tabB), undefined);
  await put(tabB, 'ciphertext-c');
  assert.equal(await del(tabA, 'ciphertext-b'), 'VaultChangedError', 'a repeated confirm cannot delete a later vault');
  assert.equal(await read(tabA), 'ciphertext-c');

  assert.deepEqual(unexpected, [], 'local-only browser test must not contact external origins');
  await context.close();

  // R1-R3 recovery acceptance: separate fresh contexts, real session/keystore/vault modules, loopback-only traffic.
  const ORIGIN = 'http://127.0.0.1:4194';
  const FIXTURE = `${ORIGIN}/__recovery-fixture.html`;
  const PASS_A = 'violet comet maple lantern';
  const PASS_B = 'amber harbor quartz meadow';
  const recoveryUnexpected = [];
  const sha = async (text) => {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(text, 'utf8').digest('hex');
  };
  const openRecoveryPage = async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    extraContexts.push(ctx);
    await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) { recoveryUnexpected.push(url.origin); return route.abort(); }
      if (url.pathname === '/__recovery-fixture.html') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' });
      }
      return route.continue();
    });
    const page = await ctx.newPage();
    await page.goto(FIXTURE);
    return page;
  };
  const loadModules = async (page) => {
    await page.evaluate(async () => {
      const session = await import('/src/lib/session.ts');
      const vault = await import('/src/lib/keyVault.ts');
      window.gpRecovery = { session, vault };
    });
  };
  const checkProductionEnvelope = (text, label) => {
    const env = JSON.parse(text);
    assert.equal(env.v, 1, `${label}: envelope version`);
    assert.equal(env.kdf, 'scrypt', `${label}: kdf`);
    assert.equal(env.cipher, 'AES-256-GCM', `${label}: cipher`);
    assert.deepEqual({ N: env.kdfParams.N, r: env.kdfParams.r, p: env.kdfParams.p }, { N: 131072, r: 8, p: 1 }, `${label}: production default scrypt profile`);
    return env;
  };

  // R1: source context A creates synthetic keys, saves the production-default vault and exports the backup.
  const pageA = await openRecoveryPage();
  await loadModules(pageA);
  const sourceA = await pageA.evaluate(async (pass) => {
    const { session, vault } = window.gpRecovery;
    const before = await vault.readEncryptedVault();
    const pub = session.generateSession();
    await vault.saveEncryptedVault(pass);
    const saved = await vault.readEncryptedVault();
    const backup = await session.exportKeystore(pass);
    return { before: before === undefined, pub: { ...pub }, saved, backup };
  }, PASS_A);
  assert.equal(sourceA.before, true, 'R1: source context starts without a vault');
  assert.equal(typeof sourceA.saved, 'string', 'R1: source vault persisted');
  assert.equal(typeof sourceA.backup, 'string', 'R1: backup exported');
  assert.equal(new TextEncoder().encode(sourceA.backup).byteLength <= 8192, true, 'R1: backup stays within the bounded import envelope');
  const envA = checkProductionEnvelope(sourceA.saved, 'R1 vault');
  const envBackup = checkProductionEnvelope(sourceA.backup, 'R1 backup');
  assert.equal(envA.meta.metaAddress, sourceA.pub.metaAddress, 'R1: envelope binds the public meta address');
  assert.equal(envA.meta.signer, sourceA.pub.signerPublicKey, 'R1: envelope binds the signer');
  assert.equal(envBackup.meta.signer, sourceA.pub.signerPublicKey, 'R1: backup binds the signer');
  const vaultADigest = await sha(sourceA.saved);
  const backupDigest = await sha(sourceA.backup);

  // R2: independent destination context B imports into memory only, then explicitly saves under another passphrase.
  const pageB = await openRecoveryPage();
  await loadModules(pageB);
  const start = await pageB.evaluate(async () => {
    const { session, vault } = window.gpRecovery;
    return { stored: await vault.readEncryptedVault(), loaded: session.hasSession(), pub: session.getSessionPublic() };
  });
  assert.equal(start.stored, undefined, 'R2: destination starts with no persisted vault');
  assert.equal(start.loaded, false, 'R2: destination starts with no loaded session');
  assert.equal(start.pub, undefined, 'R2: destination has no public session');
  const imported = await pageB.evaluate(async ([backup, pass]) => {
    const { session, vault } = window.gpRecovery;
    const pub = await session.importKeystore(backup, pass);
    return { pub: { ...pub }, current: { ...session.getSessionPublic() }, stored: await vault.readEncryptedVault() };
  }, [sourceA.backup, PASS_A]);
  assert.deepEqual(imported.pub, sourceA.pub, 'R2: imported SessionPublic equals the source identity');
  assert.deepEqual(imported.current, sourceA.pub, 'R2: loaded session equals the source identity');
  assert.equal(imported.stored, undefined, 'R2: import alone must not persist anything');
  const savedB = await pageB.evaluate(async (pass) => {
    const { vault } = window.gpRecovery;
    await vault.saveEncryptedVault(pass);
    return vault.readEncryptedVault();
  }, PASS_B);
  assert.equal(typeof savedB, 'string', 'R2: explicit save persisted a vault in B');
  const envB = checkProductionEnvelope(savedB, 'R2 destination vault');
  assert.equal(envB.meta.metaAddress, sourceA.pub.metaAddress, 'R2: destination envelope binds the original meta address');
  assert.equal(envB.meta.signer, sourceA.pub.signerPublicKey, 'R2: destination envelope binds the original signer');
  assert.notEqual(await sha(savedB), vaultADigest, 'R2: re-encryption must not reuse the source vault ciphertext');
  assert.notEqual(await sha(savedB), backupDigest, 'R2: re-encryption must not reuse the backup ciphertext');
  assert.notEqual(envB.kdfParams.salt, envA.kdfParams.salt, 'R2: fresh salt');
  assert.notEqual(envB.iv, envA.iv, 'R2: fresh iv');
  const savedBDigest = await sha(savedB);

  // Clear/reload B, then unlock with the destination passphrase.
  await pageB.evaluate(() => window.gpRecovery.session.clearSession());
  await pageB.reload();
  await loadModules(pageB);
  const reloaded = await pageB.evaluate(async ([wrongPass, pass]) => {
    const { session, vault } = window.gpRecovery;
    const stored = await vault.readEncryptedVault();
    const loadedBefore = session.hasSession();
    let sourcePassRejected = false;
    try { await vault.unlockEncryptedVault(wrongPass); } catch { sourcePassRejected = true; }
    const loadedAfterReject = session.hasSession();
    await vault.unlockEncryptedVault(pass);
    return { stored, loadedBefore, sourcePassRejected, loadedAfterReject, pub: { ...session.getSessionPublic() } };
  }, [PASS_A, PASS_B]);
  assert.equal(reloaded.stored === savedB, true, 'R2: destination vault survives reload byte-for-byte');
  assert.equal(reloaded.loadedBefore, false, 'R2: reload leaves no session');
  assert.equal(reloaded.sourcePassRejected, true, 'R2: source passphrase does not open the destination vault');
  assert.equal(reloaded.loadedAfterReject, false, 'R2: failed unlock loads nothing');
  assert.deepEqual(reloaded.pub, sourceA.pub, 'R2: destination passphrase restores the exact original public identity');

  // R3: occupied destination refuses a save of a different identity and keeps its original ciphertext.
  const conflict = await pageB.evaluate(async (pass) => {
    const { session, vault } = window.gpRecovery;
    const different = { ...session.generateSession() };
    let message = '';
    try { await vault.saveEncryptedVault(pass); } catch (error) { message = String(error?.message ?? ''); }
    const stored = await vault.readEncryptedVault();
    session.clearSession();
    await vault.unlockEncryptedVault(pass);
    return { different, message, stored, pub: { ...session.getSessionPublic() } };
  }, PASS_B);
  assert.notEqual(conflict.different.metaAddress, sourceA.pub.metaAddress, 'R3: conflict identity is genuinely different');
  assert.notEqual(conflict.different.signerPublicKey, sourceA.pub.signerPublicKey, 'R3: conflict signer is genuinely different');
  assert.match(conflict.message, /already exists/, 'R3: occupied destination must refuse the save');
  assert.equal(conflict.stored === savedB && (await sha(conflict.stored)) === savedBDigest, true, 'R3: original destination ciphertext preserved byte-for-byte');
  assert.deepEqual(conflict.pub, sourceA.pub, 'R3: original ciphertext still unlocks the original seller');

  // A is unchanged: B saved without deleting or altering A's vault, and the exported backup text is unchanged.
  const aAfter = await pageA.evaluate(() => window.gpRecovery.vault.readEncryptedVault());
  assert.equal(aAfter === sourceA.saved && (await sha(aAfter)) === vaultADigest, true, 'R3: source vault unchanged');
  assert.deepEqual(await pageA.evaluate(() => ({ ...window.gpRecovery.session.getSessionPublic() })), sourceA.pub, 'R3: source session identity remains unchanged');
  assert.equal(await sha(sourceA.backup), backupDigest, 'R1: exported backup unchanged');
  assert.deepEqual(recoveryUnexpected, [], 'recovery phase must not contact external origins');
  console.log('PASS: Chromium seller vault recovery R1-R3 (import is memory-only, explicit re-encrypted save, occupied-store refusal).');
  console.log('PASS: Chromium seller vault two-tab compare-and-delete, stale-session save abort, no external egress.');
} finally {
  for (const extra of extraContexts) await extra.close().catch(() => {});
  await browser?.close();
  await server.close();
}
