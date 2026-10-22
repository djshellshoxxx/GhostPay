/** One sample of a gauge. */
export interface GaugeSample {
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const LABEL_VALUE = /^[A-Za-z0-9_./:-]{0,64}$/;
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
}

function renderLabels(labels: Readonly<Record<string, string | number>>): string {
  return Object.keys(labels)
    .sort()
    .filter((k) => NAME.test(k))
    .map((k) => {
      const v = String(labels[k]);
      return `${k}="${LABEL_VALUE.test(v) ? v : 'invalid'}"`;
    })
    .join(',');
}
