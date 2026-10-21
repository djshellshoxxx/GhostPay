import { fail, intIn, isRecord, ok, onlyKeys, type Result } from './common.js';
import { containsAddress, containsSensitive, maskAddress, sanitizeLabel } from './redact.js';

/** Notification kinds. Each has a fixed template; callers never supply prose. */
export const NOTIFICATION_KINDS = [
  'payment_received',
  'payment_sent',
  'payment_failed',
  'reminder_due',
  'sync_issue',
  'security_alert',
  'update_available',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];
const RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, critical: 3 };

/** Structured, validated parameters. Free text is limited to a sanitised label. */
export interface NotificationParams {
  /** Decimal string, e.g. "12.50". */
  amount?: string;
  /** Ticker, e.g. "USDC". */
  asset?: string;
  /** Address; only ever rendered masked, and never in discreet mode. */
  address?: string;
  /** Counterparty label; never rendered in discreet mode. */
  label?: string;
}

export interface NotificationInput {
  kind: NotificationKind;
  /** Events with the same key are ignored while the original is unexpired. */
  dedupeKey: string;
  /** Unread events sharing this key within the window merge into one entry. */
  coalesceKey?: string;
  priority?: Priority;
  params?: NotificationParams;
  /** Lifetime in ms; defaults to config.defaultTtlMs. */
  ttlMs?: number;
}

export interface QuietHours {
  /** Minutes after local midnight, 0..1439. */
  startMinute: number;
  endMinute: number;
  /** Local offset from UTC in minutes (-840..840). Injected; no Intl/tz lookups. */
  utcOffsetMinutes: number;
}

export interface QueueConfig {
  /** Injected clock (ms since epoch). */
  now: () => number;
  discreet?: boolean;
  quietHours?: QuietHours | null;
  maxSize?: number;
  coalesceWindowMs?: number;
  defaultTtlMs?: number;
  /** Generic label for lock-screen title. Must not name the product. */
  lockScreenLabel?: string;
}

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  dedupeKeys: string[];
  coalesceKey?: string;
  priority: Priority;
  params: NotificationParams;
  count: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  read: boolean;
  alerted: boolean;
}

export type Surface = 'inapp' | 'lockscreen';

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  priority: Priority;
  count: number;
  read: boolean;
  createdAt: number;
  updatedAt: number;
  title: string;
  body: string;
  titleKey: string;
  bodyKey: string;
  /** i18n arguments. Empty whenever the surface is discreet/lock-screen. */
  args: Record<string, string>;
  surface: Surface;
  redacted: boolean;
}

export type PushOutcome =
  | { outcome: 'added' | 'deduped' | 'coalesced'; id: string }
  | { outcome: 'rejected'; reason: string };

export interface QueueSnapshot {
  v: 1;
  seq: number;
  records: NotificationRecord[];
}

const DEDUPE_KEY_RE = /^[\w:.-]{1,128}$/;
const MAX_DEDUPE_KEYS = 20;
const AMOUNT_RE = /^\d{1,30}(\.\d{1,18})?$/;
const ASSET_RE = /^[A-Z0-9]{2,10}$/;
const ADDR_RE = /^[A-Za-z0-9]{12,128}$/;
const DAY = 86_400_000;

/** Validate user-facing parameters strictly (they may derive from untrusted links). */
export function validateParams(p: unknown): Result<NotificationParams> {
  if (p === undefined) return ok({});
  if (!isRecord(p) || !onlyKeys(p, ['amount', 'asset', 'address', 'label'])) return fail('params_shape');
  const out: NotificationParams = {};
  if (p['amount'] !== undefined) {
    if (typeof p['amount'] !== 'string' || !AMOUNT_RE.test(p['amount'])) return fail('params_amount');
    out.amount = p['amount'];
  }
  if (p['asset'] !== undefined) {
    if (typeof p['asset'] !== 'string' || !ASSET_RE.test(p['asset'])) return fail('params_asset');
    out.asset = p['asset'];
  }
  if (p['address'] !== undefined) {
    if (typeof p['address'] !== 'string' || !ADDR_RE.test(p['address'])) return fail('params_address');
    out.address = p['address'];
  }
  if (p['label'] !== undefined) {
    if (typeof p['label'] !== 'string' || p['label'].length > 200) return fail('params_label');
    const l = sanitizeLabel(p['label']);
    // @security a label that is itself an address is dropped, never displayed.
    if (l !== '' && !containsAddress(l)) out.label = l;
  }
  return ok(out);
}

