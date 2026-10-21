# Spec: Chaining privacy methods (`@ghostpay/privacy-pipeline`)

Status: **spec, not built**. Date 2026-10-21. Branch `claude/remote-extensions-1`. Scope: testnet-only PoC (anvil `31337`, Sepolia `11155111`, Base Sepolia `84532`; BTC `testnet|signet|regtest`). Effort: **M** (package) + **S** (rule data in `privacy-profiles`).

Legal: deferred by the owner (ADR-0006). Noted once. Not a blocker. No GhostPay fee on any step this spec adds.

Evidence tags: [R] read in repo this run (all files in this directory, `apps/web/src/{views,lib}` listing, `packages/relayer-guard/package.json`). No external source used. Rules taken from a sibling spec cite its id; rules this spec adds are marked **[new]** and go to `DEVIATIONS.md` for owner review.

## 1. Goal

User requirement: users can **chain** privacy methods as ordered pipelines (e.g. payer-hiding -> amount shaping -> pool deposit -> pool exit to a stealth address -> hygiene sweep), with network transport applied across all steps.

This spec defines:
1. a typed **pipeline model** (steps with typed input/output holdings);
2. **ordering/compatibility rules** as data (`CHAIN_RULES` in `@ghostpay/privacy-profiles`);
3. a **pure planner/validator** and an **executor** (state machine over injected ports) in new package `@ghostpay/privacy-pipeline`;
4. a per-pipeline **cost / latency / trust / leak summary** that never overclaims.

Non-goals: new privacy mechanisms; UI copy; executing anything inside the package without injected drivers; joining funds (consolidation is forbidden, HY-CON); cross-chain or cross-asset bridges; any numeric anonymity score (EP-UX-3).

## 2. Threat addressed and what it does NOT protect

Addressed: **composition errors**. Users stacking steps that cancel (hops before a pool, unwrap after CT), that are impossible (PayJoin + SP output in one tx, hops after pool exit), that strand funds mid-chain (crash between steps), or that a UI sums into an inflated claim ("pool + hops + Tor = untraceable").

Does NOT protect:
- Chaining adds no privacy beyond its strongest single step. Steps do not multiply crowds. The unlinking claim of a pipeline is at most that of its pool step (crowd-dependent; on testnet: none, SP N1, EP N2).
- Every step's "does NOT protect" list still applies; the union is shown.
- Longer pipelines add emergent leaks (section 7.2): amount continuity, timing across steps, combination fingerprint, more trusted parties, longer app-open time.
- The executor cannot hide anything the method packages expose; it only orders, persists and resumes them.

## 3. Pipeline model

### 3.1 Roles and joining

A pipeline belongs to **one role on one device**: `payer` (action `pay` / `btc-send`) or `seller` (`sweep` / `btc-receive`). Payer and seller are different users; there is no shared executor. An end-to-end flow is **two pipelines joined at the payment edge**: the payer pipeline ends in `paid`; the seller pipeline starts from a `stealth` holding whose `asset` and `origin` the seller observes at scan time (`router`, `pool` for SP-PAY, `confidential-router` for CT). The seller picks or re-validates its pipeline per received payment, because the payer's choices restrict it (CT forces `ct.sweep`, C-12).

Invoice fields carry the only cross-role constraints: `amountVisibility` (CT, R-39), `btc.mode` (one mode per URI, BPJ-URI-2), asset.

### 3.2 Holdings (typed values between steps)

```ts
export type Holding =
  | { t: 'payer-funds'; wallet: 'long-lived' | 'fresh'; asset: AssetKind }          // payer EOA balance
  | { t: 'payment-plan'; parts: number; asset: AssetKind }                           // shaped, unsigned (AB plan)
  | { t: 'note'; pool: PoolRef; asset: AssetKind; holder: 'payer' | 'seller' }       // SP Note / EP PoolNote
  | { t: 'stealth'; asset: AssetKind; origin: 'router' | 'pool' | 'confidential-router' | 'hop' }  // S1 or S(k+1)
  | { t: 'owned'; asset: AssetKind; origin: 'self-derived' | 'external' | 'pool-exit' } // D / D_i; terminal for chaining
  | { t: 'paid' }                                                                    // payer terminal
  | { t: 'btc-utxo'; kind: 'sp' | 'payjoin-addr' | 'plain' };
export type PoolRef = 'shielded-pool' | 'privacy-pools' | 'railgun' | 'mock-pool';
```

`AssetKind` and option ids are imported from `@ghostpay/privacy-profiles` (profiles 6.1). Addresses and amounts are runtime fields on step instances, not on the type.

### 3.3 Step catalogue (normative content of `STEP_CATALOGUE`)

`Fan` = output multiplicity. `Wait` = step contains a delay (Feature 6 rule: nothing signed while waiting, AB-T2, HOP-REQ-7). `Purposes` = network purposes it uses (transport layer, 3.4). `Opt` = profile option(s) it is projected to for `evaluate()` (section 5.3).

