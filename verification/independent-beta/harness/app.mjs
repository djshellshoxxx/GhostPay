// W5 independent payment-state verifier: black-box driver for the built GhostPay web app.
// Original work. Interacts only through accessible roles/labels and user-visible English text (apps/web/locales/en.json),
// and observes storage generically (every same-origin localStorage/sessionStorage/IndexedDB value), never through
// production modules.
import { RPC_URL } from './rpc.mjs';

const T = {
  review: 'Review payment',
  finalCheck: 'Final check before your wallet',
  sendBtn: 'Send payment in my wallet',
  journal: 'Wallet attempt journal',
  clearBtn: 'Clear this attempt after checking my wallet',
  checkBtn: 'Check status on my RPC',
};

/** Visible-status vocabulary, each mapped to the safety meaning the oracle uses. */
export const STATUS_PATTERNS = [
  // claims of inclusion/success: allowed only with canonical successful evidence (I1)
  { cls: 'success', re: /Status: included in block|Included in a canonical block|The RPC confirmed execution of this transaction/ },
  { cls: 'reverted', re: /reverted/i },
  { cls: 'unknown', re: /Outcome unknown|unknown outcome|may already have been submitted|could not be verified/i },
  { cls: 'pending', re: /Pending\. The RPC sees|not yet confirmed|Waiting for inclusion|Verifying the transaction/ },
  { cls: 'mismatch', re: /different transaction under this hash|differs from the preview|another transaction took its place/ },
  { cls: 'blocked', re: /previous wallet attempt/i },
];

export function classify(text) {
  return STATUS_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.cls);
}

const HASH_RE = /0x[0-9a-fA-F]{64}/g;
export const hashesIn = (text) => [...new Set((String(text).match(HASH_RE) ?? []).map((h) => h.toLowerCase()))];

/** Settings every load starts with: the harness RPC for 84532 (same key the repository's E2E helpers use). */
export function settingsInitScript() {
  return `try { localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': ${JSON.stringify(RPC_URL)} } })); } catch {}`;
}

async function visible(locator, timeout = 0) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: Math.max(timeout, 1) });
    return true;
  } catch {
    return false;
  }
}

/** Seller setup in one tab: fresh keys (backup waiver typed), then two fixed-price native invoices. */
export async function sellerSetup(page, origin) {
  await page.goto(`${origin}/`);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('button', { name: 'Seller keys' }).click();
  await page.getByRole('button', { name: 'Generate new keys' }).click();
  await page.getByLabel(/To continue without a backup, type/).fill('continue without backup');
  await page.getByRole('button', { name: 'Continue without a backup' }).click();
  await page.locator('code', { hasText: /^st:eth:0x/ }).first().waitFor({ state: 'visible', timeout: 20_000 });
  const make = async (description) => {
    await nav.getByRole('button', { name: 'Create invoice' }).click();
    await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
    await page.getByLabel('Token amount').fill('0.5');
    await page.getByLabel('Item 1 description').fill(description);
    await page.getByLabel('Item 1 unit price').fill('50.00');
    await page.getByRole('button', { name: 'Create invoice link' }).click();
    const box = page.getByRole('textbox', { name: 'Link', exact: true });
    await box.waitFor({ state: 'visible', timeout: 20_000 });
    const link = await box.inputValue();
    if (!link.includes('#gpi=v1.')) throw new Error('harness: invoice link has unexpected shape');
    return link;
  };
  const X = await make('W5 intent X');
  await nav.getByRole('button', { name: 'Seller keys' }).click();
  const C = await make('W5 control C');
  if (X === C) throw new Error('harness: X and C invoice links are identical');
  return { X, C };
}