interface Template {
  titleKey: string;
  bodyKey: string;
  title: string;
  /** Static, digit-free, address-free body for discreet mode. */
  discreetBody: string;
  multiTitle: string;
}

const TEMPLATES: Record<NotificationKind, Template> = {
  payment_received: { titleKey: 'notify.paymentReceived.title', bodyKey: 'notify.paymentReceived.body', title: 'Payment received', discreetBody: 'A payment arrived. Open the app to view it.', multiTitle: 'Payments received' },
  payment_sent: { titleKey: 'notify.paymentSent.title', bodyKey: 'notify.paymentSent.body', title: 'Payment sent', discreetBody: 'A payment was sent.', multiTitle: 'Payments sent' },
  payment_failed: { titleKey: 'notify.paymentFailed.title', bodyKey: 'notify.paymentFailed.body', title: 'Payment failed', discreetBody: 'A payment needs your attention.', multiTitle: 'Payments failed' },
  reminder_due: { titleKey: 'notify.reminderDue.title', bodyKey: 'notify.reminderDue.body', title: 'Reminder due', discreetBody: 'You have a reminder due.', multiTitle: 'Reminders due' },
  sync_issue: { titleKey: 'notify.syncIssue.title', bodyKey: 'notify.syncIssue.body', title: 'Sync problem', discreetBody: 'Some data could not be refreshed.', multiTitle: 'Sync problems' },
  security_alert: { titleKey: 'notify.securityAlert.title', bodyKey: 'notify.securityAlert.body', title: 'Security alert', discreetBody: 'Open the app to review a security notice.', multiTitle: 'Security alerts' },
  update_available: { titleKey: 'notify.updateAvailable.title', bodyKey: 'notify.updateAvailable.body', title: 'Update available', discreetBody: 'A new version is ready.', multiTitle: 'Updates available' },
};

const LOCK_BODY = 'Open the app to see more.';
const GENERIC_TITLE = 'Notification';

/**
 * Render a record for a surface.
 *
 * @security `lockscreen` and discreet `inapp` output come from static
 * templates only: no amounts, addresses, labels or counts. Non-discreet in-app
 * output masks addresses (first6…last4) and never prints a full address. A
 * final {@link containsSensitive} guard falls back to the generic text.
 */
export function renderRecord(r: NotificationRecord, surface: Surface, discreet: boolean, lockLabel: string): NotificationView {
  const t = TEMPLATES[r.kind];
  const base = {
    id: r.id, kind: r.kind, priority: r.priority, count: r.count, read: r.read,
    createdAt: r.createdAt, updatedAt: r.updatedAt, surface,
  };
  if (surface === 'lockscreen') {
    return { ...base, title: lockLabel, body: LOCK_BODY, titleKey: 'notify.lockscreen.title', bodyKey: 'notify.lockscreen.body', args: {}, redacted: true };
  }
  if (discreet) {
    const title = r.count > 1 ? t.multiTitle : t.title;
    const body = t.discreetBody;
    if (containsSensitive(title) || containsSensitive(body)) {
      /* c8 ignore next 2 -- templates are static; guard is defence in depth */
      return { ...base, title: GENERIC_TITLE, body: LOCK_BODY, titleKey: 'notify.lockscreen.title', bodyKey: 'notify.lockscreen.body', args: {}, redacted: true };
    }
    return { ...base, title, body, titleKey: t.titleKey, bodyKey: t.bodyKey + 'Discreet', args: {}, redacted: true };
  }
  const args: Record<string, string> = {};
  if (r.count > 1) {
    args['count'] = String(r.count);
    return { ...base, title: `${r.count} ${t.multiTitle.toLowerCase()}`, body: 'Open the app for details.', titleKey: t.titleKey + 'Multi', bodyKey: 'notify.multi.body', args, redacted: false };
  }
  const parts: string[] = [];
  if (r.params.amount !== undefined) {
    const a = r.params.asset !== undefined ? `${r.params.amount} ${r.params.asset}` : r.params.amount;
    args['amount'] = a;
    parts.push(a);
  }
  if (r.params.label !== undefined) {
    args['label'] = r.params.label;
    parts.push(r.params.label);
  }
  if (r.params.address !== undefined) {
    args['address'] = maskAddress(r.params.address);
    parts.push(args['address']);
  }
  const body = parts.length > 0 ? parts.join(' · ') : 'Open the app for details.';
  return { ...base, title: t.title, body, titleKey: t.titleKey, bodyKey: t.bodyKey, args, redacted: false };
}

