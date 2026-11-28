// W5 independent payment-state verifier: black-box SELLER driver (milestone 2).
// Original work. Drives Seller keys, Create invoice (with reconciliation registration) and Scan and receive purely by
// accessible names and the visible English text in apps/web/locales/en.json; observes the ledger as rendered text.

export const SELLER_PASSPHRASE = 'w5 synthetic seller vault passphrase';
const REGISTER_LABEL = 'Register this invoice in my encrypted reconciliation vault for automatic local matching';

async function visible(locator, timeout = 0) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: Math.max(timeout, 1) });
    return true;
  } catch {
    return false;
  }
}
const nav = (page) => page.getByRole('navigation', { name: 'Main' });

/** Fresh seller keys, saved in the browser's encrypted seller vault so they survive reloads and other tabs. */
export async function createSellerKeys(page, origin) {
  await page.goto(`${origin}/`);
  await nav(page).getByRole('button', { name: 'Seller keys' }).click();
  await page.getByRole('button', { name: 'Generate new keys' }).click();
  await page.getByLabel(/To continue without a backup, type/).fill('continue without backup');
  await page.getByRole('button', { name: 'Continue without a backup' }).click();
  await page.locator('code', { hasText: /^st:eth:0x/ }).first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByLabel('New vault passphrase (14+ characters)').fill(SELLER_PASSPHRASE);
  await page.getByLabel('Repeat vault passphrase').fill(SELLER_PASSPHRASE);
  await page.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  if (!(await visible(page.getByText('Encrypted seller vault saved in this browser'), 30_000))) throw new Error('harness: seller vault was not saved');
}