| Kind | Role | In -> Out | Fan | Wait | Purposes | Spec ids | Opt (projection) |
|---|---|---|---|---|---|---|---|
| `src.wallet` | payer | (start) -> payer-funds{long-lived} | 1 | no | — | PH-0 | `pay.payerMode=direct` |
| `payer.fresh-wallet` | payer | payer-funds{long-lived} -> payer-funds{fresh} | 1 | yes (`planFunding.delayMs`) | rpc | PH-1 | `pay.payerMode=fresh-wallet` |
| `ct.wrap` | payer | payer-funds{erc20*} -> payer-funds{confidential} | 1 | yes (min dwell) | rpc | CT-1..3, CT-UX-4 | `pay.amountVisibility=<backend>` |
| `amount.shape` | payer | payer-funds -> payment-plan{parts=k} | 1 | no (plan only) | — | AB-ROUND/SPLIT/DENOM/DELAY, MH-AMT-2 | `pay.amountBlur`, `pay.amountNoise` |
| `pool.deposit` | both | payer-funds \| stealth -> note[] | n (denominations) | no | rpc, sponsor/pool-relayer if sponsored | SP-EXIT, SP-PAY, EP-1/2/M, SP-SDK-8 | `sweep.exit` / `pay.source`, `sweep.poolAmountPlan`, `sweep.exitGas` |
| `pool.dwell` | both | note -> note | 1 | yes (SP default 24-72 h) | scan | SP 6.5, EP-LINT-1 | — |
| `pay.submit` | payer | payer-funds \| payment-plan -> paid | 1 per part | parts gaps (AB-T*) | rpc, sponsor | PH-0..4, MH-FEE-1, CT router | `pay.payerMode`, `pay.route`, `pay.amountVisibility` |
| `pay.from-pool` | payer | note{holder=payer, pool=shielded-pool} -> paid | 1 | no | pool-relayer | SP-PAY | `pay.source=shielded-pool` |
| `recv.stealth` | seller | (start, observed) -> stealth{origin} | 1 per payment part | no | scan | HY-VER | — |
| `sweep.delay` | seller | stealth -> stealth | 1 | yes | — | AB-DELAY (seller) | `sweep.delay=jitter` |
| `hops.forward` | seller | stealth{erc20-permit} -> stealth{origin=hop} | 1 | yes per leg | relayer | HOP-N | `sweep.hops`, `sweep.hopRelayers` |
| `hygiene.sweep` | seller | stealth{non-confidential} -> owned{self-derived \| external} | 1 | no | relayer, rpc (address-free) | HY-DST/VER/BUF/FUND | `sweep.destination`, `sweep.verification` |
| `pool.exit` | seller | note{holder=seller} -> owned{pool-exit}[] | n (partial withdrawals) | yes (gaps) | pool-relayer | SP-EXIT, EP `executeExit` | `sweep.poolSubmit`, `sweep.poolAsp` |
| `ct.sweep` | seller | stealth{confidential} -> owned{self-derived} | 1 | no | rpc, decrypt-relayer | CT 6.6, CT-DEC-2 | `pay.amountVisibility` (seller view) |
| `ct.unwrap` | seller | stealth{confidential} -> stealth{erc20} | 1 | no | rpc | CT 6.6, CT N2 | — |
| `btc.send` | payer | btc-utxo -> paid | 1 | no | rpc, payjoin-directory (v2) | BIP-352 / BPJ | `btc.mode` |
| `btc.recv` | seller | (start) -> btc-utxo{sp \| payjoin-addr \| plain} | 1 | no (v2 async session) | payjoin-directory | BPJ modes | `btc.mode` |
| `btc.payjoin-contribute` | seller | btc-utxo{sp} -> btc-utxo{payjoin-addr} | 1 | no | payjoin-directory | BPJ-RCV-9 | `btc.contributeFromSp=on` |

Typing rules (enforced by the validator before any `CHAIN_RULES` check):
- T-1 Each step's `In` must match the previous step's `Out` on the same lineage (structural match on `t`, `asset`, `origin`, `holder`).
- T-2 Fan-out (`pool.deposit` denominations, `pool.exit` partial withdrawals, payer parts) creates **lineages**; subsequent steps map over each lineage. There is no join step: consolidation is unrepresentable (HY-CON-1, SP N7).
- T-3 `owned` and `paid` are terminal: no step accepts them. This makes "hops after pool exit" (HOP-POOL-3) and "hygiene sweep then hops" type errors, not rule lookups.
- T-4 One pipeline = one chain id and one asset family (EVM or BTC). Cross-chain is impossible (C-33).

### 3.4 Cross-cutting layers (not steps)

Applied to every step that declares the purpose; fixed for one run.

```ts
export interface PipelineLayers {
  readonly transport: Readonly<Partial<Record<Purpose, NetProfileId>>>;   // 'direct' | 'tor-browser' | ... (profiles 7.4)
  readonly rpcMode: 'single' | 'quorum' | 'own-node' | 'light-client';
  readonly scanMode: 'range' | 'indexer-tor' | 'pir2' | 'light-client';
  readonly verification: 'address-free' | 'direct';                       // HY-VER, also used by reconcile()
  readonly isolation: 'per-step' | 'per-purpose';                          // [new] default per-step: fresh SOCKS creds per step instance (NP-I-1)
}
export type Purpose = 'rpc' | 'scan' | 'read-address' | 'relayer' | 'sponsor' | 'pool-relayer' | 'decrypt-relayer' | 'payjoin-directory';
```

Layer rules: L-1 a purpose used by any step and set to non-direct needs `selftest-ok:<role>` at start **and at every resume** (R-29, NP-T-5); failure pauses the run, never falls back to `direct`. L-2 layers cannot change mid-run; changing requires abort-at-checkpoint and a new plan hash (NP-T-2) [new]. L-3 a purpose whose party is relay-like and is `direct` raises R-31 once per party, listing the steps that hit it. Invoice/announce options (MH-INV-*, MH-ANN-*, MH-ID-*) are role settings, not pipeline layers; they are evaluated by `evaluate()` unchanged.

### 3.5 Example (the user's chain, typed)

```
payer:  src.wallet -> payer.fresh-wallet -> amount.shape{denom} -> pool.deposit{shielded-pool, n} -> pool.dwell
        -> pay.from-pool        (SP-PAY: exit to the seller's stealth S1; one note per invoice, C-10)
seller: recv.stealth{origin=pool} -> hygiene.sweep{self-derived}
        (hops.forward allowed before hygiene.sweep, labelled Weak; never after pool.exit)
layers: transport{rpc,pool-relayer,relayer: tor-*}, scan pir2|indexer-tor, verification address-free
```

Note: the payer's `amount.shape` feeds `pool.deposit` here (denominated deposits, SP-SDK-8), not `pay.from-pool`; SP-PAY remains one withdrawal (R-18).

## 4. Compatibility and ordering matrix

Relations: **valid**; **redundant** (allowed, adds cost and no gain; `W_MOOT`); **harmful** (allowed only with ack; adds a leak); **impossible** (blocked). "Before" means earlier on the same lineage. `PR` = existing profile rule it refines.

