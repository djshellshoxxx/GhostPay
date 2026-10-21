import type { DeploymentManifest, RpcClient } from '@ghostpay/chain-adapters';

/** Identifier of a check (see spec section 2). */
export type ProbeId = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6';

/** Alert severity. `info` means healthy; only `warn` and `page` leave the process as webhooks. */
export type Severity = 'info' | 'warn' | 'page';

/**
 * One observation.
 *
 * @security `subject` is ALWAYS a configured contract/relayer address, a configured mirror URL, or the
 * literal `monitor` for internal faults. It is never a user stealth address, IP or any value read from
 * a client. `detail` contains fixed text, hex hashes and counters only; raw errors are reduced to a code.
 */
export interface Finding {
  readonly id: ProbeId;
  readonly severity: Severity;
  readonly chainId?: number;
  readonly subject: string;
  readonly detail: string;
}

/** Minimal `Response` subset used by W1/W3. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Injectable fetch (tests, or a hardened client). Must not follow redirects to other origins. */
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/** Release artefacts to verify (W1 mirror copies, W3). */
export interface ReleaseConfig {
  /** Operator-owned mirror base URLs, e.g. `https://pay.example.org`. Used verbatim as finding subjects. */
  readonly mirrors: readonly string[];
  /** Text of the release `SHA256SUMS` (`<hex>  <path>` per line). */
  readonly sha256sums: string;
  /** Paths (relative to a mirror) to verify, e.g. `index.html` and the entry script. */
  readonly files: readonly string[];
  /** Release copy of each `deployments/<chainId>.json`, for the W1 mirror comparison. */
  readonly manifestCopies?: Readonly<Record<number, string>>;
  /** Injected fetch; default is global fetch with `redirect: 'error'` and a 10 s timeout. */
  readonly fetch?: FetchLike;
  /** Per-file size cap, default 8 MiB. */
  readonly maxBytes?: number;
}

/** Everything a probe may read. */
export interface MonitorContext {
  /** Verified RPC clients (several per chain are allowed and needed for W6). */
  readonly rpcs: readonly RpcClient[];
  /** Release manifests, one per monitored chain. */
  readonly manifests: readonly DeploymentManifest[];
  /** Release artefacts; probes needing it report `warn` when absent. */
  readonly release?: ReleaseConfig;
  /** Wall-clock ms (injected for determinism). */
  readonly now: number;
}

/** A single read-only check. */
export interface Probe {
  readonly id: ProbeId;
  /** Must not mutate anything; may throw (the runner converts a throw into a `warn`). */
  run(ctx: MonitorContext): Promise<Finding[]>;
}

/** JSON body produced by `toWebhook`. */
export interface WebhookPayload {
  readonly version: 1;
  readonly generatedAt: number;
  readonly findings: readonly Finding[];
}