/** Open an invoice link as a fresh navigation and walk to the final check. Returns what happened. */
export async function openAndPrepare(page, link, { inPage = false } = {}) {
  if (inPage) {
    // Same-document invoice change (no reload): any in-flight work of the previous invoice keeps running.
    await page.evaluate((h) => {
      location.hash = h;
    }, new URL(link).hash);
  } else {
    await page.goto('about:blank');
    await page.goto(link);
  }
  if (!(await visible(page.getByRole('heading', { level: 2, name: T.review }), 20_000))) return { prepared: false, reason: 'no-review' };
  const cont = page.getByRole('button', { name: 'Continue' });
  // Continue stays disabled while the deployment/RPC checks run; a failed check legitimately keeps checkout closed
  // (harness fix H4: report it, do not throw). Wait up to 20 s for it to become usable.
  let enabled = false;
  for (let i = 0; i < 40 && !enabled; i += 1) {
    enabled = (await cont.count()) > 0 && (await cont.first().isEnabled().catch(() => false));
    if (!enabled) {
      if ((await page.getByRole('alert').filter({ hasText: /Blocked by a safety check/ }).count()) > 0) break;
      await page.waitForTimeout(500);
    }
  }
  if (!enabled) return { prepared: false, reason: 'continue-blocked' };
  await cont.first().click();
  const connect = page.getByRole('button', { name: /Connect E2E Wallet/ });
  if (await visible(connect, 10_000)) await connect.click();
  const prep = page.getByRole('button', { name: 'Prepare payment' });
  if (!(await visible(prep, 10_000))) return { prepared: false, reason: 'no-prepare' };
  await prep.click();
  const ok = await visible(page.getByRole('heading', { name: T.finalCheck }), 20_000);
  return { prepared: ok, reason: ok ? 'final-check' : 'no-final-check' };
}

/** Click the final send button if it is present and enabled. Does not wait for the outcome. */
export async function clickSend(page) {
  const btn = page.getByRole('button', { name: T.sendBtn });
  if (!(await visible(btn, 3_000))) return 'no-send-button';
  if (!(await btn.first().isEnabled())) return 'send-disabled';
  await btn.first().click();
  return 'clicked';
}

/** Rows of the wallet-attempt journal panel, as text. */
export async function journalRows(page) {
  const region = page.getByRole('region', { name: T.journal });
  if (!(await visible(region, 500))) return null;
  return region.locator('li').evaluateAll((lis) => lis.map((li) => li.innerText));
}

function rowLocator(page, { hash, excludeHashes = [] }) {
  const rows = page.getByRole('region', { name: T.journal }).locator('li');
  if (hash !== undefined) return rows.filter({ hasText: hash });
  let r = rows;
  for (const h of excludeHashes) r = r.filter({ hasNotText: h });
  return r;
}

/** Deliberate override: click Clear on the row and accept or dismiss the confirmation. Returns whether it cleared. */
export async function clearRow(page, sel, accept) {
  const row = rowLocator(page, sel);
  if ((await row.count()) === 0) return { cleared: false, reason: 'no-row' };
  const before = (await journalRows(page))?.length ?? 0;
  let dialogText = null;
  const onDialog = (d) => {
    dialogText = d.message();
    void (accept ? d.accept() : d.dismiss());
  };
  page.once('dialog', onDialog);
  const btn = row.first().getByRole('button', { name: T.clearBtn });
  if (!(await visible(btn, 2_000))) {
    page.off('dialog', onDialog);
    return { cleared: false, reason: 'no-clear-button' };
  }
  await btn.click();
  await page.waitForTimeout(800);
  const after = (await journalRows(page))?.length ?? 0;
  return { cleared: after < before, dialogText, reason: accept ? 'accepted' : 'dismissed' };
}

/** Explicit status check on one row; returns the row's status text after the check settles. */
export async function checkRow(page, sel) {
  const row = rowLocator(page, sel).first();
  if ((await row.count()) === 0) return { checked: false, reason: 'no-row' };
  const btn = row.getByRole('button', { name: T.checkBtn });
  if (!(await visible(btn, 2_000))) return { checked: false, reason: 'no-check-button' };
  const before = await row.innerText();
  await btn.click();
  // The result may render as a status line or as an error notice inside the row (harness fix H4): wait until the
  // button is usable again and the row text changed, then classify everything below the record line.
  let text = '';
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(500);
    const busy = !(await btn.isEnabled().catch(() => true));
    const now = await row.innerText().catch(() => before);
    if (!busy && now !== before) {
      text = now;
      break;
    }
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const result = lines
    .slice(1)
    .filter((l) => ![T.checkBtn, T.clearBtn, 'Link a replacement transaction', '✖ Problem', ':'].includes(l))
    .join(' ');
  return { checked: true, text: result, cls: classify(result) };
}

