import { requireConfig } from './errors.js';
import type { Finding, Severity, WebhookPayload } from './types.js';

const RANK: Record<Severity, number> = { info: 0, warn: 1, page: 2 };

/** Escapes a Prometheus label value (backslash, double quote, newline). */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Renders findings in the Prometheus text exposition format (version 0.0.4).
 *
 * @remarks Emits `ghostpay_ops_finding_severity{check,chain_id,subject}` (0 info, 1 warn, 2 page; the
 * worst severity wins when label sets repeat) and `ghostpay_ops_check_severity{check}` (worst per check).
 * Label values are escaped; `detail` is deliberately not exported as a label.
 *
 * @param findings Findings from {@link runOnce}.
 * @returns Text ending in a newline.
 */
export function toPrometheus(findings: readonly Finding[]): string {
  const series = new Map<string, number>();
  const checks = new Map<string, number>();
  for (const f of findings) {
    const labels = [`check="${esc(f.id)}"`];
    if (f.chainId !== undefined) labels.push(`chain_id="${String(f.chainId)}"`);
    labels.push(`subject="${esc(f.subject)}"`);
    const key = labels.join(',');
    const r = RANK[f.severity];
    series.set(key, Math.max(series.get(key) ?? 0, r));
    checks.set(f.id, Math.max(checks.get(f.id) ?? 0, r));
  }
  const lines = [
    '# HELP ghostpay_ops_finding_severity Severity of a finding (0 info, 1 warn, 2 page).',
    '# TYPE ghostpay_ops_finding_severity gauge',
    ...[...series].map(([k, v]) => `ghostpay_ops_finding_severity{${k}} ${String(v)}`),
    '# HELP ghostpay_ops_check_severity Worst severity per check (0 info, 1 warn, 2 page).',
    '# TYPE ghostpay_ops_check_severity gauge',
    ...[...checks].map(([k, v]) => `ghostpay_ops_check_severity{check="${esc(k)}"} ${String(v)}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Last-sent times (ms) per alert key; keep one per webhook destination. */
export type DedupeState = Map<string, number>;

/** @returns A fresh empty {@link DedupeState}. */
export function createDedupeState(): DedupeState {
  return new Map();
}

/**
 * Builds a webhook payload from `warn`/`page` findings not already sent within the window.
 *
 * @remarks Key is check, chain, subject and severity, so an escalation warn to page re-alerts while a
 * repeat does not. Sent keys are recorded in `state`; expired keys are pruned. Mutates `state` only.
 * @security Alerts must not be the sole trigger of any user-facing kill switch (spec section 4).
 *
 * @param findings Findings from {@link runOnce}.
 * @param dedupeWindowMs Suppression window, finite and >= 0.
 * @param state Dedupe memory.
 * @param now Current time in ms.
 * @returns Payload, or `null` when there is nothing new to send.
 * @throws {MonitorError} `INVALID_CONFIG` for a bad window.
 */
export function toWebhook(
  findings: readonly Finding[],
  dedupeWindowMs: number,
  state: DedupeState,
  now: number,
): WebhookPayload | null {
  requireConfig(Number.isFinite(dedupeWindowMs) && dedupeWindowMs >= 0, 'dedupeWindowMs');
  for (const [k, t] of state) if (now - t >= dedupeWindowMs) state.delete(k);
  const fresh: Finding[] = [];
  for (const f of findings) {
    if (f.severity === 'info') continue;
    const key = `${f.id}|${String(f.chainId ?? '')}|${f.subject}|${f.severity}`;
    if (state.has(key)) continue;
    state.set(key, now);
    fresh.push(f);
  }
  return fresh.length === 0 ? null : { version: 1, generatedAt: now, findings: fresh };
}
