import { expect, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Pinned test dependency only: no CDN, product import, CSP relaxation or skipped axe rules.
const testRequire = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(testRequire.resolve('axe-core/axe.min.js'), 'utf8');
interface AuditSummary {
  version: string;
  profile: string;
  route: string;
  state: string;
  rules: string;
  passes: number;
  violations: { id: string; impact: string | null; helpUrl: string }[];
  incomplete: string[];
}
const records = new WeakMap<Page, AuditSummary[]>();

export async function auditAccessibility(page: Page, state: string): Promise<void> {
  // Playwright instrumentation evaluates local audit source without changing production CSP.
  await page.evaluate(AXE_SOURCE);
  const result = await page.evaluate(async () => {
    // axe-core is injected above as a page global that the DOM lib types do not declare.
    // Fail loudly if injection did not define it rather than reporting an empty audit.
    const axe = (window as unknown as { axe?: { run: (context: Document) => Promise<AxeResults> } }).axe;
    if (axe === undefined || typeof axe.run !== 'function') throw new Error('axe-core was not injected into the page');
    return axe.run(document);
  });
  const summary: AuditSummary = {
    version: result.testEngine.version, profile: process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full',
    route: (await page.getByRole('navigation').locator('[aria-current="page"]').textContent()) ?? '',
    state, rules: 'all default enabled axe rules; no exclusions', passes: result.passes.length,
    violations: result.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, helpUrl: v.helpUrl })),
    incomplete: result.incomplete.map((v) => v.id),
  };
  const states = records.get(page) ?? [];
  if (!records.has(page)) records.set(page, states);
  states.push(summary);
  expect(summary.passes, `${state}: axe must actually evaluate the page`).toBeGreaterThan(0);
  const blocking = summary.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking, `${state}: ${JSON.stringify(blocking)}`).toEqual([]);
  // Incomplete/manual checks remain visible; zero violations is not a compliance certification.
}

export async function retainAccessibilityAudit(page: Page, info: TestInfo): Promise<void> {
  const states = records.get(page);
  if (states === undefined || states.length === 0) return;
  // Deliberately retain rule metadata only: no DOM, selectors, HTML, invoice facts, keys or receipts.
  const summary = { format: 'ghostpay-accessibility-audit/1', states,
    limits: 'Automated route/state checks only. Incomplete rules and native assistive-technology review remain unresolved.' };
  const output = info.outputPath('accessibility-audit.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  await info.attach('accessibility-audit', { path: output, contentType: 'application/json' });
  if (info.status === 'passed') console.log('GHOSTPAY_A11Y_RECORD=' + JSON.stringify(summary));
}
