# Spec: Delayed multi-hop forwarding (`@ghostpay/hops`), a WEAK optional mode

Status: **spec, not built**. Date: 2026-10-21. Branch `claude/remote-extensions-1`. Scope: **testnet-only proof of concept** (local anvil `31337`, Ethereum Sepolia `11155111`, Base Sepolia `84532`). Nothing here has run against a real wallet, RPC, relayer or chain.

Evidence tags: **[R]** repo file read this run; **[P]** primary source fetched; **[S]** secondary (via a repo document); **[U]** unverified (memory or inference). Retrieval date for every source: 2026-10-21. Web access from the sandbox failed (`getaddrinfo ENOTFOUND` for usenix.org and arxiv.org), so **no external source was fetched for this spec**; external claims are carried from `docs/remote/anonymization-research.md` and keep its tags.

Read for this spec: `README.md`, `docs/CONTRACTS_SPEC.md` (section 2), `docs/FEE_SCHEDULE.md` (F-SPONSOR), `docs/remote/anonymization-research.md` (4.1, 4.3, 6.0, 6.1, 10), `docs/remote/onion-i2p-research.md`, `docs/remote/modules-needed.md`, `docs/remote/security-specs/privacy-ops.md`, sibling specs `privacy-specs/{hygiene,payer-hiding,shielded-pool,external-pools}.md`, `packages/core-crypto/src/stealth.ts`, `packages/chain-adapters/src/sweep.ts`, `apps/web/src/lib/jitter.ts`, `packages/relayer-guard/src/index.ts`.

**Legal (deferred by owner, noted once, does not block):** `anonymization-research.md` 4.1 rates chained hops "Low-Med" legal risk because hops that are marketed as obfuscation resemble layering [R]. This spec therefore forbids privacy/anonymity marketing for the mode (HOP-UX-3).

## 1. Goal

Offer one user-selectable **delayed forwarding** mode (`hopMode`) in which a seller's received funds move `S1 -> S2 -> ... -> S(k+1) -> D` through `k` sweeps, each to a fresh self-derived stealth address, each after an independent random delay. It exists because the owner asked for every valid method as an option; the research verdict is that it **does not provide unlinkability** (`anonymization-research.md` section 1 point 1, 4.1, 6.0 [R]). The spec's job is to build it honestly: precise claims, loud labels, real cost display, a test that demonstrates the weakness, and clean composition with pool exit.

| Option id | Name (UI) | One line |
|---|---|---|
| `HOP-0` | `off` | Default. Single sweep to a hygiene fresh destination (hygiene spec HY-DST). |
| `HOP-N` | `delayed-forwarding` | `1..4` hops with random delays. Labelled **Weak**. Cost shown per hop. |

Sub-options: `hops` (1..4, default 2 when enabled), `delay {minMs,maxMs}` (default 10 min .. 12 h, user-bounded, max total 7 d), `relayerSelection: 'rotate' | 'same' | 'direct'`, `finalDestination: 'self-derived' | 'external'`, `handoff: 'none' | 'pool-exit'` (section 7).

## 2. Threat addressed and what it does NOT protect

Honest statement: after any number of hops, the payer, the public and any graph tool can follow the funds with one indexed lookup per hop.

**Does (small, bounded effects):**
- E1 **Address hygiene (not hop-specific)**: no stealth address or destination is reused (`S2..S(k+1)` are one-use). This is already delivered by one hygiene sweep.
- E2 **Delays the arrival of funds at the final destination `D`** by the sum of random delays. Someone watching only `D`'s inbound transfers right after an invoice event (payment to `S1`) sees an arrival later and from `S(k+1)`, not from `S1`. This defeats only a watcher who does not follow the chain backwards, which a payer or analyst does trivially.
- E3 **Raises per-observer effort linearly**: a human using a block explorer needs `k` extra lookups.
- E4 **Decouples `D` from `S1` in a naive `Transfer(S1 -> D)` search** (single-edge lookup).