/**
 * In-app notification queue. Pure state machine; time comes only from the
 * injected clock.
 */
export class NotificationQueue {
  private records: NotificationRecord[] = [];
  private seq = 0;
  private discreetMode: boolean;
  private quiet: QuietHours | null;
  private readonly now: () => number;
  private readonly maxSize: number;
  private readonly windowMs: number;
  private readonly ttl: number;
  private readonly lockLabel: string;

  constructor(cfg: QueueConfig) {
    this.now = cfg.now;
    this.discreetMode = cfg.discreet ?? true; // privacy-by-default
    this.quiet = null;
    if (cfg.quietHours) this.setQuietHours(cfg.quietHours);
    this.maxSize = cfg.maxSize !== undefined && intIn(cfg.maxSize, 1, 1000) ? cfg.maxSize : 50;
    this.windowMs = cfg.coalesceWindowMs !== undefined && intIn(cfg.coalesceWindowMs, 0, DAY) ? cfg.coalesceWindowMs : 60_000;
    this.ttl = cfg.defaultTtlMs !== undefined && intIn(cfg.defaultTtlMs, 1, 365 * DAY) ? cfg.defaultTtlMs : 7 * DAY;
    const l = cfg.lockScreenLabel !== undefined ? sanitizeLabel(cfg.lockScreenLabel, 24) : '';
    this.lockLabel = l !== '' && !containsSensitive(l) ? l : GENERIC_TITLE;
  }

  get discreet(): boolean {
    return this.discreetMode;
  }
  setDiscreet(on: boolean): void {
    this.discreetMode = on;
  }

  /** Set quiet hours; returns false (unchanged) on invalid input. null clears. */
  setQuietHours(q: QuietHours | null): boolean {
    if (q === null) {
      this.quiet = null;
      return true;
    }
    if (!intIn(q.startMinute, 0, 1439) || !intIn(q.endMinute, 0, 1439) || !intIn(q.utcOffsetMinutes, -840, 840)) return false;
    this.quiet = { ...q };
    return true;
  }

  /** True when the injected clock is inside quiet hours (start==end means none). */
  isQuietNow(): boolean {
    const q = this.quiet;
    if (q === null || q.startMinute === q.endMinute) return false;
    const m = (((Math.floor(this.now() / 60_000) + q.utcOffsetMinutes) % 1440) + 1440) % 1440;
    return q.startMinute < q.endMinute ? m >= q.startMinute && m < q.endMinute : m >= q.startMinute || m < q.endMinute;
  }

  private live(): NotificationRecord[] {
    const t = this.now();
    return this.records.filter((r) => r.expiresAt > t);
  }

  /** Drop expired entries. Returns how many were removed. */
  purgeExpired(): number {
    const before = this.records.length;
    this.records = this.live();
    return before - this.records.length;
  }