| Id | Pattern | Relation | Reason | Source / PR |
|---|---|---|---|---|
| C-01 | `hops.forward` before `pool.deposit`, hops <= 2 | redundant | Pool credits 0 for hop delay; payer follows `S1 -> ... -> deposit`; ASP sees same history | HOP-POOL-1/2, R-08 |
| C-02 | `hops.forward` before `pool.deposit`, hops > 2 | impossible | Cap | HOP-POOL-1, R-09 |
| C-03 | anything after `pool.exit` on that lineage | impossible (type T-3) | Post-exit forwarding re-creates a 1-in/1-out chain, only costs fees | HOP-POOL-3 |
| C-04 | `hygiene.sweep` before `pool.deposit` (deposit from `D`) | impossible (type T-3) | Equals one hop (credit 0) and needs native gas at `D` (gas funding link) | HY 2, EP N3, [new] |
| C-05 | `hops.forward` -> `hygiene.sweep` | valid (Weak, ack) | Equals HOP `finalDestination=self-derived` | HOP 4.1, R-04 |
| C-06 | `sweep.delay` before `pool.deposit` | redundant | Only pool dwell is credited; jitter before deposit changes nothing the pool measures | HOP 7 (dwell rule), [new] |
| C-07 | `pool.deposit` x2 on one lineage (re-pool, any pools) | impossible (PoC) | Unspecified; each deposit public, amounts chain across pools | [new], Q2 |
| C-08 | `payer.fresh-wallet` -> `pool.deposit` | valid | Depositor is the fresh wallet, not the long-lived one; token funding link remains | PH N2, SP T2 |
| C-09 | `pool.deposit` with payer sponsor PH-2 | impossible | Relay calls `payERC20` only | PH 6.2 |
| C-10 | `amount.shape{split\|denom\|round}` -> `pay.from-pool` | impossible | SP-PAY is a single withdrawal with one announcement | R-18 |
| C-11 | `amount.shape{denom}` -> `pool.deposit` | valid | Denominated deposits | SP-SDK-8, AB-DENOM |
| C-12 | `pay.from-pool` with `payerMode != direct` | impossible | Pool is the payer | R-17 |
| C-13 | `stealth{confidential}` -> `pool.deposit` \| `hops.forward` \| `hygiene.sweep` | impossible | Unwrap is public; sweep relayer is ERC-20 permit only; CT sweep is self-sent | R-11, CT 6.6 |
| C-14 | `ct.unwrap` anywhere | harmful (ack `ctUnwrapPublic`) | Emits cleartext amount; undoes CT for that hop | CT N2, [new] |
| C-15 | `ct.wrap` -> `pay.submit` with wrap amount == invoice gross, or dwell < min | harmful (warn; block if equal) | Wrap amount public; exact-amount wrap leaks the invoice | CT N2, CT-UX-4 |
| C-16 | `ct.wrap` + `payerMode != direct` | impossible | PH-2 calls `payERC20`; PH-3/4 with CT router unspecified | R-12 |
| C-17 | CT + `pay.route=direct-no-fee` (MH-FEE-1) or MH-FEE-2 accrual router | impossible | CT pays through `GhostPayConfidentialRouter`, which aggregates fees itself (CT 6.3); neither the no-fee path nor the accrual router exists for ERC-7984 | R-16, CT 6.1/6.3, MH-FEE-2, [new] for FEE-2 |
| C-18 | CT + `amount.shape{split\|denom}` | impossible | Not specified for CT | R-14 |
| C-19 | CT + `amount.shape{round}` or MH-AMT-2 | redundant | Amount is already hidden on-chain | R-15 |
| C-20 | `amount.shape{split\|denom}` + sponsored `pay.submit` | harmful (warn) | One sponsor sees all parts | R-32 |
| C-21 | `amount.shape{split}` -> seller per-part sweeps | valid; consolidation impossible | Each part is its own lineage; any join re-links | AB 2(5), HY-CON |
| C-22 | `pay.route=direct-no-fee` + sponsored payer | impossible | Sponsored paths call the router | R-20 |
| C-23 | `btc.recv{sp}` and PayJoin in the same tx | impossible | SP needs keys of all inputs; collaborative SP unproven | BPJ-SP-1, BPJ-URI-2 |
| C-24 | `btc.recv{sp}` -> `btc.payjoin-contribute` (later tx) | valid | Sequential only; SP output spent as receiver input | BPJ 4(3), BPJ-RCV-9 |
| C-25 | PayJoin + `btc.locktime=height` | impossible | Receiver must not change locktime | R-36 |
| C-26 | `pool.exit` / `hygiene.sweep` to `external-reuse` | impossible | Re-links | R-10, SP N7 |
| C-27 | `pool.exit` with `poolSubmit=self` | harmful (warn) | Gas funding links submitter | SP 6.5, EP N3 |
| C-28 | `pool.deposit{privacy-pools}` with `exitGas=permit-sponsored` | impossible | Depositor must be `S1` | R-34 |
| C-29 | `pool.deposit{mock-pool}` or CT-M without `test-mode` | impossible | Test doubles | R-03 |
| C-30 | `hops.forward` with asset != `erc20-permit` | impossible | `NO_PERMIT` | R-07 |
| C-31 | payer `pay.from-pool` and seller `pool.deposit` into the same pool | valid (warn `amountTimingMatch`) | Value in ~ value out minus fee, short gap | SP N3 |
| C-32 | any step using a relay-like purpose with transport `direct` | harmful (warn) | That party sees IP | R-31 |
| C-33 | EVM step and BTC step in one pipeline; or two chain ids | impossible (type T-4) | No bridge in scope | README 1 (watch list) |
| C-34 | second pool on the same role (two independent pools in one run, no re-pool) | redundant | Crowds do not add across unrelated deposits by one user | [new] |
| C-35 | > 1 `pool.exit` lineages swept/forwarded to one address | impossible | Consolidation | SP N7, HY-CON-1 |

Cells not listed: **valid** if T-1..T-4 hold and `evaluate()` of the projection (5.3) has no blocking issue. Unknown kinds or params: **impossible** (fail closed).

Compact view (row before column on a lineage; `-` = type error / different role):