**Does NOT (state verbatim in UI/docs):**
- N1 **Payer can follow every hop.** The payer knows `S1`; each hop is a public `Transfer(owner -> destination)` plus `Swept(token, owner, destination, amount, fee)` with all three of `token, owner, destination` indexed [R: CONTRACTS_SPEC section 2; hygiene 4.6]. Following is `k` log queries.
- N2 **Automated clustering links the chain.** Each hop is 1-in/1-out, same token, amount lower by a predictable fee, short time gap, fresh never-before-seen address: the textbook peel/forwarding-chain shape [U: heuristic names recalled; cited in research 10 as Kappos et al., "How to Peel a Million", USENIX Security 2022, retrieved via slide deck only, not re-fetched].
- N3 **Amounts are linkable.** `A_i = A_(i-1) - fee_i`; with fees visible and quoted, the final amount identifies the origin amount within a small candidate set (section 4.3).
- N4 **Delay without a crowd is not an anonymity set.** The GhostPay router crowd on a testnet chain is tiny; the roadmap itself says "Delaying one transaction is not a proper anonymity set" [R: research 4.3].
- N5 **The relayer sees every hop** (owner, destination, amount, fee, timing, IP unless proxied) [R: README, research 4.5]. Using one relayer for all hops gives it the full chain with certainty; rotation helps against that single party, not against the public chain.
- N6 **Network metadata unchanged** (RPC provider, relayer, host see IP/timing; `onion-i2p-research.md` [R]). Hops add `k` more requests from one client in a time window, which correlates them by IP/time at any party seeing several (mitigation: relayer rotation plus a proxy, section 4.5).
- N7 **Fingerprint worsens.** A chain of fresh self-derived addresses moved by the GhostPay sweep relayer's shared `feeTo` marks the seller as a GhostPay user who chose to forward; analysts may treat the pattern as layering (research 4.1 "looks like layering" [R]).
- N8 **Hops before a pool add nothing to the pool's anonymity** and hops after a pool exit are pure cost (section 7).
- N9 Mainnet is out of scope; no claim on any real-value chain.

## 3. User-visible option, labelling, cost

Location: Sweep view and Settings (edit list, section 6.3). The option is **off by default**; enabling shows a blocking dialog the user must acknowledge (checkbox `ackWeak`), then a cost preview.

Mandatory copy (constants in `labels.ts`; HOP-UX-1..4):
- Title: `Delayed forwarding (weak)`.
- Body (exact points, wording may vary but all five MUST appear): (1) "The payer and anyone using a block explorer can still follow your funds hop by hop." (2) "This adds delay and cost, not unlinkability." (3) "Automated analysis links these hops easily." (4) "The relayer you use sees each hop; using several relayers does not hide the on-chain path." (5) "For real unlinkability use a shared pool exit; hops do not add to it."
- Never use the words `anonymous`, `anonymise`, `untraceable`, `mix`, `mixing`, `launder`, `obfuscate`, `private` (as a claim about this mode). Test greps shipped strings (HOP-UX-3).

Cost preview (pure function `previewCost`, section 5): per hop `relayerFee_i` (quoted, token units), `gasless: yes`, total fee bps vs a single sweep, expected total delay range, and the **fixed** line "One plain sweep to a fresh address costs `fee_1` and gives the same unlinkability against the payer." Cost model: the router fee (25 bps, once, unchanged) applies before `S1`; each hop pays the F-SPONSOR relayer fee `max(gas*1.10, 50 bps)` capped at 300 bps [R: FEE_SCHEDULE F-SPONSOR]. So `k` hops cost at least `1 - (1-0.005)^k` of the amount: 0.50 % (k=1), 0.99 % (k=2), 1.49 % (k=3), 1.98 % (k=4), more when gas dominates. The plan is refused if modelled cumulative fee exceeds `maxTotalFeeBps` (default 500) or any hop amount `<= fee_i` (contract rule `amount > fee`).

Status panel: list of legs with state, due time, relayer id, tx hash; "Resume later" is explicit: legs need the app open (section 4.4).

## 4. Architecture

### 4.1 Flow

```
P --Router--> S1 --sweep(GR_a, t1)--> S2 --sweep(GR_b, t2)--> ... --sweep(GR_x, tk)--> D
                       (self-derived S_j, never announced, one use each; D per hygiene HY-DST or external)
```

Each leg is an ordinary `GhostPaySweepRelayer.sweepWithPermit` order [R: `chain-adapters/src/sweep.ts` `SweepOrder`, `buildSweepTypedData`, `buildPermitTypedData`, `signSweep`, `signPermit`], signed by the leg's source stealth key, `destination = next address`, `amount = full balance` (no residue; HOP-REQ-6), `deadline = dueAt + 900 s` computed **at signing time**, fresh unordered nonce. No contract change.

