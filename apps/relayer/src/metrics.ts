/** Metric definitions: name -> type and help. Labels are restricted to bounded, non-identifying values. */
const DEFS = {
  ghostpay_relayer_http_requests_total: ['counter', 'HTTP requests by route and status.'],
  ghostpay_relayer_errors_total: ['counter', 'Rejected requests by fixed error class.'],
  ghostpay_relayer_sweeps_total: ['counter', 'Sweep outcomes per chain (sent, reverted, send_failed, receipt_timeout).'],
  ghostpay_relayer_failed_gas_wei_total: ['counter', 'Wei paid for reverted sweep transactions.'],
  ghostpay_relayer_alerts_total: ['counter', 'Alerts raised by kind.'],
  ghostpay_relayer_breaker_state: ['gauge', 'Circuit breaker: 0 closed, 1 half_open, 2 open.'],
  ghostpay_relayer_hot_balance_wei: ['gauge', 'Last observed hot-key native balance in wei (float precision).'],
  ghostpay_relayer_daily_budget_used_wei: ['gauge', 'Gas spent today (reserved or used) in wei.'],
  ghostpay_relayer_daily_budget_limit_wei: ['gauge', 'Configured daily gas budget in wei.'],
  ghostpay_relayer_queue_pending: ['gauge', 'Sweeps running or waiting per chain.'],
} as const;

/** Names of the defined metrics. */
export type MetricName = keyof typeof DEFS;

const LABEL_VALUE = /^[a-z0-9_./:-]{1,64}$/;
/** Hard bound on distinct series (memory safety against label explosion). */
const MAX_SERIES = 512;

/**
 * Minimal Prometheus text-format registry. There is no free-form label API: callers pass short values that
 * are re-validated, and anything else becomes `other`. No address, IP, hash or amount can reach a label.
 */
export class Metrics {
  private readonly series = new Map<string, { name: MetricName; labels: string; value: number }>();

  /** Adds `by` to a counter. */
  public inc(name: MetricName, labels: Readonly<Record<string, string | number>> = {}, by = 1): void {
    const s = this.slot(name, labels);
    if (s !== undefined) s.value += by;
  }

  /** Sets a gauge. */
  public set(name: MetricName, labels: Readonly<Record<string, string | number>>, value: number): void {
    const s = this.slot(name, labels);
    if (s !== undefined) s.value = value;
  }

  /** @returns The exposition text. */
  public render(): string {
    const out: string[] = [];
    for (const [name, [type, help]] of Object.entries(DEFS)) {
      const rows = [...this.series.values()].filter((s) => s.name === name);
      if (rows.length === 0) continue;
      out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
      for (const r of rows) out.push(`${name}${r.labels} ${Number.isFinite(r.value) ? String(r.value) : '0'}`);
    }
    return `${out.join('\n')}\n`;
  }

  private slot(name: MetricName, labels: Readonly<Record<string, string | number>>): { name: MetricName; labels: string; value: number } | undefined {
    const parts = Object.keys(labels)
      .sort()
      .map((k) => {
        const v = String(labels[k]);
        return `${k}="${LABEL_VALUE.test(v) ? v : 'other'}"`;
      });
    const text = parts.length === 0 ? '' : `{${parts.join(',')}}`;
    const key = `${name}${text}`;
    let s = this.series.get(key);
    if (s === undefined) {
      if (this.series.size >= MAX_SERIES) return undefined;
      s = { name, labels: text, value: 0 };
      this.series.set(key, s);
    }
    return s;
  }
}