| before \ after | hops | hyg.sweep | pool.dep | pool.exit | ct.sweep | pay.submit | pay.from-pool |
|---|---|---|---|---|---|---|---|
| amount.shape | - | - | Y (C-11) | - | - | Y / W (C-20) | X (C-10) |
| payer.fresh-wallet | - | - | Y (C-08) | - | - | Y | - |
| ct.wrap | - | - | X (C-13) | - | - | W (C-15) | X |
| sweep.delay | Y | Y | M (C-06) | - | - | - | - |
| hops | Y (one step, k legs) | Y (C-05) | M (C-01) / X >2 | - | - | - | - |
| hyg.sweep | X (T-3) | X (T-3) | X (C-04) | - | - | - | - |
| pool.deposit | - | - | X (C-07) | Y (via dwell) | - | - | Y (SP only) |
| pool.exit | X (C-03) | X (C-03) | X (C-03) | - | - | - | - |

## 5. Rules as data (`@ghostpay/privacy-profiles`, new file `src/chainRules.ts`)

Data stays in the data package (profiles section 4: rules are data, matrix generated). Logic lives in `privacy-pipeline`. `privacy-profiles` still imports no method package.

### 5.1 Types

```ts
export type StepKind =
  | 'src.wallet' | 'payer.fresh-wallet' | 'ct.wrap' | 'amount.shape' | 'pool.deposit' | 'pool.dwell'
  | 'pay.submit' | 'pay.from-pool' | 'recv.stealth' | 'sweep.delay' | 'hops.forward' | 'hygiene.sweep'
  | 'pool.exit' | 'ct.sweep' | 'ct.unwrap' | 'btc.send' | 'btc.recv' | 'btc.payjoin-contribute';

export interface StepDef {
  readonly kind: StepKind;
  readonly role: 'payer' | 'seller' | 'both';
  readonly accepts: readonly HoldingPattern[];       // T-1
  readonly produces: HoldingPattern;                 // may depend on params via `producesBy`
  readonly fan: 'one' | 'many';
  readonly waits: boolean;
  readonly purposes: readonly Purpose[];
  readonly params: ParamSchema;                      // closed set; unknown key -> E_UNKNOWN_VALUE
  readonly project: (p: StepParams) => Partial<Record<OptionId, string>>;  // pure; section 5.3
  readonly specRef: { file: string; ids: readonly string[] };
  readonly maturity: Maturity;                       // reused from profiles
}
export type HoldingPattern = { t: Holding['t'] } & Partial<Record<'asset' | 'origin' | 'holder' | 'wallet' | 'kind', readonly string[]>>;

export interface StepMatch { readonly kind: StepKind | readonly StepKind[]; readonly where?: ParamPred }
export type ParamPred =
  | { p: string; in: readonly (string | number)[] } | { p: string; gt: number } | { p: string; eqInvoiceGross: true }
  | { all: readonly ParamPred[] } | { any: readonly ParamPred[] } | { not: ParamPred };
export type ChainPattern =
  | { before: readonly [StepMatch, StepMatch]; adjacent?: boolean }     // same lineage, a earlier than b
  | { after: StepMatch; any: true }                                     // anything after a (C-03)
  | { repeat: StepMatch; min: number }                                  // C-07, C-34
  | { with: StepMatch; ctx: Pred }                                      // step + profile Pred (layers, caps, asset)
  | { joinOf: StepMatch };                                              // C-35
export interface ChainRuleDef {
  readonly id: `C-${string}`;
  readonly relation: 'valid' | 'redundant' | 'harmful' | 'impossible';
  readonly pattern: ChainPattern;
  readonly effect: 'none' | 'warn' | 'ack' | 'block';  // valid->none|warn, redundant->warn(W_MOOT), harmful->warn|ack, impossible->block
  readonly key: WarningKey | ErrorKey | AckKey;        // 'privacy.err.chain.<name>' | 'privacy.warn.chain.<name>'
  readonly profileRule?: RuleId;                       // R-xx it refines; both must agree (PL-7)
  readonly specRef: { file: string; ids: readonly string[] } | 'new';
}
export const STEP_CATALOGUE: Readonly<Record<StepKind, StepDef>>;
export const CHAIN_RULES: readonly ChainRuleDef[];      // C-01..C-35, section 4
export function chainMatrix(): readonly ChainMatrixCell[];   // generated; section 4 compact table is its output
```

### 5.2 Example rows

```ts
{ id: 'C-03', relation: 'impossible', pattern: { after: { kind: 'pool.exit' }, any: true },
  effect: 'block', key: 'privacy.err.chain.afterPoolExit', specRef: { file: 'hops.md', ids: ['HOP-POOL-3'] } },
{ id: 'C-01', relation: 'redundant', pattern: { before: [{ kind: 'hops.forward', where: { not: { p: 'hops', gt: 2 } } }, { kind: 'pool.deposit' }] },
  effect: 'warn', key: 'privacy.warn.hopsBeforePoolNoGain', profileRule: 'R-08', specRef: { file: 'hops.md', ids: ['HOP-POOL-1', 'HOP-POOL-2'] } },
{ id: 'C-17', relation: 'impossible', pattern: { with: { kind: 'pay.submit', where: { p: 'route', in: ['direct-no-fee', 'accrual'] } }, ctx: { asset: ['confidential'] } },
  effect: 'block', key: 'privacy.err.conflict.ctDirectPay', profileRule: 'R-16', specRef: { file: 'confidential-tokens.md', ids: ['6.1', '6.3'] } },
```

### 5.3 Projection to a profile `Selection`

`projectToSelection(pipeline): Selection` folds every step's `project()` plus layers into one profile `Selection`; the validator then runs the unchanged `evaluate()` (R-01..R-40, capability, env, chain, acks). Chain rules add ordering knowledge on top. Where a step is used in a role the profile models differently (payer `pool.deposit` from a fresh wallet), the step's `project()` sets only the options that describe the **payment** tx, so R-17 is applied to `pay.from-pool`, not to the earlier deposit [new refinement, recorded in DEVIATIONS]. Conflicts between a chain rule and a profile rule resolve to the stricter (PL-7).

New keys (appended to profile key lists): errors `chain.afterPoolExit`, `chain.typeMismatch`, `chain.repool`, `chain.consolidation`, `chain.crossChain`, `chain.layerChanged`, `chain.ctToPool`, `chain.payjoinSp`; warnings `chain.creditZero`, `chain.secondPoolNoGain`, `chain.amountContinuity`, `chain.longRun`, `chain.combinationFingerprint`, `chain.appMustStayOpen`; ack `ctUnwrapPublic`.