### 4.2 Hop address derivation

`S_(j+1)` is a scheme-1 stealth address of the seller's own meta-address with a locally derived ephemeral key, exactly as hygiene `deriveFreshDestination` [R: hygiene 4.1: HKDF stream into `deriveStealthPayment(ownMetaAddress, rng_i)`; key by `deriveStealthSecret`]. To avoid a hard dependency on a package that may not be built, `@ghostpay/hops` takes an injected interface:

```ts
export interface HopAddressSource {
  /** Allocates a never-used index and returns the address + a deferred key accessor. */
  next(): Promise<{ index: number; address: Address; withSecret<T>(fn: (s: SecretScalar) => Promise<T>): Promise<T> }>;
}
```

The app wires it to `@ghostpay/hygiene` (index allocation shared so hop and hygiene destinations never collide). Hop addresses are not announced (no gas, no on-chain object); recovery is by index scan (hygiene HY-VER-3, default N=200).

### 4.3 Amount fingerprint

`A_j = A_(j-1) - fee_j` exactly (full-balance sweeps). The planner exposes `fingerprintReport(plan)`: the list of `(A_0, A_k)` and the number of possible origin amounts consistent with the fee bounds `[0.5 %, 3 %]` per hop; shown in the preview as "your final amount reveals your original amount within ±x %". No amount blurring is done here (that is `amount-blurring.md`); combination is allowed only through that spec's own interfaces and is out of scope.

### 4.4 Scheduling and persistence (Feature 6 rule)

Delays follow the existing Feature 6 rule [R: `jitter.ts`]: **nothing is signed, queued or broadcast while waiting**; at `dueAt` the client builds the order, signs with the wallet/session key and submits, and the user is prompted (PoC: auto-sign within an unlocked session only if setting `autoContinue` is true, else a notification-style prompt). Consequence, documented as a limitation: if the app is closed at `dueAt`, the leg stays `due` until the next unlock; the delay is then longer than drawn (this changes the timing distribution and is shown).

Persisted `HopPlan` (encrypted keystore export, same store as hygiene ledger; contains addresses and indices, never keys). **Persist before sign**: write state `signing` with the nonce, then sign, then `submitted`. Crash recovery: for a leg in `signing|submitted` read `nonceUsed(owner, nonce)` on the sweep relayer (reveals the address to the RPC; flagged in UI, D8 [R]) and the destination token balance, then move to `confirmed` or `due`.

### 4.5 Relayer selection and implications

- `rotate` (default): each leg uses a relayer chosen uniformly from the configured list excluding the previous leg's relayer when the list has >= 2 entries; with 1 entry the UI warns that one relayer sees the whole chain (N5). `same`: explicit user override with the same warning. `direct`: leg sent by the source stealth key itself, requiring native gas at that address (only the first leg can use the payer's buffer, `payERC20WithBuffer`); each later leg would need native funding, creating a funding edge that is itself a link, so `direct` is limited to `hops = 1` in PoC (HOP-REQ-12).
- Relayer requirements are **unchanged**: stateless quotes, no batching of owners (HY-CON-5 [R]), no body logging, no destination or owner in logs or metrics [R: privacy-ops PO-COR-2, hygiene 4.5]. The relayer cannot learn leg `j+1` from leg `j` except from public chain data and shared IP.
- Rate limiting: `k` requests per plan, spaced by drawn delays, always a fresh quote per leg. A relayer using `@ghostpay/relayer-guard` per-client buckets [R] sees these as unrelated requests unless same IP; behind a proxy with `trustProxyHops=0` it must use owner+global buckets (PO-NET-5 [R]).
- The chain adds sweep-relayer loss exposure of zero: the relayer simulates each leg before sending (existing behaviour [R]).
- Token support: only tokens where the leg source can sign an ERC-2612 permit (or pre-granted allowance, impossible for a keyless fresh address). Tokens without permit (USDT) cannot hop gaslessly; `hopMode` is unavailable for them with reason `NO_PERMIT` [R: CONTRACTS_SPEC token matrix].

## 5. Packages, directories, interfaces

### 5.1 New package (the whole build)

