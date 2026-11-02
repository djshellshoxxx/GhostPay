export { GuardError, BreakerOpenError, monotonicNow } from './errors.js';
export type { GuardErrorCode, Clock } from './errors.js';
export { GuardedBreaker, classifyRelayOutcome } from './breaker.js';
export type {
  BreakerState,
  BreakerHealth,
  Outcome,
  GuardedBreakerOptions,
  AcquireOptions,
  Permit,
  RunResult,
  RelayResultClass,
} from './breaker.js';
export { parseIp, parseCidr, cidrContains, bucketKey, groupKey, groupOfBucketKey } from './ip.js';
export type { ParsedIp, Cidr, BucketPrefixes } from './ip.js';
export { TrustedProxies, resolveClientIp } from './client.js';
export type { ClientSource, ResolvedClient, ResolveInput } from './client.js';
export { TokenBucketLimiter, LossBudget, OVERFLOW_KEY } from './limiter.js';
export type {
  TokenBucketOptions,
  TakeResult,
  LossBudgetOptions,
  LossReservation,
  LossSource,
} from './limiter.js';
export {
  createChallengeService,
  ChallengeService,
  MemoryReplayStore,
  MemoryAttemptLimiter,
  ReplayStoreFullError,
} from './challenge.js';
export type {
  ReplayStore,
  AttemptLimiter,
  MemoryStoreOptions,
  ChallengeFailure,
  VerifyResult,
  IssuedChallenge,
  ChallengeOptions,
  VerifyInput,
} from './challenge.js';
export { normalizeAnswer, generateQuestion } from './challenge-bank.js';
export type { ChallengeDifficulty, ChallengeRng, GeneratedQuestion } from './challenge-bank.js';
