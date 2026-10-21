import { PluginError } from './errors.js';
import { capabilityFor, validateManifest, type PluginManifest, type PrivacyKind } from './manifest.js';
import {
  KIND_FIELD,
  MAX_BATCH_SIZE,
  MAX_DELAY_SECONDS,
  isWeaker,
  readRestrictions,
  tighten,
  validateSettings,
  type PrivacyRestrictions,
  type PrivacySettings,
} from './privacy.js';
import { createContext, type NetworkPort, type PluginContext, type StoragePort } from './sandbox.js';
import { ShapeError, readArray, readBool, readInt, readShape, readString, textRe } from './validate.js';

/** Default and maximum per-hook timeout, ms. */
export const DEFAULT_HOOK_TIMEOUT_MS = 1000;
export const MAX_HOOK_TIMEOUT_MS = 10_000;
/** Maximum registered plugins. */
export const MAX_PLUGINS = 32;
/** Maximum options a plugin may return per call. */
export const MAX_OPTIONS_PER_PLUGIN = 8;

/** Read-only invoice facts given to hooks. No memo, line items or payer data. */
export interface InvoiceView {
  readonly chainId: string;
  readonly asset: string;
  /** Base units, canonical decimal string. */
  readonly amount: string;
  /** Unix seconds. */
  readonly expiresAt: number;
}

/** A selectable privacy option offered by a plugin. */
export interface PrivacyOptionInput {
  readonly id: string;
  readonly kind: PrivacyKind;
  readonly label: string;
  /** Seconds for `delay`, boolean for `relay`, set size for `batching`. */
  readonly value: number | boolean;
  /** Must be `true` iff the option is less private than the current effective setting. */
  readonly downgrade?: boolean;
  /** Required when `downgrade` is true; shown to the user. */
  readonly downgradeReason?: string;
}

/** What `onInvoiceCreate` may return. */
export interface InvoiceHookOutput {
  readonly restrictions?: PrivacyRestrictions;
}

/** What `privacyOptions` may return. */
export interface PrivacyOptionsOutput {
  readonly restrictions?: PrivacyRestrictions;
  readonly options?: readonly PrivacyOptionInput[];
}

/** Hook implementations. Each must be backed by a declared capability. */
export interface PluginHooks {
  readonly onInvoiceCreate?: (
    ctx: PluginContext,
    invoice: InvoiceView,
  ) => InvoiceHookOutput | undefined | Promise<InvoiceHookOutput | undefined>;
  readonly privacyOptions?: (
    ctx: PluginContext,
    invoice: InvoiceView,
  ) => PrivacyOptionsOutput | undefined | Promise<PrivacyOptionsOutput | undefined>;
}

/** A statically bundled plugin: manifest plus function references. Never code strings. */
export interface PluginModule {
  readonly manifest: PluginManifest;
  readonly hooks: PluginHooks;
}

/** What the host (after user consent) grants. Anything not granted is denied. */
export interface PermissionGrant {
  readonly network?: readonly string[];
  readonly storage?: boolean;
  readonly downgrade?: boolean;
}

/** Injected timer (defaults to globalThis timers). */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Registry configuration. */
export interface RegistryOptions {
  /** Host privacy defaults; plugins can never silently go below these. */
  readonly defaults: PrivacySettings;
  readonly hookTimeoutMs?: number;
  readonly scheduler?: Scheduler;
  /** Unix ms clock exposed to plugins as `ctx.now()`. */
  readonly clock?: () => number;
  readonly network?: NetworkPort;
  readonly storage?: StoragePort;
}

/** Public description of a registered plugin. */
export interface RegisteredPlugin {
  readonly manifest: PluginManifest;
  readonly required: boolean;
  readonly granted: {
    readonly network: readonly string[];
    readonly storage: boolean;
    readonly downgrade: boolean;
  };
}

/** An option that passed validation. `key` is `pluginId/optionId`. */
export interface AcceptedOption {
  readonly key: string;
  readonly pluginId: string;
  readonly id: string;
  readonly kind: PrivacyKind;
  readonly label: string;
  readonly value: number | boolean;
  readonly downgrade: boolean;
  readonly downgradeReason: string | undefined;
}