```
packages/hops/                  name @ghostpay/hops, private, UNLICENSED, ESM, scripts as packages/relayer-guard [R]
  package.json tsconfig.json tsconfig.build.json vitest.config.ts README.md DEVIATIONS.md
  deps: @ghostpay/core-crypto, @ghostpay/chain-adapters, @ghostpay/secret-box (for SecretScalar handling), viem (same pin as siblings)
  src/index.ts
  src/types.ts          HopPlan, HopLeg, HopState, HopError codes
  src/plan.ts           planHops, previewCost, fingerprintReport, validatePlan
  src/rand.ts           csprng uniform delay (same algorithm as apps/web/src/lib/jitter.ts randomDelayMs; copied, see DEVIATIONS: app file may not be imported by a package)
  src/machine.ts        leg state machine (pure reducer) + persistence port
  src/execute.ts        runHopLeg(deps): builds sweep order via chain-adapters, signs, submits via RelayerClient
  src/labels.ts         mandatory UI strings, bannedWords
  src/relayerSelect.ts  rotate/same policy
  src/handoff.ts        pool-exit handoff (section 7)
  src/testutil/follower.ts   forward-tracing attacker used by tests (the "negative PoC")
  src/*.test.ts
  test/e2e.anvil.test.ts     real GhostPaySweepRelayer on anvil; skips when anvil or packages/contracts/out missing (same pattern as apps/relayer e2e [R])
```

No other directory is created. No file outside `packages/hops/**` and this spec is touched by the PoC package build.

### 5.2 Interfaces

```ts
export type HopState = 'planned' | 'waiting' | 'due' | 'signing' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';

export interface HopPlanInput {
  chainId: number; token: Address; source: Address;            // S1
  sourceBalance: bigint;
  hops: 1 | 2 | 3 | 4;
  delay: { minMs: number; maxMs: number; maxTotalMs: number };
  finalDestination: { kind: 'self-derived' } | { kind: 'external'; address: Address };
  relayers: { id: string; url: string }[];
  relayerSelection: 'rotate' | 'same' | 'direct';
  quotes: (leg: number) => Promise<{ fee: bigint; feeTo: Address; expiresAt: number }>; // fresh per leg, at plan time for preview only
  maxTotalFeeBps: number;                                      // default 500
  ackWeak: true;                                               // literal true required
  handoff: 'none' | 'pool-exit';
}
export interface HopLeg { index: number; from: Address; to: Address; dueAtMs: number; relayerId: string;
  expectedAmountIn: bigint; expectedFee: bigint; state: HopState; nonce?: bigint; txHash?: Hex; }
export interface HopPlan { id: string; chainId: number; token: Address; legs: HopLeg[]; createdAtMs: number;
  weak: true; ackWeakAtMs: number; handoff: 'none' | 'pool-exit'; }

export function planHops(input: HopPlanInput, deps: { addrs: HopAddressSource; rng: CryptoLike; nowMs: () => number }): Promise<HopPlan>;
export function previewCost(plan: HopPlan): { perLeg: { feeBps: number; fee: bigint }[]; totalFeeBps: number; singleSweepFeeBps: number; delayRangeMs: [number, number]; text: string[] };
export function reduce(plan: HopPlan, ev: HopEvent): HopPlan;                        // pure, total, rejects illegal transitions
export function runHopLeg(plan: HopPlan, legIndex: number, deps: HopDeps): Promise<HopPlan>;
export interface HopDeps { addrs: HopAddressSource; relayer: RelayerClient; chain: ChainReader; store: PlanStore;
  wallClockMs: () => number; signWithSession: SignPort; }   // no network inside plan.ts/machine.ts
export class HopError extends Error { code: 'MAINNET_FORBIDDEN'|'NO_PERMIT'|'NOT_ACKED'|'FEE_CAP'|'AMOUNT_TOO_SMALL'|'ILLEGAL_TRANSITION'|'CONSOLIDATION'|'HANDOFF_REJECTED'|'PRESIGN_FORBIDDEN'; }
export const TESTNET_CHAIN_IDS: readonly [11155111, 84532, 31337];
```

### 5.3 Edits to existing code (NOT part of the package build; owned by other contributors, coordinate before merge)

