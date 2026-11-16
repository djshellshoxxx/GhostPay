/** One sample of a gauge. */
export interface GaugeSample {
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const LABEL_VALUE = /^[A-Za-z0-9_./:-]{0,64}$/;
const LABEL_NAMES = new Set(['chain_id', 'reason', 'route', 'status', 'outcome', 'class', 'state', 'to']);
const MAX_SERIES = 512;

/**
 * Minimal Prometheus text-format registry. Label values must match a strict charset and the number
 * of series is bounded, so request data can never create unbounded or injectable output.
 */
export class Metrics {
  private readonly counters = new Map<string, { name: string; labels: string; value: number }>();
  private readonly gauges: { name: string; help: string; read: () => readonly GaugeSample[] }[] = [];

  /**
   * Adds 1 to a counter.
   *
   * @param name Metric name (`relayer_*`, snake_case).
   * @param labels Label values; any value failing the charset check is replaced by `invalid`.
   */
  public inc(name: string, labels: Readonly<Record<string, string | number>> = {}): void {
    if (!NAME.test(name)) return;
    const l = renderLabels(labels);
    const key = `${name}{${l}}`;
    const hit = this.counters.get(key);
    if (hit !== undefined) hit.value += 1;
    else if (this.counters.size < MAX_SERIES) this.counters.set(key, { name, labels: l, value: 1 });
  }

  /**
   * Registers a gauge read at render time.
   *
   * @param name Metric name.
   * @param help One-line help text (fixed, no request data).
   * @param read Returns the current samples.
   */
  public gauge(name: string, help: string, read: () => readonly GaugeSample[]): void {
    if (!NAME.test(name) || help.includes('\n')) return;
    this.gauges.push({ name, help, read });
  }

  /** @returns The exposition text (Prometheus 0.0.4). */
  public render(): string {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const c of [...this.counters.values()].sort((a, b) => (a.name + a.labels < b.name + b.labels ? -1 : 1))) {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        out.push(`# TYPE ${c.name} counter`);
      }
      out.push(`${c.name}${c.labels === '' ? '' : `{${c.labels}}`} ${String(c.value)}`);
    }
    for (const g of this.gauges) {
      out.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
      for (const s of g.read()) {
        const l = renderLabels(s.labels);
        out.push(`${g.name}${l === '' ? '' : `{${l}}`} ${Number.isFinite(s.value) ? String(s.value) : '0'}`);
      }
    }
    return `${out.join('\n')}\n`;
  }

  /** Returns bounded aggregate counters and fixed-label gauges for the private JSON endpoint. */
  public stats(): { schemaVersion: 1; counters: Readonly<Record<string, number>>; gauges: readonly { name: string; labels: Readonly<Record<string, string>>; value: number }[] } {
    const counters = Object.create(null) as Record<string, number>;
    for (const c of this.counters.values()) counters[c.name] = (counters[c.name] ?? 0) + c.value;
    const gauges = this.gauges.flatMap((g) => g.read().map((sample) => ({
      name: g.name,
      labels: Object.fromEntries(Object.entries(sample.labels)
        .filter(([key]) => key === 'chain_id' || key === 'reason' || key === 'state')
        .map(([key, value]) => [key, LABEL_VALUE.test(value) ? value : 'invalid'])),
      value: Number.isFinite(sample.value) ? sample.value : 0,
    })));
    return { schemaVersion: 1, counters, gauges };
  }
}

function renderLabels(labels: Readonly<Record<string, string | number>>): string {
  return Object.keys(labels)
    .sort()
    .filter((k) => LABEL_NAMES.has(k))
    .map((k) => {
      const v = String(labels[k]);
      return `${k}="${LABEL_VALUE.test(v) ? v : 'invalid'}"`;
    })
    .join(',');
}