/** Why a hook contributed nothing. Plugin error text is never propagated. */
export type FailureCode = 'TIMEOUT' | 'THREW' | 'BAD_OUTPUT';

/** Result of {@link PluginRegistry.evaluateInvoice}. */
export interface PrivacyEvaluation {
  readonly defaults: PrivacySettings;
  /** Defaults tightened by every plugin restriction; never weaker than defaults. */
  readonly effective: PrivacySettings;
  /** Sorted by key. */
  readonly options: readonly AcceptedOption[];
  /** Subset of `options` with `downgrade: true`; the UI must surface each one. */
  readonly downgrades: readonly AcceptedOption[];
  readonly failures: readonly {
    readonly pluginId: string;
    readonly hook: string;
    readonly code: FailureCode;
  }[];
  readonly rejectedOptions: readonly {
    readonly pluginId: string;
    readonly index: number;
    readonly reason: string;
  }[];
}

/** User's choice of options. */
export interface PrivacySelection {
  readonly optionKeys: readonly string[];
  /** Keys of downgrade options the user explicitly confirmed. */
  readonly acknowledgedDowngrades: readonly string[];
}

/** Result of {@link applyPrivacySelection}. */
export interface AppliedPrivacy {
  readonly settings: PrivacySettings;
  /** Downgrade option keys that were applied (for audit/UI). */
  readonly appliedDowngrades: readonly string[];
}

const OPTION_ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const LABEL_RE = textRe(64);
const REASON_RE = textRe(200);
const HOOK_NAMES = ['onInvoiceCreate', 'privacyOptions'] as const;

interface Entry {
  readonly manifest: PluginManifest;
  readonly hooks: PluginHooks;
  readonly required: boolean;
  readonly granted: RegisteredPlugin['granted'];
  readonly kinds: ReadonlySet<PrivacyKind>;
}

const TIMEOUT = Symbol('timeout');

function readInvoiceView(value: InvoiceView): InvoiceView {
  try {
    const r = readShape(value, ['chainId', 'asset', 'amount', 'expiresAt'], [], 'invoice');
    return Object.freeze({
      chainId: readString(r.chainId, /^[1-9][0-9]{0,19}$/, 'invoice.chainId'),
      asset: readString(r.asset, /^[A-Za-z0-9][A-Za-z0-9:/._-]{0,127}$/, 'invoice.asset'),
      amount: readString(r.amount, /^(?:0|[1-9][0-9]{0,77})$/, 'invoice.amount'),
      expiresAt: readInt(r.expiresAt, 0, 9_999_999_999, 'invoice.expiresAt'),
    });
  } catch (e) {
    if (e instanceof ShapeError) throw new PluginError('CONFIG', e.path);
    throw e;
  }
}

/**
 * Deterministic, deny-by-default plugin registry.
 *
 * @remarks Plugins run sequentially in ascending `id` order; each hook gets a fresh
 * capability-scoped context revoked when the hook settles or times out. Failures
 * are isolated: the plugin contributes nothing and a {@link FailureCode} is
 * recorded. Plugins registered with `required: true` make the whole evaluation
 * fail closed instead.
 */
export class PluginRegistry {
  private readonly entries = new Map<string, Entry>();
  private sealed = false;
  private readonly defaults: PrivacySettings;
  private readonly timeoutMs: number;
  private readonly scheduler: Scheduler;
  private readonly clock: () => number;
  private readonly network: NetworkPort | undefined;
  private readonly storage: StoragePort | undefined;