| File | Edit |
|---|---|
| `apps/web/src/views/Sweep.tsx`, `apps/web/src/lib/sweep.ts` | Hop toggle, ack dialog, cost preview, leg status list; call `@ghostpay/hops` |
| `apps/web/src/lib/settings.ts`, `Settings.tsx` | `hopMode` fields and `sanitizeSettings` entries (default off) |
| `apps/web/src/lib/keystore.ts`, `idbStore.ts` | persist/export `HopPlan[]` (no keys) |
| `apps/web/src/lib/jitter.ts` | optional: move `randomDelayMs` into a shared package and delete the copy in `hops/src/rand.ts` |
| `docs/user/privacy-limits.md` | add N1..N9 verbatim |
| root `package.json` workspaces / `tsconfig` references | register `packages/hops` |

No contract edit, no relayer source edit (relayer gets tests only: AT-HOP-RLY below).

## 6. Requirements (numbered, testable)

**Plan and safety**
- HOP-REQ-1 (MUST): `planHops` throws `NOT_ACKED` unless `ackWeak === true`; `TESTNET_CHAIN_IDS` enforced (`MAINNET_FORBIDDEN`) in every exported entry point.
- HOP-REQ-2 (MUST): `hops` in `1..4`; all `S_j` (j=2..k+1) are distinct, obtained via `HopAddressSource.next()`, never equal to `source`, never previously used (ledger check); never announced.
- HOP-REQ-3 (MUST): Each leg sweeps the **entire** token balance of its source (`amount = balance`); a plan with residue is invalid (`CONSOLIDATION`/`validatePlan`). No two sources ever feed one destination (no consolidation; hygiene HY-CON).
- HOP-REQ-4 (MUST): `delay_j` drawn independently per leg by CSPRNG rejection sampling (no modulo bias, no `Math.random`); `sum <= maxTotalMs`; statistical test: uniformity chi-square over `[minMs,maxMs]` at fixed seed; legs are not forced to equal gaps.
- HOP-REQ-5 (MUST): Plan refused with `FEE_CAP` when modelled total fee `> maxTotalFeeBps`, and `AMOUNT_TOO_SMALL` when any `amountIn_j <= fee_j`.
- HOP-REQ-6 (MUST): Order fields at signing: `owner = leg.from`, `destination = leg.to`, `amount = on-chain balance read at signing`, `fee <= quote and <= 300 bps`, `deadline = now + <= 900 s`, `nonce` fresh; `buildSweepTypedData` from `chain-adapters` is used unmodified.
- HOP-REQ-7 (MUST): **No presigning**: no signature object is persisted; `PlanStore` serialisation test asserts absence of any field matching `sig|signature|rawTx|privateKey|secret`; leg `dueAt` in the future with state `waiting` holds no signed payload (`PRESIGN_FORBIDDEN`).
- HOP-REQ-8 (MUST): Persist-before-sign: `reduce` rejects `signing -> submitted` without a stored `nonce`; crash-injection test at each transition resumes without double-spend or lost leg (sweep nonce single-use [R]).
- HOP-REQ-9 (MUST): Keys only inside `withSecret` scope, zeroised on exit including on throw (`secret-box` semantics [R]).
- HOP-REQ-10 (MUST): Token without ERC-2612 support rejected with `NO_PERMIT` (capability probed by caller, injected).
- HOP-REQ-11 (SHOULD): With `rotate` and >= 2 relayers, consecutive legs never use the same relayer; with one relayer `previewCost().text` contains the single-relayer warning.
- HOP-REQ-12 (MUST): `relayerSelection: 'direct'` only with `hops === 1`, else `ILLEGAL_TRANSITION`/validation error.
- HOP-REQ-13 (MUST): `fingerprintReport` returns the exact amount ladder and candidate-range figure; UI shows it (N3).
- HOP-REQ-14 (SHOULD): Only the final destination may be `external`; if so, the UI repeats the hygiene "fresh, never-used address" warning.

**UX**
- HOP-UX-1 (MUST): Option off by default; enabling requires the dialog containing all five points of section 3.
- HOP-UX-2 (MUST): Cost preview always shows `singleSweepFeeBps` next to `totalFeeBps`.
- HOP-UX-3 (MUST): Shipped strings in `labels.ts` and any UI string produced by this package contain none of `anonymous|anonymis|untraceable|mix|launder|obfuscat|private` (case-insensitive) except inside the sentence template "for real unlinkability use a shared pool exit"; test greps.
- HOP-UX-4 (MUST): Status view shows "weak" badge on every plan and the overdue notice when `due` legs are past `dueAt + 1 h` because the app was closed.

