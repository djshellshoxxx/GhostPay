/** One sample of a gauge. */
export interface GaugeSample {
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const LABEL_VALUE = /^[A-Za-z0-9_./:-]{0,64}$/;
const LABEL_NAMES = new Set(['chain_id', 'reason', 'route', 'status', 'outcome', 'class', 'state', 'to']);
const MAX_SERIES = 512;
const MAX_HISTOGRAMS = 64;
const LATENCY_BUCKETS = [0.01, 0.1, 0.5, 1, 5, 15, 60, 300] as const;

interface Histogram {
  readonly name: string;
  readonly labels: string;
  readonly safeLabels: Readonly<Record<string, string>>;
  readonly buckets: number[];
  count: number;
  sum: number;
}

/** JSON counters retain their existing shape; large integer totals have a separate exact decimal representation. */
export interface MetricsSnapshot {
  readonly schemaVersion: 1;
  readonly counters: Readonly<Record<string, number>>;
  readonly integerCounters: Readonly<Record<string, string>>;
  readonly integerSamples: readonly { name: string; labels: Readonly<Record<string, string>>; value: string }[];
  readonly gauges: readonly { name: string; labels: Readonly<Record<string, string>>; value: number }[];
  readonly histograms: readonly { name: string; labels: Readonly<Record<string, string>>; count: number; sum: number; buckets: readonly { le: number | '+Inf'; count: number }[] }[];
}

/**
 * Minimal Prometheus text-format registry. Label values must match a strict charset and the number
 * of series is bounded, so request data can never create unbounded or injectable output.
 */
export class Metrics {
  private readonly counters = new Map<string, { name: string; labels: string; value: number }>();
  private readonly integers = new Map<string, { name: string; labels: string; safeLabels: Readonly<Record<string, string>>; value: bigint }>();
  private readonly histograms = new Map<string, Histogram>();
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

  /** Adds a nonnegative exact integer amount, without a floating-point conversion. */
  public addInteger(name: string, value: bigint, labels: Readonly<Record<string, string | number>> = {}): void {
    if (!NAME.test(name) || value < 0n) return;
    const rendered = renderLabels(labels);
    const key = `${name}{${rendered}}`;
    const hit = this.integers.get(key);
    if (hit !== undefined) hit.value += value;
    else if (this.integers.size < MAX_SERIES) this.integers.set(key, { name, labels: rendered, safeLabels: safeLabels(labels), value });
  }

  /** Observes a duration with fixed buckets and a fixed cap on histogram series. */
  public observe(name: string, seconds: number, labels: Readonly<Record<string, string | number>> = {}): void {
    if (!NAME.test(name) || !Number.isFinite(seconds) || seconds < 0) return;
    const rendered = renderLabels(labels);
    const key = `${name}{${rendered}}`;
    let hit = this.histograms.get(key);
    if (hit === undefined) {
      if (this.histograms.size >= MAX_HISTOGRAMS) return;
      hit = { name, labels: rendered, safeLabels: safeLabels(labels), buckets: LATENCY_BUCKETS.map(() => 0), count: 0, sum: 0 };
      this.histograms.set(key, hit);
    }
    if (!Number.isFinite(hit.sum + seconds)) return;
    hit.count += 1;
    hit.sum += seconds;
    LATENCY_BUCKETS.forEach((upper, index) => { if (seconds <= upper) hit.buckets[index] = (hit.buckets[index] ?? 0) + 1; });
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
    for (const counter of this.integers.values()) {
      if (!seen.has(counter.name)) { seen.add(counter.name); out.push(`# TYPE ${counter.name} counter`); }
      out.push(`${counter.name}${counter.labels === '' ? '' : `{${counter.labels}}`} ${counter.value.toString()}`);
    }
    for (const h of this.histograms.values()) {
      if (!seen.has(h.name)) { seen.add(h.name); out.push(`# TYPE ${h.name} histogram`); }
      const prefix = h.labels === '' ? '' : `${h.labels},`;
      LATENCY_BUCKETS.forEach((upper, index) => out.push(`${h.name}_bucket{${prefix}le="${String(upper)}"} ${String(h.buckets[index])}`));
      out.push(`${h.name}_bucket{${prefix}le="+Inf"} ${String(h.count)}`);
      const labels = h.labels === '' ? '' : `{${h.labels}}`;
      out.push(`${h.name}_sum${labels} ${String(h.sum)}`, `${h.name}_count${labels} ${String(h.count)}`);
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
  public stats(): MetricsSnapshot {
    const counters = Object.create(null) as Record<string, number>;
    for (const c of this.counters.values()) counters[c.name] = (counters[c.name] ?? 0) + c.value;
    const gauges = this.gauges.flatMap((g) => g.read().map((sample) => ({
      name: g.name,
      labels: Object.fromEntries(Object.entries(sample.labels)
        .filter(([key]) => key === 'chain_id' || key === 'reason' || key === 'state')
        .map(([key, value]) => [key, LABEL_VALUE.test(value) ? value : 'invalid'])),
      value: Number.isFinite(sample.value) ? sample.value : 0,
    })));
    const integerTotals = new Map<string, bigint>();
    for (const c of this.integers.values()) integerTotals.set(c.name, (integerTotals.get(c.name) ?? 0n) + c.value);
    const integerCounters = Object.fromEntries([...integerTotals].map(([name, value]) => [name, value.toString()]));
    const integerSamples = [...this.integers.values()].map((c) => ({ name: c.name, labels: c.safeLabels, value: c.value.toString() }));
    const histograms = [...this.histograms.values()].map((h) => ({
      name: h.name, labels: h.safeLabels, count: h.count, sum: h.sum,
      buckets: [...LATENCY_BUCKETS.map((le, index) => ({ le, count: h.buckets[index] ?? 0 })), { le: '+Inf' as const, count: h.count }],
    }));
    return { schemaVersion: 1, counters, integerCounters, integerSamples, gauges, histograms };
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

function safeLabels(labels: Readonly<Record<string, string | number>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(labels)
    .filter(([key]) => LABEL_NAMES.has(key))
    .map(([key, value]) => [key, LABEL_VALUE.test(String(value)) ? String(value) : 'invalid']));
}