  /**
   * @throws {PluginError} `CONFIG` for invalid defaults or timeout.
   */
  public constructor(options: RegistryOptions) {
    this.defaults = validateSettings(options.defaults);
    const t = options.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
    if (!Number.isSafeInteger(t) || t < 1 || t > MAX_HOOK_TIMEOUT_MS)
      throw new PluginError('CONFIG', 'hookTimeoutMs');
    this.timeoutMs = t;
    this.scheduler = options.scheduler ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
    };
    this.clock = options.clock ?? (() => Date.now());
    this.network = options.network;
    this.storage = options.storage;
  }

  /**
   * Registers a plugin.
   *
   * @param plugin Statically bundled module.
   * @param grant Host/user grant; effective permissions = requested ∩ granted.
   * @param opts `required: true` makes any failure of this plugin fail the evaluation.
   * @returns The registered description.
   * @throws {PluginError} `MANIFEST`, `REGISTRY` (sealed, duplicate id, hook/capability mismatch, non-function hook), `LIMIT`.
   * @security Trust boundary: hooks must exactly match declared capabilities;
   * nothing is loaded from strings or URLs.
   */
  public register(
    plugin: PluginModule,
    grant: PermissionGrant = {},
    opts: { required?: boolean } = {},
  ): RegisteredPlugin {
    if (this.sealed) throw new PluginError('REGISTRY', 'sealed');
    if (this.entries.size >= MAX_PLUGINS) throw new PluginError('LIMIT', 'plugins');
    let hooksIn: Record<string, unknown>;
    let manifest: PluginManifest;
    try {
      const r = readShape(plugin, ['manifest', 'hooks'], [], '');
      manifest = validateManifest(r.manifest);
      hooksIn = readShape(r.hooks, [], HOOK_NAMES, 'hooks');
    } catch (e) {
      if (e instanceof ShapeError) throw new PluginError('REGISTRY', e.path);
      throw e;
    }
    if (this.entries.has(manifest.id)) throw new PluginError('REGISTRY', 'id');
    for (const name of HOOK_NAMES) {
      if (name in hooksIn && typeof hooksIn[name] !== 'function')
        throw new PluginError('REGISTRY', `hooks.${name}`);
    }
    const caps = new Set<string>(manifest.capabilities);
    const kinds = new Set<PrivacyKind>(
      (['delay', 'relay', 'batching'] as const).filter((k) => caps.has(capabilityFor(k))),
    );
    // Declared <=> provided, both directions.
    if (caps.has('hook:onInvoiceCreate') !== 'onInvoiceCreate' in hooksIn) {
      throw new PluginError('REGISTRY', 'hooks.onInvoiceCreate');
    }
    if (kinds.size > 0 !== 'privacyOptions' in hooksIn)
      throw new PluginError('REGISTRY', 'hooks.privacyOptions');

    const g = grant;
    const grantedHosts = Array.isArray(g.network) ? new Set(g.network) : new Set<string>();
    const granted = Object.freeze({
      network: Object.freeze(manifest.permissions.network.filter((h) => grantedHosts.has(h))),
      storage: manifest.permissions.storage && g.storage === true,
      downgrade: manifest.permissions.downgrade && g.downgrade === true,
    });
    const hooks: PluginHooks = Object.freeze({ ...(hooksIn as PluginHooks) });
    this.entries.set(
      manifest.id,
      Object.freeze({ manifest, hooks, required: opts.required === true, granted, kinds }),
    );
    return Object.freeze({ manifest, required: opts.required === true, granted });
  }

  /** Prevents further registrations. */
  public seal(): void {
    this.sealed = true;
  }

  /** Registered plugins in execution order. */
  public list(): readonly RegisteredPlugin[] {
    return Object.freeze(
      this.ordered().map((e) =>
        Object.freeze({ manifest: e.manifest, required: e.required, granted: e.granted }),
      ),
    );
  }

  private ordered(): Entry[] {
    return [...this.entries.values()].sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1));
  }

  private async invoke(
    entry: Entry,
    hook: (typeof HOOK_NAMES)[number],
    invoice: InvoiceView,
  ): Promise<unknown> {
    const fn = entry.hooks[hook] as (ctx: PluginContext, inv: InvoiceView) => unknown;
    const handle = createContext(
      entry.manifest.id,
      entry.granted,
      { network: this.network, storage: this.storage },
      this.clock,
    );
    let timer: unknown;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = this.scheduler.setTimeout(() => resolve(TIMEOUT), this.timeoutMs);
    });
    try {
      // Called inside a microtask so a synchronous throw becomes a rejection.
      const run = Promise.resolve().then(() => fn(handle.context, invoice));
      return await Promise.race([run, timeout]);
    } finally {
      handle.revoke();
      this.scheduler.clearTimeout(timer);
    }
  }

  /**
   * Runs `onInvoiceCreate` then `privacyOptions` for every plugin, in id order,
   * and merges the results without ever weakening defaults.
   *
   * @param invoice Invoice facts (validated; frozen copy given to plugins).
   * @returns Evaluation for the UI.
   * @throws {PluginError} `CONFIG` for a bad invoice view; `REQUIRED_PLUGIN_FAILED`
   * if a required plugin failed.
   * @security Trust boundary for all plugin output.
   */
  public async evaluateInvoice(invoice: InvoiceView): Promise<PrivacyEvaluation> {
    const view = readInvoiceView(invoice);
    const order = this.ordered();
    const failures: { pluginId: string; hook: string; code: FailureCode }[] = [];
    const rejectedOptions: { pluginId: string; index: number; reason: string }[] = [];
    const restrictions: PrivacyRestrictions[] = [];
    const rawOptions: { entry: Entry; value: unknown; index: number }[] = [];

    for (const entry of order) {
      for (const hook of HOOK_NAMES) {
        if (entry.hooks[hook] === undefined) continue;
        let out: unknown;
        try {
          out = await this.invoke(entry, hook, view);
        } catch {
          failures.push({ pluginId: entry.manifest.id, hook, code: 'THREW' });
          continue;
        }
        if (out === TIMEOUT) {
          failures.push({ pluginId: entry.manifest.id, hook, code: 'TIMEOUT' });
          continue;
        }
        if (out === undefined) continue;
        try {
          const r = readShape(
            out,
            [],
            hook === 'privacyOptions' ? ['restrictions', 'options'] : ['restrictions'],
            'out',
          );
          const parsed =
            'restrictions' in r
              ? readRestrictions(r.restrictions, entry.kinds, 'out.restrictions')
              : undefined;
          const opts = 'options' in r ? readArray(r.options, MAX_OPTIONS_PER_PLUGIN, 'out.options') : [];
          if (parsed !== undefined) restrictions.push(parsed);
          opts.forEach((value, index) => rawOptions.push({ entry, value, index }));
        } catch {
          failures.push({ pluginId: entry.manifest.id, hook, code: 'BAD_OUTPUT' });
        }
      }
    }

    const requiredFailed = failures.some((f) => this.entries.get(f.pluginId)?.required === true);
    if (requiredFailed) throw new PluginError('REQUIRED_PLUGIN_FAILED');

    // Restrictions merge with max/OR: commutative, so plugin order cannot change the result.
    const effective = restrictions.reduce((acc, r) => tighten(acc, r), this.defaults);

    const options: AcceptedOption[] = [];
    const seen = new Set<string>();
    for (const { entry, value, index } of rawOptions) {
      const pluginId = entry.manifest.id;
      const result = this.checkOption(entry, value, effective);
      if (typeof result === 'string') {
        rejectedOptions.push({ pluginId, index, reason: result });
        continue;
      }
      const key = `${pluginId}/${result.id}`;
      if (seen.has(key)) {
        rejectedOptions.push({ pluginId, index, reason: 'DUPLICATE_ID' });
        continue;
      }
      seen.add(key);
      options.push(Object.freeze({ key, pluginId, ...result }));
    }
    options.sort((a, b) => (a.key < b.key ? -1 : 1));
    return Object.freeze({
      defaults: this.defaults,
      effective,
      options: Object.freeze(options),
      downgrades: Object.freeze(options.filter((o) => o.downgrade)),
      failures: Object.freeze(failures.map((f) => Object.freeze(f))),
      rejectedOptions: Object.freeze(rejectedOptions.map((r) => Object.freeze(r))),
    });
  }

  private checkOption(
    entry: Entry,
    value: unknown,
    effective: PrivacySettings,
  ): Omit<AcceptedOption, 'key' | 'pluginId'> | string {
    let r: Record<string, unknown>;
    let id: string;
    let label: string;
    let v: number | boolean;
    let kind: PrivacyKind;
    try {
      r = readShape(value, ['id', 'kind', 'label', 'value'], ['downgrade', 'downgradeReason'], 'option');
      id = readString(r.id, OPTION_ID_RE, 'id');
      label = readString(r.label, LABEL_RE, 'label');
      if (r.kind !== 'delay' && r.kind !== 'relay' && r.kind !== 'batching') return 'BAD_KIND';
      kind = r.kind;
      v =
        kind === 'relay'
          ? readBool(r.value, 'value')
          : kind === 'delay'
            ? readInt(r.value, 0, MAX_DELAY_SECONDS, 'value')
            : readInt(r.value, 1, MAX_BATCH_SIZE, 'value');
      if ('downgrade' in r) readBool(r.downgrade, 'downgrade');
    } catch {
      return 'MALFORMED';
    }
    if (!entry.kinds.has(kind)) return 'UNDECLARED_KIND';
    const weaker = isWeaker(kind, v, effective);
    const flagged = r.downgrade === true;
    if (weaker && !flagged) return 'SILENT_DOWNGRADE';
    if (!weaker && flagged) return 'FALSE_DOWNGRADE_FLAG';
    if (!weaker && 'downgradeReason' in r) return 'MALFORMED';
    let reason: string | undefined;
    if (weaker) {
      if (!entry.granted.downgrade) return 'DOWNGRADE_NOT_PERMITTED';
      if (typeof r.downgradeReason !== 'string' || !REASON_RE.test(r.downgradeReason))
        return 'MISSING_DOWNGRADE_REASON';
      reason = r.downgradeReason;
    }
    return { id, kind, label, value: v, downgrade: weaker, downgradeReason: reason };
  }
}