## 6. Executor design

### 6.1 Ports (all injected; package has no I/O)

```ts
export interface StepDriver<K extends StepKind = StepKind> {
  readonly kind: K;
  quote(i: StepInstance, h: HoldingRef): Promise<StepQuote>;          // read-only; fees, gas, latency bounds, parties
  prepare(i: StepInstance, h: HoldingRef, q: StepQuote): Promise<Prepared>;   // unsigned; no signature persisted
  submit(i: StepInstance, p: Prepared, s: SignPort): Promise<{ ref: SideEffectRef }>;   // the only side effect
  reconcile(i: StepInstance): Promise<'not-started' | 'pending' | 'done' | 'failed'>;   // idempotency check after crash
  outputs(i: StepInstance): Promise<readonly HoldingRef[]>;            // lineage outputs after `done`
  emergencyExits(h: HoldingRef): readonly EmergencyExit[];             // e.g. note -> ragequit (re-links), stealth -> plain sweep
}
export interface PipelineStore { load(id: string): Promise<SealedRun | null>; save(r: SealedRun): Promise<void>; }  // app seals with secret-box
export interface Confirmer { confirm(c: Checkpoint): Promise<{ ok: boolean; planHash: Hex }>; }
export interface Clock { nowMs(): number; }                             // wall clock; monotonic handled by app scheduler
export interface CapabilityProbe { capabilities(): Promise<ReadonlySet<Capability>>; selfTest(p: Purpose): Promise<boolean>; }
```

`apps/web` wires drivers to method packages: `pool.*` -> `@ghostpay/shielded-pool` / `ExternalPoolAdapter`; `hops.forward` -> `@ghostpay/hops` (`planHops`, `runHopLeg`, its own `reduce`); `hygiene.sweep` -> `@ghostpay/hygiene` + existing `sweep.ts`; `amount.shape` -> `planSplit`; `pay.submit` -> `payExec.ts` / `@ghostpay/payer-hiding`; `ct.*` -> `ConfidentialBackend`; `btc.*` -> `@ghostpay/btc-payjoin` / `btc-silent-payments`. Method packages keep their own persisted state (HopPlan, PoolNote vault); the pipeline stores only references (README invariant 4).

### 6.2 State machines (pure reducers)

Step instance:
```
planned -> ready -> [awaiting-confirm] -> waiting(dueAt) -> due -> preparing -> signing(persisted intentKey) -> submitted(ref) -> confirmed -> done
any pre-signing state -> skipped | aborted
signing|submitted --crash--> reconciling -> {due | submitted | confirmed | failed}
preparing|submitted -> failed-retryable (quote expired, relayer down, selftest fail) -> due
                    -> failed-terminal (revert with funds unmoved, rejected by user, maturity/health 'sunset')
```
Pipeline run:
```
draft -> validated(planHash) -> confirmed -> running <-> paused(reason) -> completed
running|paused -> aborting -> aborted(holdings listed) ; running -> partial (some lineages terminal-failed, others done)
```
`reducePipeline(run, ev)` and `reduceStep(inst, ev)` are total and reject illegal transitions (`E_ILLEGAL_TRANSITION`), same pattern as hops `reduce`.

### 6.3 Rules

- EX-1 Persist before sign: `signing` with `intentKey` (nonce / precommitment index / leg index) is saved before `SignPort` is called (HOP-REQ-8 pattern, generalised).
- EX-2 No presign: no persisted field matches `sig|signature|rawTx|privateKey|secret|seed|note.secret` (HOP-REQ-7, AB-T2); serialisation test.
- EX-3 Idempotency: `instanceId = sha256(pipelineId || lineagePath || stepIndex)`; `intentKey` derived deterministically from it plus method index; on resume, every `signing|submitted` instance calls `reconcile()` before anything else; `submit` is never called twice for one `intentKey` unless `reconcile()` returned `not-started`.
- EX-4 Reconcile privacy: `reconcile()` uses purpose `read-address` with `verification` layer (address-free, or decoys HY-VER-4); if only a direct read is possible, a checkpoint asks first (`directReadsRevealAddress`).
- EX-5 Resume: on unlock, run L-1 self-tests, then reconcile, then recompute due steps. A step overdue by > 1 h is shown overdue (HOP-UX-4); realised delays are recorded, not re-drawn.
- EX-6 Abort: allowed in any state except `signing`/`submitted` (wait for reconcile). Abort never moves funds; it lists each lineage's current holding and its `emergencyExits()` with their leak keys (e.g. ragequit re-links, SP N7 / EP N5). User picks; nothing automatic.
- EX-7 Partial failure: lineages are independent; no on-chain rollback exists. A failed lineage stops at its holding; siblings continue unless the user pauses. Payer parts follow AB-S8 (never pay more than `grossTotal`, offer resume/cancel of remainder).
- EX-8 Re-quote: each step quotes at its due time (HOP-RLY-1). If fee exceeds planned by > `requoteToleranceBps` (default 50) or parties change, a checkpoint re-confirms with a new plan hash.
- EX-9 Health: before each `pool.*` step, `health()`; `sunset|unknown` pauses and offers emergency exits (EP lifecycle).
- EX-10 Concurrency: one active step per lineage; at most one signing prompt at a time per run; `sameBlockGate` respected for sweeps (HY-CON-3).

### 6.4 Confirmation checkpoints

| Checkpoint | When | Shows |
|---|---|---|
| CP-1 plan | before `confirmed` | full summary (6.6), all required acks (never auto-given, PP-13), plan hash |
| CP-2 first public step | before first on-chain step | "this step is public and irreversible" + its leaks |
| CP-3 signature | every `SignPort` call | method's own review (`assertPreviewMatchesCalldata`, `decodeAndCheckPayload`); `autoContinue` only for seller steps in an unlocked session if the method allows it (HOP 4.4) |
| CP-4 drift | EX-8, EX-9, layer self-test fail | delta vs plan |
| CP-5 reveal | EX-4 direct read; any emergency exit | leak keys |