/** Load the seller keys from the browser vault in this tab (after a reload, in a second tab, after an idle lock). */
export async function unlockSellerKeys(page, origin) {
  if (page.url() === 'about:blank' || !page.url().startsWith(origin)) await page.goto(`${origin}/`);
  await nav(page).getByRole('button', { name: 'Seller keys' }).click();
  if (await visible(page.locator('code', { hasText: /^st:eth:0x/ }), 1_500)) return 'already-loaded';
  const pass = page.getByLabel('Vault passphrase', { exact: true });
  if (!(await visible(pass, 10_000))) return 'no-vault-form';
  await pass.fill(SELLER_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock saved vault' }).click();
  return (await visible(page.locator('code', { hasText: /^st:eth:0x/ }), 30_000)) ? 'unlocked' : 'unlock-failed';
}

/** Create a fixed-price native invoice on Base Sepolia, registered for local matching. Returns { link }. */
export async function createRegisteredInvoice(page, { amount, hours, description }) {
  await nav(page).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount').fill(amount);
  await page.getByLabel('Item 1 description').fill(description);
  await page.getByLabel('Item 1 unit price').fill('50.00');
  if (hours !== undefined) await page.getByLabel('Invoice valid for (hours)').fill(String(hours));
  // By role: the same text also labels a context-help button (harness fix H8).
  const reg = page.getByRole('checkbox', { name: REGISTER_LABEL, exact: true });
  if (!(await visible(reg, 5_000))) throw new Error('harness: registration checkbox not found');
  await reg.check();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await box.waitFor({ state: 'visible', timeout: 20_000 });
  const link = await box.inputValue();
  if (!link.includes('#gpi=v1.')) throw new Error('harness: invoice link has unexpected shape');
  const registered = await visible(page.getByText(/Invoice registered in your encrypted reconciliation vault/), 15_000);
  return { link, registered };
}

export async function openScan(page) {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByRole('heading', { level: 2, name: 'Scan and receive' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
}

/**
 * Run one scan. `fromStart` unchecks "Resume from checkpoint" (full rescan from block 0). Resolves with the final
 * status/alert text; `onStarted` lets a scenario inject a fault while the scan runs.
 */
export async function runScan(page, { fromStart = false, capMs = 60_000, onStarted, beforeStart } = {}) {
  await openScan(page);
  const resume = page.getByRole('checkbox', { name: 'Resume from checkpoint', exact: true });
  if ((await resume.count()) > 0) {
    if (fromStart) await resume.uncheck();
    else await resume.check();
  }
  const start = page.getByLabel('Start block');
  if ((await start.count()) > 0 && (await start.isEditable().catch(() => false))) await start.fill('0');
  // A fault is armed right before the click so it cannot lose a race with a fast scan (audit finding 11).
  if (beforeStart !== undefined) await beforeStart();
  await page.getByRole('button', { name: 'Start scan' }).click();
  if (onStarted !== undefined) await onStarted();
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    const done = await page.getByText(/^Finished\./).count();
    const alerts = await page.locator('section[aria-labelledby="scan-h"] [role="alert"]').allInnerTexts().catch(() => []);
    const startEnabled = await page.getByRole('button', { name: 'Start scan' }).isEnabled().catch(() => false);
    if (done > 0) return { outcome: 'finished', text: (await page.getByText(/^Finished\./).first().innerText()).slice(0, 300), alerts };
    if (alerts.length > 0 && startEnabled) return { outcome: 'error', alerts: alerts.map((a) => a.replace(/\s+/g, ' ').slice(0, 300)) };
    await page.waitForTimeout(400);
  }
  return { outcome: 'timeout' };
}

export async function unlockLedger(page) {
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  if (!(await visible(ledger, 5_000))) return 'no-ledger';
  const btn = ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault' });
  if (await visible(btn, 1_500)) {
    await btn.click();
    await page.waitForTimeout(1_000);
    return 'unlocked';
  }
  return 'already-unlocked';
}

/** Click the first visible proposal/acceptance button with this exact name. */
export async function clickLedgerAction(page, name) {
  const btn = page.getByRole('button', { name, exact: true });
  if (!(await visible(btn, 3_000))) return 'no-button';
  if (!(await btn.first().isEnabled())) return 'disabled';
  await btn.first().click();
  await page.waitForTimeout(2_000);
  return 'clicked';
}

/** Everything the seller can read on the Scan view: found payments, ledger records, registered invoice cards. */
export async function observeSeller(page) {
  if (page.isClosed()) return { closed: true };
  return page.evaluate(() => {
    const t = (el) => (el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const scan = document.querySelector('section[aria-labelledby="scan-h"]');
    const ledger = document.querySelector('section[aria-labelledby="ledger-heading"], .reconciliation-ledger');
    const matches = [...(scan?.querySelectorAll('.matches > li') ?? [])].map(t);
    // Registered invoice cards: li.card elements whose text names an invoice digest.
    const cards = [...(ledger?.querySelectorAll('li.card') ?? [])]
      .map((li) => ({ text: t(li), digest: (t(li).match(/Invoice (0x[0-9a-f]{64})/i) ?? [])[1]?.toLowerCase() ?? null, units: (t(li).match(/(\d{6,}) base units of native/) ?? [])[1] ?? null, validUntil: (t(li).match(/valid until ([0-9T:.\-]+Z)/) ?? [])[1] ?? null }))
      // Only registered-invoice cards ("Invoice 0x… N base units of native; valid until …"); stored observation
      // records are also li.card but carry no amount line (harness fix H9).
      .filter((c) => c.units !== null && /^Invoice 0x[0-9a-f]{64}/i.test(c.text));
    return {
      closed: false,
      origin: location.origin,
      headings: [...document.querySelectorAll('main h1, main h2, main h3')].map(t).slice(0, 12),
      scanStatus: [...(scan?.querySelectorAll('[role="status"]') ?? [])].map(t).filter(Boolean),
      alerts: [...document.querySelectorAll('main [role="alert"]')].map(t).filter(Boolean),
      matches,
      ledgerText: t(ledger).slice(0, 12_000),
      ledgerLocked: !!ledger && [...ledger.querySelectorAll('button')].some((b) => /Unlock encrypted reconciliation vault/.test(b.textContent ?? '')),
      cards,
      buttons: [...(ledger?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean),
    };
  });
}

/** Export the encrypted reconciliation backup; returns the saved file path. */
export async function exportBackup(page, dir) {
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  const btn = ledger.getByRole('button', { name: 'Export encrypted reconciliation backup' });
  if (!(await visible(btn, 5_000))) return { exported: false, reason: 'no-export-button' };
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), btn.click()]);
  const path = `${dir}/reconciliation-backup-${Date.now()}.json`;
  await download.saveAs(path);
  return { exported: true, path };
}

/** "Delete encrypted observations", accepting its confirmation. */
export async function deleteObservations(page) {
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  const btn = ledger.getByRole('button', { name: 'Delete encrypted observations' });
  if (!(await visible(btn, 5_000))) return { deleted: false, reason: 'no-delete-button' };
  let dialog = null;
  page.once('dialog', (d) => {
    dialog = d.message().slice(0, 200);
    void d.accept().catch(() => undefined);
  });
  await btn.click();
  await page.waitForTimeout(1_500);
  // Effective only if the app asked for (and got) confirmation (audit finding 7).
  return { deleted: dialog !== null, dialog };
}

/** Import a backup file: preview, then activate. Returns the preview text and any alert. */
export async function importBackup(page, path) {
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  const input = ledger.getByLabel('Encrypted reconciliation backup file', { exact: true });
  if ((await input.count()) === 0) return { imported: false, reason: 'no-file-input' };
  await input.setInputFiles(path);
  const preview = ledger.getByRole('button', { name: 'Preview encrypted backup' });
  if (!(await visible(preview, 5_000))) return { imported: false, reason: 'no-preview-button' };
  await preview.click();
  const activate = ledger.getByRole('button', { name: 'Activate previewed historical records' });
  const shown = await visible(activate, 15_000);
  const previewText = (await ledger.innerText()).match(/\d+ historical observation\(s\)[^\n]*|Activating would mark[^\n]*/g) ?? [];
  if (!shown) return { imported: false, reason: 'no-activate-button', previewText, alerts: await ledger.getByRole('alert').allInnerTexts() };
  await activate.click();
  await page.waitForTimeout(2_000);
  return { imported: true, previewText, alerts: (await ledger.getByRole('alert').allInnerTexts()).map((a) => a.replace(/\s+/g, ' ').slice(0, 200)) };
}

/** Manual link of the first live match to an invoice digest ("Add verified payment to ledger"). */
export async function manualLink(page, digest) {
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  const field = ledger.getByLabel('Invoice digest (optional, manual link)');
  if (!(await visible(field, 3_000))) return { linked: false, reason: 'no-manual-link-field' };
  await field.first().fill(digest);
  const btn = ledger.getByRole('button', { name: 'Add verified payment to ledger' });
  if (!(await visible(btn, 2_000))) return { linked: false, reason: 'no-add-button' };
  await btn.first().click();
  await page.waitForTimeout(2_000);
  const alerts = (await page.locator('main [role="alert"]').allInnerTexts()).map((a) => a.replace(/\s+/g, ' ').slice(0, 200));
  // A refusal shows as an alert; the caller additionally confirms the invoice card changed (audit finding 7).
  const refused = alerts.some((a) => /no longer has a single exact invoice match|invalidated by a reorg|cannot|refus/i.test(a));
  return { linked: !refused, clicked: 'clicked', alerts, refused };
}