**Relayer (no relayer source change)**
- HOP-RLY-1 (MUST): A fresh quote is requested per leg at its due time; a quote older than its `expiresAt` is never used.
- HOP-RLY-2 (MUST): Requests carry no plan id, no previous-leg reference, no cookies (`RelayerClient` test inspects the request body/headers).
- HOP-RLY-3 (SHOULD): Optional proxy URL per relayer (`onion-i2p-research.md` section 9.1 [R]); with proxy set, `hops` uses the proxy for all legs.
- AT-HOP-RLY-1 (relayer test, no src change): relayer logs/metrics for a 3-leg plan contain no owner, destination or plan correlate (extends AT-HY-7 [R]).

**Pool combination (section 7)**
- HOP-POOL-1 (MUST): If `handoff === 'pool-exit'`, `planHops` default `hops` is `0`/disabled and the UI states "hops before a pool add no privacy"; user override allowed up to 2 with the note.
- HOP-POOL-2 (MUST): `handoff.ts` outputs `{ terminal: Address; withSecret }` for the pool stage (`SP-EXIT` / external-pool adapter) and **does not** count hop delays toward pool dwell time or anonymity-set estimates (`HandoffInfo.creditedDelayMs === 0`).
- HOP-POOL-3 (MUST): `hops` after a pool withdrawal are rejected (`HANDOFF_REJECTED`): post-exit forwarding only costs fees and re-creates a 1-in/1-out chain.
- HOP-POOL-4 (MUST): Pool deposit amounts follow the pool spec's denomination rules; hops never produce a "round" amount and never claim to blur amounts.

## 7. Combination with pool exit

Order is fixed: `P -> S1 -> [hops 0..2] -> S(k+1) -> pool deposit -> pool withdrawals (D_i)`. Rationale:
- Anonymity comes from the pool's shared state and dwell time, not from hops [R: research 6.1, 10]. Hops before the deposit change only *which address deposits*; the payer follows `S1 -> ... -> deposit` and the ASP sees the same funding history, so no taint or linkage property improves.
- The only plausible benefit is one fewer hop's worth of direct `S1 -> Pool` edge (E4), which is cosmetic, so the default with pool exit is zero hops.
- After withdrawal, forward-hopping `D_i -> E_i` is rejected (HOP-POOL-3).
- Gas: the leg relayer can only sweep to an address; a pool deposit is a contract call from `S(k+1)` handled by the pool spec's own gas path (buffer or 7702 sponsor) [R: shielded-pool, payer-hiding]. The hop relayer is never the depositor.
- Dwell/time: total delay shown to the user is `sum(hop delays) + pool dwell`; only the pool dwell is credited in any anonymity estimate.
- Fees add: router 25 bps once + hop relayer fees + pool fees (per pool spec). The preview sums all stages.

## 8. Test plan

1. Unit/property (vitest, fast-check): `planHops` invariants (distinct addresses, fees compound exactly, no residue, deadline window); `reduce` state machine closed under all events; `previewCost` math (0.50/0.99/1.49/1.98 % floors); delay uniformity; fee cap and tiny-amount refusals; PlanStore serialisation has no secrets/signatures; labels grep.
2. Crash/resume: inject crash after each of `signing`, `submitted`; resume yields exactly one confirmed sweep per leg.
3. Anvil e2e with real `GhostPaySweepRelayer`, mock `PermitToken`: `P -> Router(payERC20) -> S1`, then 3 legs with two relayer keys; assert final balance `= A_0*...` per-leg fees, each destination fresh, router allowance zero, `Swept` events as expected, no leg reuses a nonce.
4. **Negative PoC (AT-HOP-NEG-1)**: `testutil/follower.ts` implements a forward tracer (from `S1`, follow the unique outgoing `Transfer` of the token, tolerate fee shrinkage in `[0.5 %, 3 %]`, time gap up to `maxTotalMs`). Assert it recovers `D` for 100 % of 200 randomized single-user plans (k=1..4, delays drawn), in `<= k` steps. This test failing would mean the docs overstate the weakness; its passing is the evidence behind N1/N2. It also records, for a simulated crowd of `c` concurrent plans of similar amounts, the tracer's ambiguity rate; with `c=1..20` and amount spread ±0 % it reports accuracy (informational, thresholds not asserted beyond the c=1 case) to support the "no crowd" statement.
5. Pool handoff contract tests with the mock pool from `external-pools.md` (EP-M [R: external-pools 6.5]): defaults (zero hops), credit `0`, post-exit rejection.
6. Relayer tests AT-HOP-RLY-1 (log content), HOP-RLY-2 (request shape).
7. Mutation: remove `ackWeak` check, remove persist-before-sign, remove presign guard; each must fail a test.