Confirmation is bound to `planHash = sha256(canonical(pipeline, layers, quotesRounded))`; any change invalidates it.

### 6.5 Dry-run / simulate

`simulate(plan, quotes?)`: pure; uses supplied quotes or the step's static fee model (router 25 bps; hop `max(gas*1.10, 50 bps)` cap 300 bps; pool relayer fee <= `MAX_RELAYER_FEE_BPS`; sponsor quote; gas estimates). Returns the 6.6 summary and the expanded lineage tree. Never signs, never calls `submit`. `simulateWithDrivers()` (tests, anvil) runs `quote` + `prepare` only.

### 6.6 Summary (per pipeline)

```ts
export interface PipelineSummary {
  readonly cost: { perStep: { instanceId: string; feeBps: number; gasWeiMax: bigint }[]; totalFeeBpsMax: number; singleStepBaselineBps: number };
  readonly latency: { minMs: number; maxMs: number; creditedDwellMs: number; appOpenRequired: boolean; signaturePrompts: number };
  readonly trust: readonly TrustParty[];           // union over steps + layers, sorted
  readonly strength: readonly StrengthClass[];     // set; 'crowd-dependent-unlinking' at most once
  readonly reveals: readonly LeakKey[];            // union of doesNotHide + emergent E-* (7.2)
  readonly issues: readonly Issue[];               // profile + chain rule issues
  readonly requiredAcks: readonly AckKey[];
}
```
No score field exists. `creditedDwellMs` counts only `pool.dwell` (HOP-POOL-2). `singleStepBaselineBps` is the plain hygiene sweep cost, shown next to the total (HOP-UX-2 generalised).

## 7. Combined leakage analysis

### 7.1 Per pipeline (what still reveals)

| Pipeline | Payer sees | Public chain | Parties | Honest claim (max) |
|---|---|---|---|---|
| Standard: `pay.submit` / `recv -> hygiene.sweep` | `S1 -> D` | payer -> `S1` -> `D`; amount, time | rpc, sweep relayer | address hygiene; no unlinking |
| Enhanced: `amount.shape{round\|delay}` (+ PH-1) / `recv -> sweep.delay -> hygiene.sweep`; Tor layer | `S1 -> D` | same; amounts bucketed; fan-out if split | + tor network/exit | friction only; IP hidden from rpc/relayer, content not |
| Seller pool: `recv -> pool.deposit{denom} -> dwell -> pool.exit{D_i}` | `S1 -> pool` deposit | deposit public; exits from pool; amount/timing matchable | pool relayer, ASP/PPOI, own/third-party unaudited code | `S1 -> D_i` hidden only within the pool's crowd; testnet: effectively none |
| + hops before pool | every hop and the deposit | 1-in/1-out chain into pool | + sweep relayer(s) | same as without hops (credit 0) |
| Payer pool: `src -> fresh-wallet -> pool.deposit -> dwell -> pay.from-pool` | — | fresh wallet -> pool; pool -> `S1`; seller sees pool as caller | pool relayer, own unaudited contracts, dev ceremony | payer -> `S1` hidden within crowd; deposit and token funding of the fresh wallet public |
| Confidential: `ct.wrap -> pay.submit{ct}` / `recv -> ct.sweep` | amount (decryptor), edges | edges, token, time, wrap amount | FHE/TEE operator, decrypt relayer | amount hidden between wrap and unwrap; who/when public |
| BTC: `btc.recv{sp}` then later `btc.payjoin-contribute` | SP address property in tx 1; tx 2 linked by its payer | tx 2 breaks common-input heuristic only | payjoin directory + relay | no unlinking; heuristic weakening in tx 2 |

### 7.2 Emergent leaks (added by composition; keys `privacy.warn.chain.*`)

- E-1 **Amount continuity**: `A_out = A_in - sum(fees)` across steps; fees are quoted and public, so the ladder identifies the origin (HOP 4.3, SP N3). Shown as an amount ladder.
- E-2 **Timing chain**: step k+1 follows step k by drawn delays from one client; with `direct` transport one party seeing two steps correlates by IP/time (HOP N6, NP "timing correlation").
- E-3 **Combination fingerprint**: a rare pipeline shape (e.g. PH-1 + pool + hops) is itself a label; the more unusual the chain, the smaller the set of users with that shape [new]. Presets exist partly to keep shapes common.
- E-4 **Same party, many steps**: one relayer/sponsor/pool relayer used by several steps sees all of them (HOP N5, R-32).
- E-5 **Trust union**: every party of every step is trusted for its leak; chaining never removes a party.
- E-6 **Stranded holdings**: a long run has intermediate holdings whose emergency exits re-link (ragequit, direct sweep).
- E-7 **App-open time**: total wait is the sum; closing the app stretches delays and changes the timing distribution (HOP 4.4, AB 2(6)).

### 7.3 Claim rules

- CL-1 Summary text is assembled only from catalogue `specCopyKeys` and `privacy.warn.*` keys; the package emits no prose.
- CL-2 Strength classes are a set, never counted or ranked; two pools do not produce "stronger".
- CL-3 Any pipeline containing a pool step shows SP N1 / EP N2 crowd text and, on testnet, the fixed testnet line (SP 6.5).
- CL-4 Banned words per PP-9 / HOP-UX-3 apply to every key and id in both packages.

## 8. Presets

Pipeline templates are derived from the profile presets (profiles 9) so both stay consistent: `templateFor(preset, role, ctx) = selectionToPipeline(applyPreset(preset, ctx).selection, role)`. Downgrades from `applyPreset` remove steps (e.g. no pool manifest -> no pool steps).

| Preset | Payer template | Seller template | Layers |
|---|---|---|---|
| `standard` | `src.wallet -> pay.submit{direct, router}` | `recv.stealth -> hygiene.sweep{self-derived, address-free}` | direct |
| `enhanced` | `src.wallet -> [payer.fresh-wallet] -> amount.shape{round\|delay} -> pay.submit` | `recv -> sweep.delay{jitter} -> hygiene.sweep` | tor-browser/onion if self-test ok; quorum rpc; indexer-tor scan |
| `maximum` | `src.wallet -> [payer.fresh-wallet] -> amount.shape{denom} -> pool.deposit{shielded-pool} -> pool.dwell -> pay.from-pool`; fallback `-> pay.submit{eip7702-sponsored\|erc4337\|permit-relay}` | `recv -> pool.deposit{privacy-pools\|railgun\|shielded-pool, denominations} -> pool.dwell -> pool.exit{fresh D_i, relayer}` | tor/ohttp per profile; pir2/indexer-tor scan |
| `confidential-amount` | `src.wallet -> ct.wrap{early, non-exact} -> pay.submit{ct, direct}` | `recv{confidential} -> ct.sweep` | tor if available |
| `custom` | user-built; validated live | user-built | user |