/**
 * Applies the user's selection to an evaluation.
 *
 * @remarks Starts from `effective`. Non-downgrade options can only make a field
 * more private. A downgrade option is applied only if its key is in
 * `acknowledgedDowngrades`; otherwise this throws. At most one option per kind.
 *
 * @param evaluation From {@link PluginRegistry.evaluateInvoice}.
 * @param selection User choice.
 * @returns Final settings and the downgrades applied.
 * @throws {PluginError} `SELECTION` for unknown keys, two options of one kind, or
 * an unacknowledged downgrade.
 * @security Trust boundary: the only path by which settings can drop below defaults.
 */
export function applyPrivacySelection(
  evaluation: PrivacyEvaluation,
  selection: PrivacySelection,
): AppliedPrivacy {
  const byKey = new Map(evaluation.options.map((o) => [o.key, o]));
  const acks = new Set(selection.acknowledgedDowngrades);
  const kindsUsed = new Set<PrivacyKind>();
  const settings: { delaySeconds: number; relay: boolean; batchSize: number } = { ...evaluation.effective };
  const appliedDowngrades: string[] = [];
  for (const key of [...new Set(selection.optionKeys)].sort()) {
    const o = byKey.get(key);
    if (o === undefined) throw new PluginError('SELECTION', 'optionKeys');
    if (kindsUsed.has(o.kind)) throw new PluginError('SELECTION', 'kind');
    kindsUsed.add(o.kind);
    if (o.downgrade) {
      if (!acks.has(o.key)) throw new PluginError('SELECTION', 'acknowledgedDowngrades');
      appliedDowngrades.push(o.key);
    }
    // Defence in depth: a non-downgrade option is re-checked against effective here.
    if (!o.downgrade && isWeaker(o.kind, o.value, evaluation.effective))
      throw new PluginError('SELECTION', 'kind');
    (settings as Record<string, number | boolean>)[KIND_FIELD[o.kind]] = o.value;
  }
  return Object.freeze({
    settings: Object.freeze(settings),
    appliedDowngrades: Object.freeze(appliedDowngrades),
  });
}
