import { getAddress, isAddress } from 'viem/utils';

/** Observations are local payment submissions with a transaction hash, not evidence that an address received a payment. */
export interface AddressReuseScope {
  readonly chainId: number;
  readonly account: string;
}

export interface AddressReuseCandidate {
  readonly destination: string;
  /** Canonical invoice digest, without a prefix. No invoice text or signing material is retained. */
  readonly paymentId: string;
  readonly intent?: 'fresh' | 'repeat';
}

export type AddressReuseStatus = 'unavailable' | 'not-observed' | 'same-payment' | 'deliberate-repeat' | 'reused' | 'limited-history';

const MAX_OBSERVATIONS = 256;

function normalizedAddress(value: unknown): string | undefined {
  if (typeof value !== 'string' || !isAddress(value, { strict: true })) return undefined;
  return getAddress(value).toLowerCase();
}

function scopeKey(scope: AddressReuseScope): string | undefined {
  try {
    if (typeof scope !== 'object' || scope === null) return undefined;
    const chainId = scope.chainId;
    const account = normalizedAddress(scope.account);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) return undefined;
    return account === undefined ? undefined : `${String(chainId)}:${account}`;
  } catch { return undefined; }
}

function candidateSnapshot(candidate: AddressReuseCandidate): { address: string; paymentId: string; repeat: boolean } | undefined {
  try {
    if (typeof candidate !== 'object' || candidate === null) return undefined;
    const paymentId = candidate.paymentId;
    const intent = candidate.intent;
    const address = normalizedAddress(candidate.destination);
    if (typeof paymentId !== 'string' || !/^[0-9a-f]{64}$/.test(paymentId) || address === undefined) return undefined;
    if (intent !== undefined && intent !== 'fresh' && intent !== 'repeat') return undefined;
    return { address, paymentId, repeat: intent === 'repeat' };
  } catch { return undefined; }
}

/**
 * Bounded, in-memory policy only. The caller explicitly binds a connected account and clears on lifecycle
 * revocation. Inspecting a candidate never records it. Saturation preserves older observations and makes
 * incomplete history explicit rather than silently evicting evidence. Nothing is sent or persisted.
 */
export class LocalAddressReuseLedger {
  private scope: string | undefined;
  private readonly destinations = new Map<string, Set<string>>();
  private observations = 0;
  private saturated = false;

  public constructor(private readonly capacity = MAX_OBSERVATIONS) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MAX_OBSERVATIONS) {
      throw new Error('Invalid local address observation limit.');
    }
  }

  /** Reconnecting the same account/chain preserves this session's observations; changing scope clears them. */
  public bind(scope: AddressReuseScope): boolean {
    const next = scopeKey(scope);
    if (next === undefined || next !== this.scope) this.clear();
    this.scope = next;
    return next !== undefined;
  }

  public inspect(scope: AddressReuseScope, candidate: AddressReuseCandidate): AddressReuseStatus {
    const next = scopeKey(scope);
    const snapshot = candidateSnapshot(candidate);
    if (next === undefined || snapshot === undefined || this.scope !== next) return 'unavailable';
    const previous = this.destinations.get(snapshot.address);
    if (previous !== undefined && (previous.size > 1 || !previous.has(snapshot.paymentId))) return snapshot.repeat ? 'deliberate-repeat' : 'reused';
    if (previous !== undefined) return 'same-payment';
    return this.saturated ? 'limited-history' : 'not-observed';
  }

  /** Call only once a payment transaction hash exists; render, preparation and approval are not observations. */
  public observeSubmission(scope: AddressReuseScope, candidate: AddressReuseCandidate): boolean {
    const next = scopeKey(scope);
    const snapshot = candidateSnapshot(candidate);
    if (next === undefined || snapshot === undefined || this.scope !== next) return false;
    const payments = this.destinations.get(snapshot.address) ?? new Set<string>();
    if (payments.has(snapshot.paymentId)) return true;
    if (this.observations >= this.capacity) { this.saturated = true; return false; }
    payments.add(snapshot.paymentId);
    this.destinations.set(snapshot.address, payments);
    this.observations += 1;
    return true;
  }

  public clear(): void {
    this.scope = undefined;
    this.destinations.clear();
    this.observations = 0;
    this.saturated = false;
  }
}