Preset policy (inherits PP-12): no preset template contains `hops.forward`, `ct.unwrap`, PayJoin, or a second pool; `maximum` seller never adds `hygiene.sweep` after exit (type T-3).

## 9. Package spec: `packages/privacy-pipeline` (`@ghostpay/privacy-pipeline`)

```
packages/privacy-pipeline/
  package.json      private, UNLICENSED, type module, sideEffects false; scripts/devDeps copied from packages/relayer-guard [R]
                    dependencies: "@ghostpay/privacy-profiles": "workspace" (only one)
  tsconfig.json tsconfig.build.json vitest.config.ts (thresholds 95/90/95/95)  README.md DEVIATIONS.md
  src/index.ts
  src/types.ts        Holding, Pipeline, Step, StepInstance, Lineage, PipelineRun, PipelineSummary, Checkpoint
  src/build.ts        builder helpers: addStep, removeStep, moveStep (return new Pipeline + validation)
  src/plan.ts         expand(pipeline, quotes?) -> lineage tree; planHash
  src/validate.ts     typeCheck (T-1..T-4), applyChainRules (CHAIN_RULES), projectToSelection + evaluate, merge issues
  src/summary.ts      summarize, simulate
  src/presets.ts      templateFor, selectionToPipeline
  src/machine.ts      reduceStep, reducePipeline (pure)
  src/executor.ts     createExecutor(ports): start, resume, abort, pause, onEvent (async; only via ports)
  src/ports.ts        StepDriver, PipelineStore, Confirmer, Clock, CapabilityProbe, SignPort
  src/serialize.ts    serializeRun / sanitizeRun (versioned v:1; field-by-field drop like sanitizeSelection)
  src/testutil/fakeDrivers.ts   deterministic in-memory drivers with crash injection
  src/*.test.ts  src/properties.test.ts  src/specrefs.test.ts
```

Profile-side additions (lane A, same owner as `privacy-profiles`): `src/steps.ts` (`STEP_CATALOGUE`), `src/chainRules.ts` (`CHAIN_RULES`, `chainMatrix`), keys in `src/keys.ts`, `scripts/gen-matrix.mjs --chain`.

Public API:
```ts
export function validate(p: Pipeline, ctx: Context): PipelineValidation;   // { ok, blocking, warnings, requiredAcks, typeErrors, selection }
export function expand(p: Pipeline, quotes?: QuoteMap): PlanTree;
export function simulate(p: Pipeline, ctx: Context, quotes?: QuoteMap): PipelineSummary;
export function planHash(p: Pipeline, quotes?: QuoteMap): Hex;
export function templateFor(preset: PresetId, role: Role, ctx: Context): { pipeline: Pipeline; downgrades: readonly Downgrade[] };
export function reduceStep(i: StepInstance, ev: StepEvent): StepInstance;
export function reducePipeline(r: PipelineRun, ev: RunEvent): PipelineRun;
export function createExecutor(ports: ExecutorPorts): Executor;            // start(run, ackedSelection), resume(id), pause, abort(id) -> AbortReport
export function serializeRun(r: PipelineRun): string; export function sanitizeRun(raw: unknown): PipelineRun | null;
```

Requirements:
- PL-1 (MUST) No I/O in `src/**` except through ports; no `fetch`, `node:*`, `Date`, `Math.random`, crypto imports (grep test, as PP-1). Hashing via injected `hash` port or `@noble/hashes` already pinned (decide in build; record in DEVIATIONS).
- PL-2 (MUST) `validate`, `expand`, `simulate`, reducers are total and deterministic (fast-check, arbitrary `unknown` for `sanitizeRun`).
- PL-3 (MUST) A pipeline with any type error or any `impossible` chain rule or any profile `E_*` is never `ok`, and the executor refuses to start it.
- PL-4 (MUST) Acks are never added by the package (PP-13); `start` requires the ack set to cover `requiredAcks`.
- PL-5 (MUST) EX-1..EX-10 each have a test; crash injection at every transition yields exactly one `submit` per `intentKey`.
- PL-6 (MUST) No serialized run contains a secret/signature field (EX-2); size < 64 KiB for 16 lineages.
- PL-7 (MUST) For every `ChainRuleDef` with `profileRule`, the chain rule and the projected profile rule agree in effect or the chain rule is stricter (table test).
- PL-8 (MUST) `summary.creditedDwellMs` equals the sum of `pool.dwell` only; `strength` has no duplicates; no numeric privacy field exists in any exported type (type-level test).
- PL-9 (MUST) Layer self-test runs at start and resume; a failing non-direct purpose pauses, never downgrades (L-1).
- PL-10 (MUST) Every `CHAIN_RULES` id has a positive and negative test; every `specRef` id exists in the cited file (`specrefs.test.ts`).
- PL-11 (MUST) Every preset template validates `ok` (modulo acks) for every ctx in the PP-10 generated set.
- PL-12 (SHOULD) `validate` < 2 ms median for 12-step pipelines (bench, informational).

## 10. Test plan