  push(input: NotificationInput): PushOutcome {
    this.purgeExpired();
    if (!isRecord(input) || !NOTIFICATION_KINDS.includes(input.kind)) return { outcome: 'rejected', reason: 'kind' };
    if (typeof input.dedupeKey !== 'string' || !DEDUPE_KEY_RE.test(input.dedupeKey)) return { outcome: 'rejected', reason: 'dedupe_key' };
    if (input.coalesceKey !== undefined && (typeof input.coalesceKey !== 'string' || !DEDUPE_KEY_RE.test(input.coalesceKey))) return { outcome: 'rejected', reason: 'coalesce_key' };
    const priority = input.priority ?? 'normal';
    if (!PRIORITIES.includes(priority)) return { outcome: 'rejected', reason: 'priority' };
    const params = validateParams(input.params);
    if (!params.ok) return { outcome: 'rejected', reason: params.error };
    const ttl = input.ttlMs ?? this.ttl;
    if (!intIn(ttl, 1, 365 * DAY)) return { outcome: 'rejected', reason: 'ttl' };

    const t = this.now();
    const dup = this.records.find((r) => r.dedupeKeys.includes(input.dedupeKey));
    if (dup) {
      if (RANK[priority] > RANK[dup.priority]) {
        dup.priority = priority;
        dup.alerted = false;
      }
      return { outcome: 'deduped', id: dup.id };
    }

    if (input.coalesceKey !== undefined) {
      const target = this.records.find(
        (r) => !r.read && r.kind === input.kind && r.coalesceKey === input.coalesceKey && t - r.updatedAt <= this.windowMs,
      );
      if (target) {
        target.count += 1;
        target.updatedAt = t;
        target.expiresAt = Math.max(target.expiresAt, t + ttl);
        target.params = params.value;
        target.dedupeKeys = [...target.dedupeKeys, input.dedupeKey].slice(-MAX_DEDUPE_KEYS);
        if (RANK[priority] > RANK[target.priority]) {
          target.priority = priority;
          target.alerted = false;
        }
        return { outcome: 'coalesced', id: target.id };
      }
    }

    if (this.records.length >= this.maxSize && !this.evictFor(priority)) return { outcome: 'rejected', reason: 'queue_full' };
    this.seq += 1;
    const rec: NotificationRecord = {
      id: `n${this.seq}`, kind: input.kind, dedupeKeys: [input.dedupeKey], priority, params: params.value,
      count: 1, createdAt: t, updatedAt: t, expiresAt: t + ttl, read: false, alerted: false,
    };
    if (input.coalesceKey !== undefined) rec.coalesceKey = input.coalesceKey;
    this.records.push(rec);
    return { outcome: 'added', id: rec.id };
  }

  /** Evict one entry to make room. Unread critical entries are protected from lower-priority arrivals. */
  private evictFor(incoming: Priority): boolean {
    const score = (r: NotificationRecord): number => (r.read ? 0 : 100) + RANK[r.priority] * 10;
    const sorted = [...this.records].sort((a, b) => score(a) - score(b) || a.updatedAt - b.updatedAt);
    const victim = sorted[0];
    /* c8 ignore next -- maxSize >= 1 so records is non-empty here */
    if (!victim) return false;
    if (!victim.read && victim.priority === 'critical' && incoming !== 'critical') return false;
    this.records = this.records.filter((r) => r !== victim);
    return true;
  }

  private sorted(): NotificationRecord[] {
    return this.live().sort((a, b) => RANK[b.priority] - RANK[a.priority] || b.updatedAt - a.updatedAt);
  }

  /** Views ordered by priority then recency, expired entries excluded. */
  list(surface: Surface = 'inapp'): NotificationView[] {
    return this.sorted().map((r) => renderRecord(r, surface, this.discreetMode, this.lockLabel));
  }

  get(id: string, surface: Surface = 'inapp'): NotificationView | undefined {
    const r = this.live().find((x) => x.id === id);
    return r ? renderRecord(r, surface, this.discreetMode, this.lockLabel) : undefined;
  }

  unreadCount(): number {
    return this.live().filter((r) => !r.read).length;
  }

  markRead(id: string): boolean {
    const r = this.live().find((x) => x.id === id);
    if (!r) return false;
    r.read = true;
    return true;
  }

  markAllRead(): number {
    let n = 0;
    for (const r of this.live()) {
      if (!r.read) {
        r.read = true;
        n += 1;
      }
    }
    return n;
  }