## 9. PoC acceptance criteria

1. `npm run build:libs && npm test --workspace @ghostpay/hops` green; coverage thresholds as siblings (>= 90 % lines for `plan.ts`, `machine.ts`, `execute.ts`).
2. Anvil e2e (REQUIRE_ANVIL=1) passes 3-hop run end to end; skipped state reported as such in `DEVIATIONS.md` if anvil is absent.
3. AT-HOP-NEG-1 passes (follower recovers `D` in every single-user plan).
4. Every spec N-item (N1..N9) appears in the user-facing copy checked by a test; banned-word grep passes.
5. Cost preview matches measured on-chain fees in the e2e within 1 base unit.
6. `hopMode` is off by default and absent from any flow unless `ackWeak`.
7. Not run and recorded as such: any real wallet, any public testnet relayer, Firefox/Safari.

## 10. Effort

**S-M overall: M for the whole (package S, anvil e2e and negative PoC M).** Package ~1.5 weeks, UI edits (separate owner) ~1 week, tests ~1 week. No contract or circuit work.

## 11. Risks

| Risk | Mitigation |
|---|---|
| User believes hops give privacy | Weak badge, blocking ack, side-by-side single-sweep cost, banned-word test, negative PoC (HOP-UX-1..4) |
| Pattern flags user (N7) and legal appearance of layering (owner deferred) | Default off; no marketing; decision recorded for later review |
| Fees compound (>= 0.5 % per hop) | FEE_CAP, per-hop display, hop cap 4 |
| App closed -> stuck legs, longer-than-drawn delays | `due` overdue notice; resume on unlock; documented timing distortion |
| Persist-before-sign bugs strand funds mid-chain | Crash tests; every `S_j` key re-derivable from seed + index; recovery scan |
| One relayer sees all legs | Rotation default; warning when only one relayer |
| Relayer outage mid-plan leaves funds at `S_j` (safe, but stuck without gas) | Retry with another relayer; manual `direct` sweep needs native gas (documented) |
| Index collision with hygiene destinations | Shared `HopAddressSource` allocation via hygiene ledger |
| Non-permit tokens | `NO_PERMIT`, mode unavailable |
| Timing distribution fingerprint (uniform draws) | Delays configurable; no claim of statistical hiding |

## 12. Open questions

- Q1 Should hop delays follow an exponential (Loopix-like [S: research 9]) rather than uniform distribution? Not claimed to matter without a crowd; uniform shipped.
- Q2 Wire `HopAddressSource` to `@ghostpay/hygiene` (not yet built) or ship a self-contained derivation first? Spec assumes injection; a stub is needed for the e2e.
- Q3 Should the app prefer fewer, longer-spaced hops or more, shorter? No measurement exists; left to the user.
- Q4 Move `randomDelayMs` to a shared package (edit list) or keep the copy?
- Q5 Owner decision on whether the mode ships behind an "advanced" disclosure only.
- Q6 External source verification: Kappos et al. (USENIX Security 2022) and Wang et al. (WWW '23) were not re-fetched here; fetch the primary PDFs before quoting numbers.

## 13. Sources

- [R] `docs/remote/anonymization-research.md` sections 1, 4.1, 4.3, 4.5, 6.0, 6.1, 10; `docs/CONTRACTS_SPEC.md` section 2; `docs/FEE_SCHEDULE.md`; `docs/remote/privacy-specs/hygiene.md`; `apps/web/src/lib/jitter.ts`; `packages/chain-adapters/src/sweep.ts`.
- [S via research doc, not fetched 2026-10-21 because the host was unreachable] Kappos et al., "How to Peel a Million", USENIX Security 2022 (https://www.usenix.org/conference/usenixsecurity22/presentation/kappos); Wang et al., WWW '23 (https://arxiv.org/abs/2201.09035).
- ERC-2612 permit and EIP-5564 as used by the repo: https://eips.ethereum.org/EIPS/eip-2612, https://eips.ethereum.org/EIPS/eip-5564 (referenced via repo; not re-fetched here).
