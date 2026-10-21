export { GuardError, BreakerOpenError, monotonicNow } from './errors.js';
export type { GuardErrorCode, Clock } from './errors.js';
export { GuardedBreaker, classifyRelayOutcome } from './breaker.js';
export type {
  BreakerState,
  BreakerHealth,
  Outcome,
  GuardedBreakerOptions,
  Permit,
  RunResult,
  RelayResultClass,
} from './breaker.js';
export { parseIp, parseCidr, cidrContains, bucketKey } from './ip.js';
export type { ParsedIp, Cidr, BucketPrefixes } from './ip.js';
export { TrustedProxies, resolveClientIp } from './client.js';
export type { ClientSource, ResolvedClient, ResolveInput } from './client.js';
export { TokenBucketLimiter, LossBudget, OVERFLOW_KEY } from './limiter.js';
export type { TokenBucketOptions, TakeResult, LossBudgetOptions } from './limiter.js';