  dismiss(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    return this.records.length < before;
  }

  clear(): void {
    this.records = [];
  }

  /**
   * Entries that should interrupt the user now (toast / OS notification).
   * Low priority never interrupts. Quiet hours suppress everything except
   * critical; suppressed entries stay pending and are returned after quiet
   * hours end. Returned entries are marked alerted. Use surface `lockscreen`
   * for OS-level delivery.
   */
  takeAlerts(surface: Surface = 'lockscreen'): NotificationView[] {
    const quiet = this.isQuietNow();
    const out: NotificationView[] = [];
    for (const r of this.sorted()) {
      if (r.read || r.alerted || r.priority === 'low') continue;
      if (quiet && r.priority !== 'critical') continue;
      r.alerted = true;
      out.push(renderRecord(r, surface, this.discreetMode, this.lockLabel));
    }
    return out;
  }

  /** Serialisable state (params only, no rendered text). */
  snapshot(): QueueSnapshot {
    return { v: 1, seq: this.seq, records: this.records.map((r) => ({ ...r, dedupeKeys: [...r.dedupeKeys], params: { ...r.params } })) };
  }

  /** Restore from untrusted storage. Strictly validated; unchanged on failure. */
  restore(data: unknown): Result<number> {
    const parsed = parseSnapshot(data);
    if (!parsed.ok) return parsed;
    this.records = parsed.value.records.slice(-this.maxSize);
    this.seq = parsed.value.seq;
    this.purgeExpired();
    return ok(this.records.length);
  }
}

/** Validate a stored snapshot. */
export function parseSnapshot(data: unknown): Result<QueueSnapshot> {
  if (!isRecord(data) || !onlyKeys(data, ['v', 'seq', 'records']) || data['v'] !== 1) return fail('snapshot_shape');
  const seq = data['seq'];
  const recs = data['records'];
  if (!intIn(seq, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(recs) || recs.length > 1000) return fail('snapshot_shape');
  const out: NotificationRecord[] = [];
  const ids = new Set<string>();
  for (const raw of recs as unknown[]) {
    if (!isRecord(raw) || !onlyKeys(raw, ['id', 'kind', 'dedupeKeys', 'coalesceKey', 'priority', 'params', 'count', 'createdAt', 'updatedAt', 'expiresAt', 'read', 'alerted'])) return fail('record_shape');
    const { id, kind, dedupeKeys, coalesceKey, priority, count, createdAt, updatedAt, expiresAt, read, alerted } = raw;
    if (typeof id !== 'string' || !/^n\d{1,15}$/.test(id) || ids.has(id)) return fail('record_id');
    ids.add(id);
    if (typeof kind !== 'string' || !(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return fail('record_kind');
    if (typeof priority !== 'string' || !(PRIORITIES as readonly string[]).includes(priority)) return fail('record_priority');
    if (!Array.isArray(dedupeKeys) || dedupeKeys.length < 1 || dedupeKeys.length > MAX_DEDUPE_KEYS || !dedupeKeys.every((k) => typeof k === 'string' && DEDUPE_KEY_RE.test(k))) return fail('record_keys');
    if (coalesceKey !== undefined && (typeof coalesceKey !== 'string' || !DEDUPE_KEY_RE.test(coalesceKey))) return fail('record_keys');
    if (!intIn(count, 1, 1_000_000) || !intIn(createdAt, 0, 8.64e15) || !intIn(updatedAt, 0, 8.64e15) || !intIn(expiresAt, 0, 8.64e15)) return fail('record_numbers');
    if (typeof read !== 'boolean' || typeof alerted !== 'boolean') return fail('record_flags');
    const params = validateParams(raw['params']);
    if (!params.ok) return params;
    const rec: NotificationRecord = {
      id, kind: kind as NotificationKind, dedupeKeys: dedupeKeys as string[], priority: priority as Priority,
      params: params.value, count, createdAt, updatedAt, expiresAt, read, alerted,
    };
    if (coalesceKey !== undefined) rec.coalesceKey = coalesceKey;
    out.push(rec);
  }
  return ok({ v: 1, seq, records: out });
}