1. Unit: step catalogue shape; T-1..T-4; each C-01..C-35 positive/negative; projection examples (3.5 chain projects to a Selection that `evaluate()` accepts); summary math against hops `previewCost` floors (0.50/0.99/1.49/1.98 %).
2. Property (fast-check) on ordering:
   - P-1 Soundness: for random step sequences, `validate.ok` implies every adjacent pair type-checks and no `impossible` pattern matches.
   - P-2 Terminality: no accepted pipeline has a step after `pool.exit`, `hygiene.sweep`, `ct.sweep`, `pay.*` on the same lineage.
   - P-3 Exclusivity: no accepted BTC pipeline has SP and PayJoin in one tx; no accepted EVM pipeline mixes CT with pool/hops/sponsor/no-fee route.
   - P-4 Insertion monotonicity: inserting any step into an invalid pipeline never makes it valid unless the insertion fixes a type gap (checked by oracle); inserting a `redundant`/`harmful` step never removes a blocking issue and never removes a warning.
   - P-5 Summary monotonicity: adding a step never lowers `totalFeeBpsMax`, `latency.maxMs`, or the `trust`/`reveals` sets.
   - P-6 Crowd non-addition: adding a second pool or hops never changes `strength` or `creditedDwellMs` except by the new pool's dwell (and C-07 blocks re-pool).
   - P-7 Profile consistency: `validate.ok` implies `evaluate(projectToSelection(p)).blocking ⊆ {E_ACK_MISSING}`.
   - P-8 Permutation: for any multiset of steps, at most the orders allowed by the compact matrix validate (oracle = matrix).
   - P-9 Reducer closure and crash/resume idempotency with `fakeDrivers` under random event interleavings.
3. Snapshot: `chainMatrix()` equals section 4 compact table; four preset templates for the profile 12.5 contexts.
4. Honesty: banned-word grep (PP-9); no score field (PL-8); every pipeline with a pool emits crowd keys (CL-3).
5. Integration (after wave 3, anvil): the 3.5 chain with mock pool (EP-M) under `test-mode`, and `maximum` seller with SP on anvil; crash injected between deposit and exit; resume completes; hops follower test (AT-HOP-NEG-1) still recovers `D` when hops precede `hygiene.sweep`.
6. Mutation (manual, DEVIATIONS): delete C-03, C-13, C-23; remove EX-1; each must fail a test.

## 11. Acceptance criteria

1. `npm test --workspace @ghostpay/privacy-pipeline` and `@ghostpay/privacy-profiles` green; coverage 95/90/95/95; typecheck, lint green.
2. PL-1..PL-11 tests exist and pass; PL-12 reported.
3. Section 4 compact table equals `node scripts/gen-matrix.mjs --chain` output.
4. Every `[new]` rule (C-04, C-06, C-07, C-14, C-17 FEE-2 part, C-34, L-2, E-3, isolation default, R-17 refinement) listed in `DEVIATIONS.md`.
5. Integration item 5 passes on anvil, or is recorded as skipped.
6. Not done and recorded: UI wiring (lane E6), drivers in `apps/web`, public-testnet runs.

## 12. UI wiring plan (lane E6, minimal; after packages exist)

| File | Change |
|---|---|
| `apps/web/package.json` | dependency `@ghostpay/privacy-pipeline` |
| `apps/web/src/lib/pipelineDrivers.ts` (new) | `StepDriver` per kind wired to method packages and existing `payExec.ts`, `sweep.ts`, `relayerClient.ts` |
| `apps/web/src/lib/pipelineStore.ts` (new) | `PipelineStore` over `idbStore.ts`, sealed with the keystore key (same store as hygiene ledger / HopPlan; included in keystore export) |
| `apps/web/src/lib/settings.ts` | none beyond the profile `privacy` field; templates derive from it |
| `apps/web/src/views/Pipeline.tsx` (new) | step list (add/remove/reorder with live `validate`), summary (6.6), checkpoints, run status per lineage, abort with emergency exits |
| `apps/web/src/views/Pay.tsx`, `Sweep.tsx` | "Run as pipeline" entry using the preset template; resume banner for paused runs |
| `apps/web/src/App.tsx` | route to `Pipeline` |
| `apps/web/src/lib/jitter.ts` | reused by the app scheduler that fires `due` events (no change) |

Copy for every key lives in `apps/web` (profiles 11). No new view strings outside keys.

## 13. Effort

M overall, about 8-11 engineer-days: rule and step data in `privacy-profiles` S (2 d); planner/validator/summary S-M (3 d); executor + crash tests M (3-4 d); property tests and matrix generator S (1-2 d). UI wiring (E6) separate, about 4-5 d. Depends on `privacy-profiles` (wave 1); drivers depend on method packages (waves 2-3), so the package builds in wave 2 against `fakeDrivers`.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Users read long pipelines as stronger | CL-1..CL-4; strength as set; credited dwell only; baseline cost shown; E-3 fingerprint warning |
| Funds stranded mid-chain (app closed, relayer gone, pool sunset) | persist-before-sign, reconcile, overdue notices, emergency exits listed with their leaks; every holding key re-derivable from seed (hygiene/hops/SP recovery) |
| Rule drift between `CHAIN_RULES`, profile `RULES`, method specs | PL-7, PL-10 spec cross-check; generated matrix |
| `[new]` rules over/under-block | DEVIATIONS review; unknown combos fail closed |
| Executor duplicates method state machines and they diverge | executor stores references only; method `reduce`/vaults authoritative; `reconcile()` reads method state first |
| Reconcile reads leak addresses to RPC | EX-4 address-free / decoys, checkpoint before direct read |
| Combination explosion in UI | presets first; custom builder shows only steps whose `accepts` match the current tail holding |

## 15. Open questions

- Q1 Should `ct.unwrap -> pool.deposit` be allowed as `harmful` instead of `impossible` (R-11)? Spec: impossible until a spec covers it.
- Q2 Re-pool across pools (C-07): spec later or keep blocked?
- Q3 Payer-side sponsored pool deposit (PH-3 7702 / SP `depositWithPermit` sponsor) as a `pool.deposit` param: needs PH Q1/Q2 spike results.
- Q4 Per-step transport isolation default (`per-step`) vs Tor Browser, which the page cannot control (NP-B-4): show as unenforced in `tor-browser`?
- Q5 Seller auto-selection of the pipeline per received payment (by origin/asset) vs one stored seller template plus re-validation.

## 16. Sources

All [R], read 2026-10-21: `docs/remote/privacy-specs/{README,hygiene,payer-hiding,amount-blurring,network-privacy,shielded-pool,external-pools,confidential-tokens,btc-payjoin,hops,metadata-hardening,profiles}.md`; `apps/web/src/{views,lib}` file listing; `packages/relayer-guard/package.json`.