/** Everything a user (or a forensic look at site data) can see in one tab. */
export async function observe(page) {
  if (page.isClosed()) return { closed: true };
  return page.evaluate(async () => {
    const txt = (el) => (el instanceof HTMLElement ? el.innerText : el?.textContent ?? '').trim();
    const main = document.querySelector('main') ?? document.body;
    const statuses = [...main.querySelectorAll('[role="status"]')].map(txt).filter(Boolean);
    const alerts = [...main.querySelectorAll('[role="alert"]')].map(txt).filter(Boolean);
    const headings = [...main.querySelectorAll('h1,h2,h3')].map(txt).filter(Boolean);
    const journal = [...document.querySelectorAll('section[aria-label="Wallet attempt journal"] li')].map(txt);
    // Checkout text outside the shared journal panel (the journal legitimately lists every intent's records).
    const clone = main.cloneNode(true);
    for (const s of clone.querySelectorAll('section[aria-label="Wallet attempt journal"]')) s.remove();
    const mainText = (clone.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    const mainHashes = [...new Set(mainText.match(/0x[0-9a-fA-F]{64}/g) ?? [])].map((h) => h.toLowerCase());
    const sendBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Send payment in my wallet');
    // Generic storage dump: no knowledge of GhostPay's schema is used, only "does this hash survive anywhere".
    const store = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) store.push(localStorage.getItem(localStorage.key(i)) ?? '');
    } catch {}
    try {
      for (let i = 0; i < sessionStorage.length; i += 1) store.push(sessionStorage.getItem(sessionStorage.key(i)) ?? '');
    } catch {}
    try {
      const dbs = (await indexedDB.databases?.()) ?? [];
      for (const info of dbs) {
        if (!info.name) continue;
        const db = await new Promise((ok, fail) => {
          const r = indexedDB.open(info.name);
          r.onsuccess = () => ok(r.result);
          r.onerror = () => fail(r.error);
          r.onupgradeneeded = () => r.transaction?.abort();
        }).catch(() => null);
        if (db === null) continue;
        try {
          for (const name of db.objectStoreNames) {
            const values = await new Promise((ok) => {
              const q = db.transaction(name, 'readonly').objectStore(name).getAll();
              q.onsuccess = () => ok(q.result);
              q.onerror = () => ok([]);
            });
            store.push(JSON.stringify(values, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? '[bytes]' : v)));
          }
        } finally {
          db.close();
        }
      }
    } catch {}
    const hashes = [...new Set(store.join('\n').match(/0x[0-9a-fA-F]{64}/g) ?? [])].map((h) => h.toLowerCase());
    return {
      closed: false,
      origin: location.origin,
      url: location.pathname + (location.hash ? '#…' : ''),
      headings,
      statuses,
      alerts,
      journal,
      mainText,
      mainHashes,
      sendButton: sendBtn === undefined ? 'absent' : sendBtn.disabled ? 'disabled' : 'enabled',
      storedHashes: hashes,
    };
  });
}

/**
 * Wait until the tab's visible state stops changing (two equal samples), with a hard cap. Transient "verifying /
 * waiting for inclusion" text keeps the wait going because the app is still polling the RPC.
 */
export async function settle(page, { capMs = 55_000, quietMs = 1_200 } = {}) {
  const start = Date.now();
  let last = '';
  let stableSince = Date.now();
  while (Date.now() - start < capMs) {
    if (page.isClosed()) return;
    const o = await observe(page).catch(() => null);
    if (o === null) return;
    const sig = JSON.stringify([o.headings, o.statuses, o.alerts, o.journal]);
    const transient = o.statuses.some((s) => /Verifying the transaction|Waiting for inclusion|A receipt appeared|Waiting for your wallet…/.test(s));
    if (sig !== last) {
      last = sig;
      stableSince = Date.now();
    } else if (!transient && Date.now() - stableSince >= quietMs) {
      return;
    }
    await page.waitForTimeout(400);
  }
}
