# Spec: Privacy option catalogue and profiles (`@ghostpay/privacy-profiles`)

Status: **spec, not built**. Date 2026-10-21. Branch `claude/remote-extensions-1`. Scope: testnet-only PoC (anvil `31337`, Sepolia `11155111`, Base Sepolia `84532`; BTC `testnet|signet|regtest`). Effort: **S-M**.

Legal: deferred by the owner (ADR-0006; `../anonymization-research.md` section 12). Noted once. Not a blocker. This package adds no network, custody or fee.

Evidence tags: [R] read in repo this run (the sibling specs in this directory and `apps/web/src/lib/settings.ts`, `packages/relayer-guard/*`). No external standard is needed for this package; the MUST/SHOULD keywords follow RFC 2119 / RFC 8174 **[U: rfc-editor.org unreachable from the sandbox, 2026-10-21]**. Every option, value, requirement and conflict below is taken from a sibling spec and cites its id; where this spec adds a rule that no sibling spec states, it is marked **[new]**.

## 1. Goal

One pure-TypeScript package that the web app (later, no UI edits here) and CLIs call to:

1. enumerate every privacy option from the ten method specs as typed data (`OPTION_CATALOGUE`);
2. apply a user-selectable **preset** (`standard`, `enhanced`, `maximum`, `confidential-amount`) or per-option toggles;
3. check a selection against the **environment** (chain, web vs node, available services, test-mode) and the **conflict rules**, returning errors, warnings, required acknowledgements and downgrades;
4. report, per selection, which parties are trusted and which leaks remain, as **text keys**, never UI copy.

Non-goals: executing any method; UI strings; storage; network self-tests (it consumes their results as capabilities); any numeric anonymity score (EP-UX-3, SP-UI, AB-HON rule).

## 2. Threat addressed and what it does NOT protect

Addressed: **misconfiguration and over-claiming**. Users combining options that silently cancel (e.g. hops before a pool, CT payment then pool exit via public unwrap), options that need a service the user does not have (relayer, Tor, sponsor), and UI that claims more than the method spec allows.

Does NOT protect:
- Nothing on-chain or on the network. A valid selection is not a private one; each value carries its spec's "does NOT protect" keys.
- It cannot verify capabilities. `tor-browser`, manifest entries, relayer features, self-test results are **inputs** asserted by the caller (NP-B-4: Tor Browser is a user assertion).
- It cannot stop a forked client from ignoring its verdicts.

## 3. User-visible option (for the later web edit; spec only)

Settings -> "Privacy": preset radio (`standard` default, `enhanced`, `maximum`, `confidential-amount`, `custom`), then the grouped option list from `OPTION_GROUPS`, each value showing its strength class, trust parties, required capabilities and warning keys. Changing any option switches the preset label to `custom`. Pay, Sweep, Create-invoice and Scan views call `evaluate()` with their action and render issues by key. Stored as one settings field `privacy: SerializedSelection` (lane E6 in [README.md](README.md)).

## 4. Architecture

```
caller (apps/web, CLI)          @ghostpay/privacy-profiles (pure, sync, no I/O)
  ctx: chain, env, caps  ───►  catalogue.ts   OPTION_CATALOGUE (data)
  selection (stored)     ───►  rules.ts       RULES (data, predicate DSL)
                               presets.ts     PRESETS (ordered preference lists)
                               resolve.ts     applyPreset(): greedy, deterministic
                               evaluate.ts    evaluate(): issues, acks, trust, leaks
                               matrix.ts      compatibilityMatrix(): generated from RULES
                               serialize.ts   serialize/sanitize, versioned
                               keys.ts        WARNING_KEYS, ACK_KEYS, ISSUE codes
```

Rules and catalogue are **data**, so tests can enumerate them, the matrix in section 8 is generated (not hand-maintained), and adding a method means adding rows, not code.

## 5. Package and directory ownership

New (lane A; nothing else writes here):

```
packages/privacy-profiles/
  package.json          name @ghostpay/privacy-profiles, private, UNLICENSED, type module, sideEffects false
                        scripts/devDeps copied from packages/relayer-guard/package.json [R]; NO runtime dependencies
  tsconfig.json tsconfig.build.json vitest.config.ts   copied from packages/relayer-guard [R] (thresholds 95/90/95/95)
  README.md DEVIATIONS.md
  src/index.ts
  src/types.ts          OptionId, values, Capability, TrustParty, LeakKey, Issue, Selection, Context
  src/catalogue.ts      OPTION_CATALOGUE, OPTION_GROUPS
  src/rules.ts          RULES
  src/presets.ts        PRESETS
  src/resolve.ts        applyPreset, setOption
  src/evaluate.ts       evaluate, explain
  src/matrix.ts         compatibilityMatrix
  src/serialize.ts      serializeSelection, sanitizeSelection
  src/keys.ts           WARNING_KEYS, ACK_KEYS, ERROR_KEYS
  src/*.test.ts         unit
  src/properties.test.ts   fast-check
  src/specrefs.test.ts  reads ../../docs/remote/privacy-specs/*.md (node:fs, test only)
  scripts/gen-matrix.mjs   prints section-8 matrix as Markdown to stdout (docs owner pastes; no auto-write into docs)
```

Edits to existing code: **none** in this lane. Later (lane E6): `apps/web/package.json` dependency; `apps/web/src/lib/settings.ts` adds `privacy` field via `sanitizeSelection`; views call `evaluate`. Lane E7: root `build:libs` order is unaffected (no workspace deps).

## 6. Interfaces

### 6.1 Types

```ts
export type Chain = 31337 | 11155111 | 84532;
export const TESTNET_CHAIN_IDS: readonly Chain[] = [31337, 11155111, 84532];
export type BtcNetwork = 'testnet' | 'signet' | 'regtest';
export type Env = 'web' | 'web-onion' | 'node';
export type Action = 'settings' | 'create-invoice' | 'pay' | 'scan' | 'sweep' | 'btc-receive' | 'btc-send';
export type AssetKind = 'erc20-permit' | 'erc20' | 'native' | 'confidential' | 'btc';
export type Scope = 'payer' | 'seller' | 'both' | 'relayer-operator' | 'deployment' | 'build';
export type Maturity = 'existing' | 'poc' | 'spike-gated' | 'experimental' | 'test-only' | 'stub' | 'watch';
export type StrengthClass =             // what kind of effect, never "how anonymous"
  | 'baseline' | 'hygiene' | 'friction' | 'weak' | 'network-origin'
  | 'integrity-only' | 'amount-confidential' | 'tx-structure' | 'crowd-dependent-unlinking';

export type Capability =
  | 'sweep-relayer' | 'multi-relayer' | 'payer-sponsor' | 'eip7702' | 'erc4337-entrypoint' | 'erc4337-paymaster'
  | 'manifest:shielded-pool' | 'pool-relayer' | 'pool-note' | 'asp-publisher'
  | 'manifest:privacy-pools' | 'pp-relayer' | 'manifest:railgun' | 'railgun-broadcaster'
  | 'manifest:confidential-ct1' | 'manifest:confidential-ct2' | 'manifest:confidential-ct3' | 'seller-accepts-ct'
  | 'tor-browser-asserted' | 'tor-socks' | 'onion-origin' | 'onion-rpc' | 'onion-relayer' | 'i2p-proxy'
  | 'nym-build' | 'nym-socks5' | 'ohttp-gateway-rpc' | 'ohttp-gateway-relayer'
  | 'multi-rpc' | 'own-node' | 'light-client' | 'tor-indexer' | 'pir-servers'
  | 'payjoin-directory' | 'payjoin-ffi' | 'payjoin-v1-endpoint'
  | 'selftest-ok:rpc' | 'selftest-ok:relayer'
  | 'test-mode';                        // enables mock-pool, ctm-cleartext; never set in a production build

export type TrustParty =
  | 'rpc' | 'sweep-relayer' | 'payer-sponsor' | 'bundler' | 'paymaster'
  | 'pool-relayer' | 'asp-publisher' | 'own-circuits-dev-ceremony' | 'own-unaudited-contracts'
  | 'privacy-pools-operator' | 'privacy-pools-asp' | 'railgun-ppoi' | 'railgun-broadcaster' | 'third-party-unaudited-code'
  | 'zama-kms-coprocessors' | 'zama-decrypt-relayer' | 'fhenix-network' | 'inco-tee'
  | 'tor-network' | 'tor-exit' | 'i2p-outproxy' | 'nym-mixnet' | 'ohttp-relay' | 'ohttp-gateway'
  | 'pir-server-pair' | 'indexer' | 'light-client-checkpoint'
  | 'payjoin-directory' | 'payjoin-ohttp-relay' | 'private-submission-endpoint';

export type LeakKey = string;           // spec-scoped id, e.g. 'hygiene:L4', 'shielded-pool:N1', 'privacy-ops:PA3'
export type WarningKey = `privacy.warn.${string}`;
export type AckKey = `privacy.ack.${string}`;
export type ErrorKey = `privacy.err.${string}`;
```

### 6.2 Catalogue

```ts
export interface ValueDef {
  readonly value: string;
  readonly specRef: { readonly file: string; readonly ids: readonly string[] };  // e.g. { file: 'hops.md', ids: ['HOP-N'] }
  readonly maturity: Maturity;
  readonly strength: StrengthClass;
  readonly requires: readonly Capability[];        // all needed
  readonly requiresAny?: readonly Capability[];    // at least one
  readonly env?: readonly Env[];                   // omitted = any
  readonly chains?: readonly Chain[];              // omitted = all testnets
  readonly assets?: readonly AssetKind[];          // omitted = any (evaluated only when ctx.asset set)
  readonly trust: readonly TrustParty[];
  readonly hides: readonly LeakKey[];
  readonly doesNotHide: readonly LeakKey[];
  readonly warnings: readonly WarningKey[];
  readonly acks: readonly AckKey[];
  readonly specCopyKeys: readonly string[];        // method package's own copy constants, e.g. 'AB_NOT_ANONYMOUS'
  readonly buildPackage: string | null;            // owner dir; null = existing behaviour
}
export interface OptionDef {
  readonly id: OptionId;
  readonly group: GroupId;
  readonly scope: Scope;
  readonly actions: readonly Action[];             // where evaluate() considers it
  readonly userSelectable: boolean;                // false for operator/deployment/build scope (shown as info)
  readonly defaultValue: string;                   // MUST equal today's behaviour or the spec's stated default
  readonly values: readonly ValueDef[];
}
export const OPTION_CATALOGUE: Readonly<Record<OptionId, OptionDef>>;
export const OPTION_GROUPS: readonly { id: GroupId; options: readonly OptionId[] }[];
```

### 6.3 Selection, context, results

```ts
export interface Selection {
  readonly preset: PresetId | 'custom';
  readonly values: Readonly<Partial<Record<OptionId, string>>>;  // missing = defaultValue
  readonly acks: readonly AckKey[];
}
export interface Context {
  readonly action: Action;
  readonly chainId: number | null;          // EVM action chain; any value outside TESTNET_CHAIN_IDS -> E_WRONG_CHAIN for non-default values
  readonly btcNetwork?: string | null;
  readonly env: Env;
  readonly asset?: AssetKind;
  readonly capabilities: ReadonlySet<Capability>;
}
export type IssueCode =
  | 'E_CONFLICT' | 'E_REQUIRES' | 'E_CAPABILITY' | 'E_WRONG_CHAIN' | 'E_WRONG_ENV' | 'E_WRONG_ASSET'
  | 'E_NOT_SELECTABLE' | 'E_UNKNOWN_VALUE' | 'E_MATURITY' | 'E_ACK_MISSING' | 'E_SELFTEST'
  | 'W_RULE' | 'W_VALUE' | 'W_MOOT';
export interface Issue {
  readonly code: IssueCode;
  readonly key: WarningKey | ErrorKey | AckKey;
  readonly options: readonly OptionId[];
  readonly ruleId?: RuleId;
  readonly specRef?: { file: string; ids: readonly string[] };
}
export interface Evaluation {
  readonly ok: boolean;                     // no E_* issues
  readonly blocking: readonly Issue[];      // E_*
  readonly warnings: readonly Issue[];      // W_*
  readonly requiredAcks: readonly AckKey[]; // all acks the selection needs (given or not)
  readonly effective: Readonly<Record<OptionId, string>>;   // fully expanded (defaults filled)
  readonly trust: readonly TrustParty[];    // union, sorted, deduplicated
  readonly hides: readonly LeakKey[];
  readonly doesNotHide: readonly LeakKey[]; // union; never empty for any non-baseline value
  readonly strength: readonly StrengthClass[];
  readonly specCopyKeys: readonly string[];
}
export interface Downgrade { readonly option: OptionId; readonly wanted: string; readonly got: string; readonly reason: IssueCode; readonly key: string }
export interface PresetResult { readonly selection: Selection; readonly evaluation: Evaluation; readonly downgrades: readonly Downgrade[] }
```

### 6.4 Functions (all pure, synchronous, total: never throw on any input except programmer misuse of `OptionId` type at compile time)

```ts
export function defaultSelection(): Selection;
export function applyPreset(id: PresetId, ctx: Context): PresetResult;
export function setOption(sel: Selection, id: OptionId, value: string, ctx: Context): { selection: Selection; evaluation: Evaluation };
export function acknowledge(sel: Selection, ack: AckKey): Selection;
export function evaluate(sel: Selection, ctx: Context): Evaluation;
export function explain(sel: Selection, ctx: Context): readonly { option: OptionId; value: string; def: ValueDef }[];
export function compatibilityMatrix(opts?: { options?: readonly OptionId[] }): readonly MatrixCell[];
export interface MatrixCell { a: { option: OptionId; value: string }; b: { option: OptionId; value: string }; relation: 'ok' | 'conflict' | 'requires' | 'warn' | 'moot'; ruleIds: readonly RuleId[] }
export function serializeSelection(sel: Selection): string;      // JSON { v: 1, preset, values, acks }, keys sorted
export function sanitizeSelection(raw: unknown): Selection;      // unknown option/value/ack dropped field by field (same style as sanitizeSettings [R]); v != 1 -> defaultSelection()
export const PRESETS: Readonly<Record<PresetId, PresetDef>>;
export const RULES: readonly RuleDef[];
export const WARNING_KEYS: readonly WarningKey[]; export const ACK_KEYS: readonly AckKey[]; export const ERROR_KEYS: readonly ErrorKey[];
```

### 6.5 Rules DSL

```ts
export type Pred =
  | { opt: OptionId; in: readonly string[] }
  | { opt: OptionId; notIn: readonly string[] }
  | { cap: Capability } | { notCap: Capability }
  | { env: readonly Env[] } | { asset: readonly AssetKind[] } | { action: readonly Action[] }
  | { all: readonly Pred[] } | { any: readonly Pred[] } | { not: Pred };
export interface RuleDef {
  readonly id: RuleId;                       // 'R-01' ...
  readonly kind: 'conflict' | 'requires' | 'warn' | 'moot';
  readonly when: Pred;                       // conflict/warn/moot: fires when true; requires: `when` implies `then`
  readonly then?: Pred;                      // requires only
  readonly key: WarningKey | ErrorKey;
  readonly specRef: { file: string; ids: readonly string[] } | 'new';
}
```

## 7. Catalogue (normative content of `OPTION_CATALOGUE`)

`D` = default value. Caps = `requires` (all) unless "any". Every value also carries `privacy.warn.testnetOnly` and, if non-default, `privacy.warn.noAnonymity`.

### 7.1 Seller: sweep and exit (`group: 'sweep'`, actions `sweep`, `settings`)

| OptionId | Values (D first) | Spec ids | Maturity | Strength | Caps / env / asset | Trust | Warnings / acks | Build pkg |
|---|---|---|---|---|---|---|---|---|
| `sweep.destination` | `self-derived` D; `external-fresh`; `external-reuse` | HY-DST | poc | hygiene | — | — | `externalDestinationUnverified`; `external-reuse`: `destinationReuse`, ack `destinationReuse` | `packages/hygiene` |
| `sweep.verification` | `address-free` D; `direct` | HY-VER | poc | hygiene | — | rpc | `direct`: `directReadsRevealAddress` | `packages/hygiene` |
| `sweep.dust` | `on` D; `off` | HY-BUF dust | poc | hygiene | — | — | — | `packages/hygiene` |
| `sweep.knownWalletGuard` | `on` D; `off` | HY-FUND | poc | hygiene | — | — | `off`: `knownWalletGuardOff` | `packages/hygiene` |
| `sweep.delay` | `off` D; `jitter` | AB-DELAY (seller) | poc | friction | — | — | `tabMustStayOpen`, `timingNotHidden` | `packages/amount-blur` |
| `sweep.hops` | `0` D; `1`,`2`,`3`,`4` | HOP-0, HOP-N | poc | weak | `sweep-relayer` (unless `hopRelayers=direct`); asset `erc20-permit` | sweep-relayer | `hopsWeak`, `tabMustStayOpen`, `directReadsRevealAddress` (crash recovery); ack `hopsWeak` | `packages/hops` |
| `sweep.hopRelayers` | `rotate` D; `same`; `direct` | HOP 4.5, HOP-REQ-12 | poc | weak | `rotate`: warn if not `multi-relayer` | sweep-relayer | `singleRelayerSeesAllHops` (`same`, or `rotate` without `multi-relayer`); `direct`: `gasFundingLink` | `packages/hops` |
| `sweep.exit` | `plain` D (EP-0); `privacy-pools` (EP-1); `railgun` (EP-2); `shielded-pool` (SP-EXIT); `mock-pool` (EP-M); `tornado-fixed` (EP-3); `aztec` (EP-4) | EP-*, SP-EXIT | EP-1/EP-2 poc + spike-gated; SP-EXIT poc; EP-M test-only; EP-3 stub; EP-4 watch | crowd-dependent-unlinking (EP-M: baseline) | EP-1: `manifest:privacy-pools`; EP-2: `manifest:railgun`; SP: `manifest:shielded-pool`; EP-M: `test-mode`; asset not `confidential` | EP-1: privacy-pools-operator, privacy-pools-asp, third-party-unaudited-code; EP-2: railgun-ppoi, third-party-unaudited-code; SP: own-circuits-dev-ceremony, own-unaudited-contracts | all pools: `depositPublic`, `crowdTiny`, `ragequitRelinks`; EP: `thirdPartyUnaudited`; SP: `insecureCeremony`, `ownContractsUnaudited`; EP-M: `mockNoPrivacy`; acks `poolDisclosure` (EP N1-N6 / SP N1-N9), SP also `shieldedPoolTestnet` | `packages/external-pools*`, `packages/shielded-pool*` |
| `sweep.poolAsp` | `none` D; `publisher` | SP AspMode | poc | crowd-dependent-unlinking | `publisher`: `asp-publisher`; only with `exit=shielded-pool` | asp-publisher | `aspChoiceDisclosed` | `packages/shielded-pool` |
| `sweep.poolSubmit` | `relayer` D; `self` | SP Submitter; EP relayer/broadcaster/self-broadcast | poc | — | `relayer`: any of `pool-relayer`, `pp-relayer`, `railgun-broadcaster` matching exit | pool-relayer / railgun-broadcaster | `self`: `gasFundingLink` | pool packages |
| `sweep.poolAmountPlan` | `denominations` D; `whole` | SP-SDK-8, AB-DENOM | poc | friction | only with a pool exit | — | `whole`: `amountTimingMatch` | `packages/amount-blur` + pool SDK |
| `sweep.exitGas` | `permit-sponsored` D; `buffer`; `topup`; `eip7702` | SP DepositGas; EP 4 (a)/(b) | poc; `eip7702` spike-gated | — | `permit-sponsored`: asset `erc20-permit` + `pool-relayer`; `eip7702`: `eip7702` | per value | `topup`: `gasFundingLink`; `eip7702`: `persistent7702Delegate` | pool packages, `packages/payer-hiding` (7702 delegate) |

### 7.2 Payer (`group: 'pay'`, actions `pay`, `settings`)

| OptionId | Values (D first) | Spec ids | Maturity | Strength | Caps / env / asset | Trust | Warnings / acks | Build pkg |
|---|---|---|---|---|---|---|---|---|
| `pay.payerMode` | `direct` D; `fresh-wallet`; `permit-relay`; `eip7702-sponsored`; `erc4337-paymaster` | PH-0..PH-4 | PH-1 poc; PH-2 poc; PH-3/PH-4 spike-gated | hygiene (PH-1); friction (PH-2..4) | PH-2: `payer-sponsor`, asset `erc20-permit`; PH-3: `payer-sponsor`, `eip7702`; PH-4: `erc4337-entrypoint`, `erc4337-paymaster` | PH-2/3: payer-sponsor, own-unaudited-contracts; PH-4: bundler, paymaster, own-unaudited-contracts | all non-direct: `payerStillPublic`; PH-1: `tokenFundingLink`; PH-2..4: `sponsorSees`, `tokenFundingLink`; PH-3: `persistent7702Delegate`; ack `payerStillPublic` (PH-GEN-5) | `packages/payer-hiding*`, `apps/payer-sponsor` |
| `pay.source` | `wallet` D; `shielded-pool` (SP-PAY) | SP-PAY | poc | crowd-dependent-unlinking | `manifest:shielded-pool`, `pool-note`, `pool-relayer` | pool-relayer, own-circuits-dev-ceremony, own-unaudited-contracts | `crowdTiny`, `depositPublic`, `insecureCeremony`; ack `shieldedPoolTestnet` | `packages/shielded-pool` |
| `pay.amountBlur` | `off` D; `delay`; `round`; `split`; `denom` | AB-DELAY, AB-ROUND, AB-SPLIT, AB-DENOM | `delay` existing; others poc | friction | — | — | `delay`/`split`/`denom`: `tabMustStayOpen`; `round`: `roundUpCost`; `split`/`denom`: `fanOutLinkable` | `packages/amount-blur` |
| `pay.amountVisibility` | `public` D; `ct1-zama`; `ct2-fhenix`; `ct3-inco`; `ctm-cleartext` | CT-0..CT-3, CT-M | CT-1 poc + spike; CT-2/3 spike-gated; CT-M test-only | amount-confidential (CT-M: baseline) | CT-1: chain 11155111, `manifest:confidential-ct1`, `seller-accepts-ct`; CT-2: `manifest:confidential-ct2`; CT-3: chain 84532, `manifest:confidential-ct3`; CT-M: `test-mode`, chain 31337 | CT-1: zama-kms-coprocessors, zama-decrypt-relayer; CT-2: fhenix-network; CT-3: inco-tee | `wrapUnwrapPublic`, `fheOperatorTrust` / `teeTrust`, `decryptRelayerSees`, `zeroTransferAmbiguity`; CT-M: `mockNoPrivacy`; ack `ctTrust` | `packages/confidential-*` |
| `pay.bufferRounding` | `grid125` D; `sig2`; `off` | HY-BUF | poc | hygiene | asset `erc20` or `erc20-permit` (buffer path) | — | `off`: `bufferFingerprint` | `packages/hygiene` |
| `pay.route` | `router` D; `direct-no-fee` | MH-FEE-1 | poc | hygiene | — | — | `directNoFeeScanner` | edits E1 / E6 |
| `pay.amountNoise` | `off` D; `on` | MH-AMT-2 | poc | friction | — | — | `roundUpCost` | edit E6 |
| `pay.gasNormalise` | `off` D; `on` | MH-WAL-1 | poc | hygiene | — | — | — | edit E6 |

### 7.3 Seller: invoice, identity, announcement (`group: 'invoice'`, actions `create-invoice`, `scan`, `settings`)

| OptionId | Values (D first) | Spec ids | Strength | Warnings | Build |
|---|---|---|---|---|---|
| `invoice.encrypt` | `off` D (today `encrypt=false`); `on` | MH-INV-2 | hygiene | — | E6 |
| `invoice.padding` | `off` D; `on` | MH-INV-1 | hygiene | — | E3 |
| `invoice.coarseTime` | `off` D; `on` | MH-INV-3 | hygiene | — | E3, E6 |
| `invoice.quoteRounding` | `on` D (for `fiat_quote`); `off` | MH-AMT-1, AB-ROUND (creation) | friction | `roundUpCost` | E1, E6, `packages/amount-blur` |
| `identity.perInvoiceMeta` | `off` D; `on` | MH-ID-1 | hygiene | `perInvoiceSignerUnpinned` | E2, E3, E6 |
| `identity.perChainKeys` | `off` D; `on` | MH-ID-2 | hygiene | — | E2, E6 |
| `announce.metadata` | `standard` D; `minimal` | MH-ANN-3 | hygiene | — | E2, E1 |
| `announce.viewTag` | `keep` D; `mask` | MH-TAG-1, MH-TAG-2 | hygiene | `tagMaskInterop` | E2 |
| `announce.schemeId` | `1` D; `ghostpay` | MH-ANN-1, MH-ANN-2 (discouraged) | — | `schemeIdFingerprint` | E2 |

### 7.4 Network (`group: 'network'`, all actions)

| OptionId | Values (D first) | Spec ids | Maturity | Caps / env | Trust | Warnings |
|---|---|---|---|---|---|---|
| `net.rpcProfile`, `net.relayerProfile` | `direct` D; `tor-browser`; `tor-socks`; `onion`; `i2p-outproxy`; `nym-mixfetch`; `nym-socks5`; `ohttp` | NP profiles | `direct` existing; tor/onion poc; i2p secondary; nym experimental; ohttp poc | `tor-browser`: env web/web-onion + `tor-browser-asserted`; `tor-socks`: env node + `tor-socks`; `onion`: (env web-onion) or (env node + `tor-socks`), plus `onion-rpc` / `onion-relayer`; `i2p-outproxy`: env node + `i2p-proxy`; `nym-mixfetch`: env web + `nym-build`; `nym-socks5`: env node + `nym-socks5`; `ohttp`: `ohttp-gateway-rpc` / `ohttp-gateway-relayer` | tor-network (+ tor-exit unless onion); i2p-outproxy; nym-mixnet; ohttp-relay + ohttp-gateway | all non-direct: `contentNotHidden`, `timingNotHidden`, `walletRpcOutsideApp`; tor: `torExitSeesHost`; i2p: `outproxySeesDestination`; nym: `nymDestinationGroups`, `experimental`; ohttp: `ohttpNonCollusion`; non-direct without `selftest-ok:<role>`: E_SELFTEST (NP-T-5) |
| `net.rpcMode` | `single` D; `quorum`; `own-node`; `light-client` | NP Selector B, MH-NET-2/3 | poc | `quorum`: `multi-rpc`; `own-node`: `own-node`; `light-client`: `light-client` | `light-client`: light-client-checkpoint | `light-client`: `lightClientIntegrityOnly` |
| `net.endpointSeparation` | `off` D; `on` | MH-NET-1, PO-RPC-4 | poc | `multi-rpc` | rpc | — |
| `net.scanMode` | `range` D; `indexer-tor`; `pir2`; `light-client` | NP Selector C, MH-SCAN-1, MH-SCAN-3 | poc | `indexer-tor`: `tor-indexer`; `pir2`: `pir-servers`; `light-client`: `light-client` | indexer; pir-server-pair | `pir2`: `pirNonCollusion` |
| `net.scanAlign` | `off` D; `on` | MH-SCAN-2, NP-S-3 | poc | — | — | — |
| `relayer.multi` | `off` D; `on` | MH-REL-4 | poc | `multi-relayer` | sweep-relayer | — |
| `relayer.padding` | `off` D; `on` | MH-REL-3 (client half) | poc | `sweep-relayer` | — | — |

### 7.5 Bitcoin (`group: 'btc'`, actions `btc-receive`, `btc-send`; network guard `testnet|signet|regtest`)

| OptionId | Values (D first) | Spec ids | Caps | Trust | Warnings |
|---|---|---|---|---|---|
| `btc.mode` | `silent-payment` D; `plain`; `payjoin-v2`; `payjoin-v1` | BPJ modes, BIP-352 | v2: `payjoin-directory`, `payjoin-ffi` (until M4); v1: `payjoin-v1-endpoint` | v2: payjoin-directory, payjoin-ohttp-relay | payjoin: `payjoinNoSilentPayment`, `payjoinFallbackBroadcast`, `payjoinUtxoProbing`; v2: `payjoinDirectorySees` |
| `btc.contributeFromSp` | `off` D; `on` | BPJ-RCV-9 | only with payjoin | — | — |
| `btc.change` | `on` D; `off` | MH-BTC-1 | — | — | — |
| `btc.feeRateNormalise` | `off` D; `on` | MH-BTC-2 | — | — | `roundUpCost` |
| `btc.locktime` | `zero` D; `height` | MH-BTC-3 | — | — | — |
| `btc.rbf` | `on` D; `off` | MH-BTC-4 | — | — | — |
| `btc.ordering` | `caller` D (today); `bip69`; `shuffle` | MH-BTC-5 | — | — | — |
| `btc.psbtStrip` | `off` D; `on` | MH-BTC-6 | — | — | — |

### 7.6 Operator / deployment / build scope (`userSelectable: false`; read from capabilities, shown as info)

`MH-WAL-2`, `MH-REL-1` (trust `private-submission-endpoint`), `MH-REL-2`, `MH-REL-5`, NP relayer `upstream.transport`, `rateLimit.bucketBy` (PO-NET-5), `MH-FEE-2`, `MH-ANN-1`, hygiene Option B `GhostPaySweepRelayerV2`, `MH-WEB-1..3`, NP `VITE_NET_PROFILE`. Represented as `OptionDef` with `scope` in `relayer-operator|deployment|build`; `setOption` on them returns `E_NOT_SELECTABLE`.

## 8. Conflict and dependency rules (normative content of `RULES`)

| Rule | Kind | When | Then / effect | Key | Source |
|---|---|---|---|---|---|
| R-01 | conflict | any option non-default and `chainId` not in testnets (or `btcNetwork` not testnet/signet/regtest for btc options) | E_WRONG_CHAIN | `privacy.err.wrongChain` | PH-GEN-1, SP-GEN-1, EP-GEN-1, HOP-REQ-1, BPJ-GEN-1 |
| R-02 | conflict | value with `maturity` `stub` or `watch` | E_MATURITY (never selectable) | `privacy.err.notAvailable` | EP-3, EP-4, CT-4..6 |
| R-03 | conflict | value with `maturity` `test-only` and not `test-mode` | E_CAPABILITY | `privacy.err.testModeOnly` | EP-M, CT-M |
| R-04 | requires | `sweep.hops` != `0` | ack `hopsWeak` | `privacy.err.ackMissing.hopsWeak` | HOP-REQ-1 |
| R-05 | conflict | `sweep.hopRelayers=direct` and `sweep.hops` not in {0,1} | E_CONFLICT | `privacy.err.conflict.hopsDirectMulti` | HOP-REQ-12 |
| R-06 | requires | `sweep.hops` != `0` and `hopRelayers` != `direct` | cap `sweep-relayer` | `privacy.err.requires.sweepRelayer` | HOP 4.5 |
| R-07 | conflict | `sweep.hops` != `0` and asset not `erc20-permit` | E_WRONG_ASSET | `privacy.err.hopsNoPermit` | HOP 4.5 `NO_PERMIT` |
| R-08 | warn | `sweep.hops` != `0` and `sweep.exit` is a pool | W_MOOT | `privacy.warn.hopsBeforePoolNoGain` | HOP-POOL-1 |
| R-09 | conflict | `sweep.hops` > `2` and `sweep.exit` is a pool | E_CONFLICT | `privacy.err.conflict.hopsPoolMax2` | HOP-POOL-1 |
| R-10 | conflict | `sweep.exit` pool and `sweep.destination=external-reuse` | E_CONFLICT | `privacy.err.conflict.poolReuseDestination` | SP-SDK-7, hygiene HY-CON |
| R-11 | conflict | asset `confidential` and (`sweep.exit` != `plain` or `sweep.hops` != `0`) | E_CONFLICT (unwrap is public; sweep relayer is ERC-20 permit only) | `privacy.err.conflict.ctNoPoolOrHops` | CT 2(2), CT 6.6, HOP 4.5 |
| R-12 | conflict | `pay.amountVisibility` != `public` and `pay.payerMode` != `direct` | E_CONFLICT (PH-2 relay calls `payERC20` only; PH-3/4 with CT router unspecified) | `privacy.err.conflict.ctPayerMode` | PH 6.2; **[new]** for PH-3/PH-4 |
| R-13 | conflict | `pay.amountVisibility` != `public` and `pay.source=shielded-pool` | E_CONFLICT | `privacy.err.conflict.ctPoolPay` | **[new]** (no spec combines them) |
| R-14 | conflict | `pay.amountVisibility` != `public` and `pay.amountBlur` in {`split`,`denom`} | E_CONFLICT (not specified for CT) | `privacy.err.conflict.ctSplit` | **[new]** |
| R-15 | moot | `pay.amountVisibility` != `public` and (`pay.amountBlur=round` or `pay.amountNoise=on`) | W_MOOT | `privacy.warn.mootCombination` | **[new]**, CT 2 |
| R-16 | conflict | `pay.amountVisibility` != `public` and `pay.route=direct-no-fee` | E_CONFLICT (CT uses `GhostPayConfidentialRouter`) | `privacy.err.conflict.ctDirectPay` | CT 6.1 |
| R-17 | conflict | `pay.source=shielded-pool` and `pay.payerMode` != `direct` | E_CONFLICT (pool is the payer) | `privacy.err.conflict.poolPayPayerMode` | SP T2 |
| R-18 | conflict | `pay.source=shielded-pool` and `pay.amountBlur` in {`round`,`split`,`denom`} | E_CONFLICT | `privacy.err.conflict.poolPayBlur` | **[new]** (SP-PAY single withdrawal) |
| R-19 | moot | `pay.source=shielded-pool` and `pay.route=direct-no-fee` | W_MOOT (pool flow has no router) | `privacy.warn.mootCombination` | SP 5.2 |
| R-20 | conflict | `pay.route=direct-no-fee` and `pay.payerMode` in {`permit-relay`,`eip7702-sponsored`,`erc4337-paymaster`} | E_CONFLICT (they call the router) | `privacy.err.conflict.directPaySponsored` | PH 4, MH-FEE-1 |
| R-21 | requires | `pay.route=direct-no-fee` | `announce.metadata=minimal` (seller scanner reads transfers) | `privacy.err.requires.annMinimal` | MH 6 (FEE-1 + ANN-3) |
| R-22 | conflict | `pay.amountNoise=on` and `pay.amountBlur=round` | E_CONFLICT (pick one) | `privacy.err.conflict.amountNoiseRound` | MH 6 (AMT-1 vs AMT-2), **[new]** extended to AB-ROUND |
| R-23 | requires | `invoice.padding=on` | `invoice.encrypt=on` | `privacy.err.requires.encrypt` | MH 6 (INV-1 needs INV-2) |
| R-24 | warn | `identity.perInvoiceMeta=on` | signer pinning broken | `privacy.warn.perInvoiceSignerUnpinned` | MH 6 (ID-1) |
| R-25 | warn | `announce.viewTag=mask` | other ERC-5564 scanners lose interop | `privacy.warn.tagMaskInterop` | MH 6 (TAG-2) |
| R-26 | requires | `relayer.multi=on` or `net.endpointSeparation=on` or `net.rpcMode=quorum` | cap `multi-relayer` / `multi-rpc` respectively | `privacy.err.requires.multiEndpoint` | MH-REL-4, MH-NET-1, NP Selector B |
| R-27 | warn | `relayer.multi=on` | quote and sweep stay on one relayer | `privacy.warn.quoteSweepSameRelayer` | MH 6 (REL-4) |
| R-28 | conflict | network profile value not allowed in `ctx.env` | E_WRONG_ENV | `privacy.err.wrongEnv` | NP section 3 environment column |
| R-29 | conflict | `net.<role>Profile` != `direct` and not `selftest-ok:<role>` | E_SELFTEST (block, never fall back to direct) | `privacy.err.selfTestFailed` | NP-T-5 |
| R-30 | requires | `net.scanMode=indexer-tor` | `net.rpcProfile` in {`tor-browser`,`tor-socks`,`onion`} | `privacy.err.requires.torForIndexer` | NP Selector C |
| R-31 | warn | a value whose `trust` includes a relay-like service (sweep-relayer, payer-sponsor, bundler, pool-relayer, pp/railgun relayers, zama-decrypt-relayer, payjoin-directory) and `net.relayerProfile=direct` | IP visible to that party | `privacy.warn.networkDirectToParty` | privacy-ops PA3/PO-NET-1, NP N2 |
| R-32 | warn | `pay.amountBlur` in {`split`,`denom`} and `pay.payerMode` in sponsored modes | one sponsor sees all parts | `privacy.warn.sponsorSeesAllParts` | **[new]**, PH N3 + AB 2(3) |
| R-33 | warn | `sweep.exit` pool and `sweep.exitGas=topup` and `sweep.knownWalletGuard=on` | guard may block the top-up from a known wallet | `privacy.warn.guardBlocksTopup` | HY-FUND, EP 4 (a) |
| R-34 | conflict | `sweep.exit=privacy-pools` and `sweep.exitGas=permit-sponsored` | E_CONFLICT (depositor must be `S1` itself; relayer path invalid) | `privacy.err.conflict.ppDepositorMustBeS1` | EP 4 |
| R-35 | requires | `sweep.poolAsp=publisher` or `sweep.poolAmountPlan` set non-default | `sweep.exit` is a pool (`poolAsp`: `shielded-pool` only) | `privacy.err.requires.poolExit` | SP 6.5 |
| R-36 | conflict | `btc.mode` in payjoin and `btc.locktime=height` | E_CONFLICT unless the sender sets it before the Original PSBT (receiver must not change it) → PoC: conflict | `privacy.err.conflict.locktimePayjoin` | MH-BTC-3 R3, BIP-78 sender check |
| R-37 | requires | `btc.contributeFromSp=on` | `btc.mode` in payjoin | `privacy.err.requires.payjoin` | BPJ 4(5) |
| R-38 | warn | `btc.ordering=shuffle` | non-deterministic; tests use deterministic mode | `privacy.warn.nonDeterministicOrdering` | MH-BTC-5 R3 |
| R-39 | requires | `pay.amountVisibility=ct1-zama` | `seller-accepts-ct` (invoice `amountVisibility`) | `privacy.err.requires.sellerCt` | CT 4, CT Q4 |
| R-40 | warn | any value with `maturity=experimental` | — | `privacy.warn.experimental` | NP-N-* |

Implicit rules (from `ValueDef` fields, no row needed): `requires`/`requiresAny` caps (E_CAPABILITY), `env` (E_WRONG_ENV), `chains` (E_WRONG_CHAIN), `assets` (E_WRONG_ASSET), `acks` (E_ACK_MISSING).

### 8.1 Compatibility matrix (major choices; generated by `compatibilityMatrix()`, pasted here for review)

`Y` ok, `X` conflict, `W` ok with warning, `M` moot, `-` different side/not combinable by construction. Cell rule ids in parentheses.

| | PH-1 | PH-2 | PH-3/4 | SP-PAY | CT-x | AB round | AB split/denom | MH-FEE-1 | hops>0 | exit pool | tor/onion |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PH-1 fresh-wallet | | - | - | X (17) | X (12) | Y | Y | Y | - | - | Y |
| PH-2 permit-relay | | | - | X (17) | X (12) | Y | W (32) | X (20) | - | - | W (31 if direct) |
| PH-3/4 sponsored | | | | X (17) | X (12) | Y | W (32) | X (20) | - | - | W (31 if direct) |
| SP-PAY | | | | | X (13) | X (18) | X (18) | M (19) | - | - | W (31 if direct) |
| CT-x | | | | | | M (15) | X (14) | X (16) | X (11, seller) | X (11, seller) | Y |
| hops>0 | | | | | | | | | | W (8); X if >2 (9) | W (31 if direct) |
| exit pool | | | | | | | | | | | W (31 if direct) |

### 8.2 Which options need what (derived index)

| Needs | Options |
|---|---|
| sweep relayer | `sweep.hops` (unless direct), `relayer.multi`, `relayer.padding` |
| payer sponsor / bundler | `pay.payerMode` PH-2, PH-3, PH-4 |
| pool relayer / broadcaster | `sweep.poolSubmit=relayer`, `sweep.exitGas=permit-sponsored`, `pay.source=shielded-pool` |
| Tor | `net.*Profile` `tor-browser`/`tor-socks`/`onion`; `net.scanMode=indexer-tor` |
| node environment | `tor-socks`, `nym-socks5`, `i2p-outproxy`, `btc.mode=payjoin-v2` (while only payjoin-ffi) |
| specific chain | CT-1 Sepolia; CT-3 Base Sepolia; CT-M anvil; PH-3/PH-4 where `eip7702`/EntryPoint verified |
| permit token | `sweep.hops`, PH-2, `sweep.exitGas=permit-sponsored` |
| test-mode | `sweep.exit=mock-pool`, `pay.amountVisibility=ctm-cleartext` |

## 9. Presets

```ts
export type PresetId = 'standard' | 'enhanced' | 'maximum' | 'confidential-amount';
export interface PresetDef {
  readonly id: PresetId;
  readonly order: readonly OptionId[];                                   // resolution order
  readonly prefer: Readonly<Partial<Record<OptionId, readonly string[]>>>;  // first acceptable wins; last entry MUST be the option default
}
```

Resolution (`applyPreset`): start from `defaultSelection()`; for each option in `order`, pick the first value in `prefer[option]` such that `evaluate` of the partial selection with that value has no new E_* issue other than `E_ACK_MISSING`; record a `Downgrade` when the pick is not the first entry. Acks are **never** auto-given: required acks are returned and the action stays blocked until the user acknowledges (PH-GEN-5, HOP-REQ-1, EP acknowledgements).

Preset policy:
- Presets select only values with `maturity` in {`existing`, `poc`, `spike-gated` when its capability is present}; never `experimental`, `test-only`, `stub`, `watch` [new].
- Presets never enable `sweep.hops` (Weak, HOP section 3) and never pick a value whose effect is a pure trade-off rather than an addition (`btc.mode` stays `silent-payment`; PayJoin is manual because it drops the SP property, BPJ N1) [new].

| Option | `standard` (no new party, no new contract) | `enhanced` (+ network, client friction) | `maximum` (+ pools, sponsors; unlinking first) | `confidential-amount` (amount first) |
|---|---|---|---|---|
| `sweep.destination` | self-derived | self-derived | self-derived | self-derived |
| `sweep.verification` | address-free | address-free | address-free | address-free |
| `sweep.dust`, `sweep.knownWalletGuard` | on, on | on, on | on, on | on, on |
| `sweep.delay` | off | jitter, off | jitter, off | jitter, off |
| `sweep.exit` | plain | plain | privacy-pools, railgun, shielded-pool, plain | plain (R-11 for CT receipts) |
| `sweep.exitGas` | buffer | buffer | eip7702, permit-sponsored, buffer | buffer |
| `sweep.poolAmountPlan` | (n/a) | (n/a) | denominations | (n/a) |
| `pay.payerMode` | direct | fresh-wallet, direct | eip7702-sponsored, erc4337-paymaster, permit-relay, fresh-wallet, direct | direct |
| `pay.source` | wallet | wallet | shielded-pool, wallet | wallet |
| `pay.amountBlur` | off | round, delay, off | denom, round, delay, off | delay, off |
| `pay.amountVisibility` | public | public | public | ct1-zama, ct3-inco, ct2-fhenix, public |
| `pay.bufferRounding` | grid125 | grid125 | grid125 | grid125 |
| `invoice.encrypt`, `invoice.coarseTime` | on, on | on, on | on, on | on, on |
| `invoice.padding` | off | on, off | on, off | on, off |
| `invoice.quoteRounding` | on | on | on | on |
| `identity.perChainKeys` | off | on, off | on, off | on, off |
| `identity.perInvoiceMeta` | off | off | on, off | off |
| `net.rpcProfile` / `net.relayerProfile` | direct | tor-browser, onion, direct | tor-browser, tor-socks, onion, ohttp, direct | tor-browser, onion, direct |
| `net.rpcMode` | single | quorum, single | quorum, single | quorum, single |
| `net.endpointSeparation` | off | on, off | on, off | on, off |
| `net.scanMode` | range | indexer-tor, range | pir2, indexer-tor, range | indexer-tor, range |
| `net.scanAlign` | on | on | on | on |
| `relayer.multi` | off | on, off | on, off | on, off |
| `btc.mode` | silent-payment | silent-payment | silent-payment | silent-payment |
| `btc.change`, `btc.rbf` | on, on | on, on | on, on | on, on |
| `btc.ordering` | bip69, caller | bip69, caller | bip69, caller | bip69, caller |
| `btc.feeRateNormalise`, `btc.psbtStrip` | off, off | on, off | on, on | on, off |

Resolution `order` for `maximum`: `sweep.exit`, `sweep.exitGas`, `pay.source`, `pay.payerMode`, `pay.amountBlur`, `net.*`, rest. For `confidential-amount`: `pay.amountVisibility` first. Note on `standard`: it changes four defaults that cost nothing and add no party (`invoice.encrypt`, `invoice.coarseTime`, `net.scanAlign`, `btc.ordering`); every other value equals today's behaviour.

## 10. Requirements

- PP-1 (MUST) Package has zero runtime dependencies and no I/O: no `fetch`, `node:*`, `Date`, `Math.random`, `crypto` import in `src/**` except `*.test.ts` (grep test).
- PP-2 (MUST) Every function in 6.4 is total: `fast-check` over arbitrary `unknown` for `sanitizeSelection`, and arbitrary `Selection` × `Context` for `evaluate`/`setOption`/`applyPreset` never throws.
- PP-3 (MUST) Deterministic: identical inputs give deep-equal outputs; arrays in `Evaluation` sorted.
- PP-4 (MUST) `defaultSelection()` evaluates `ok` with zero warnings other than `testnetOnly` for every testnet `chainId`, every `env`, empty capability set.
- PP-5 (MUST) Each option's `defaultValue` is one of its values and matches the default stated in the cited spec (table test against section 7 data).
- PP-6 (MUST) Every `specRef.ids` entry occurs in the cited file under `docs/remote/privacy-specs/` (or `security-specs/privacy-ops.md`) (`specrefs.test.ts`, string search).
- PP-7 (MUST) Every non-default, non-baseline `ValueDef` has non-empty `doesNotHide` and includes `privacy.warn.noAnonymity`.
- PP-8 (MUST) No `ValueDef.hides` contains a payer-identity leak for any `pay.payerMode` value (PH-GEN-3), nor `deposit`/`depositor`/`ip` for pool values (SP-GEN-3, EP N1).
- PP-9 (MUST) No key, id or string in `src/**` (non-test) contains `anonymous`, `anonymity`, `untraceable`, `unlinkable`, `mix`, `mixing`, `launder`, `obfuscate` as whole words (case-insensitive, word-boundary match, so the profile id `nym-mixfetch` is not a hit) except the key `privacy.warn.noAnonymity` (HOP-UX-3, PO-COR-4).
- PP-10 (MUST) `applyPreset(p, ctx)` returns a selection whose evaluation has no blocking issue other than `E_ACK_MISSING`, for every preset and every `ctx` in a generated set (all envs × chains × capability subsets up to size 6 + full set).
- PP-11 (MUST) Monotonicity: removing a capability from `ctx` never makes `applyPreset` pick a value that requires more capabilities, and never removes a blocking issue.
- PP-12 (MUST) Presets never select `sweep.hops` != `0`, any `experimental|test-only|stub|watch` value, or `btc.mode` != `silent-payment`.
- PP-13 (MUST) Acks are never added by `applyPreset`/`setOption`; only `acknowledge()` adds them; `sanitizeSelection` drops acks not in `ACK_KEYS`.
- PP-14 (MUST) Every rule R-01..R-40 has a positive and a negative unit test; every `RuleDef.key` is in `WARNING_KEYS` or `ERROR_KEYS`; every key in those lists is referenced by a rule or a `ValueDef` (no orphans).
- PP-15 (MUST) `compatibilityMatrix()` is symmetric for `conflict` and is reproduced exactly by section 8.1 (snapshot test over `scripts/gen-matrix.mjs` output for the listed columns).
- PP-16 (MUST) A non-default value with `chainId` outside `TESTNET_CHAIN_IDS` yields `E_WRONG_CHAIN`; BTC options likewise for `btcNetwork` outside `testnet|signet|regtest`.
- PP-17 (MUST) `setOption` on a `userSelectable: false` option returns `E_NOT_SELECTABLE` and leaves the selection unchanged; unknown value returns `E_UNKNOWN_VALUE`.
- PP-18 (MUST) Serialisation round-trips (`sanitizeSelection(JSON.parse(serializeSelection(s)))` deep-equals `s` for valid `s`); output JSON has sorted keys and size < 4 KiB.
- PP-19 (SHOULD) `evaluate` runs in < 1 ms median for a full selection on Node 22 (bench test, informational).
- PP-20 (SHOULD) Each `ValueDef.specCopyKeys` lists the method package's own copy constants named in its spec (`ABCopy`, `CTCopy`, hops `labels.ts`, `SP_OPTION_INFO`, `PAYER_MODE_INFO`, `EXIT_ROUTE_INFO`, `BTC_MODE_INFO`), so the UI renders method-owned honest copy.
- PP-21 (MUST) Network values other than `direct` without `selftest-ok:<role>` are blocking (R-29); the package never suggests `direct` as an automatic fallback (NP-T-5).

## 11. Warning, acknowledgement and error keys (complete list; copy lives in `apps/web` later)

Warnings (`privacy.warn.*`): `testnetOnly`, `noAnonymity`, `payerStillPublic`, `sponsorSees`, `sponsorSeesAllParts`, `tokenFundingLink`, `gasFundingLink`, `persistent7702Delegate`, `crowdTiny`, `depositPublic`, `aspChoiceDisclosed`, `ragequitRelinks`, `amountTimingMatch`, `thirdPartyUnaudited`, `ownContractsUnaudited`, `insecureCeremony`, `mockNoPrivacy`, `hopsWeak`, `singleRelayerSeesAllHops`, `hopsBeforePoolNoGain`, `fanOutLinkable`, `roundUpCost`, `tabMustStayOpen`, `timingNotHidden`, `wrapUnwrapPublic`, `fheOperatorTrust`, `teeTrust`, `decryptRelayerSees`, `zeroTransferAmbiguity`, `directReadsRevealAddress`, `bufferFingerprint`, `destinationReuse`, `externalDestinationUnverified`, `knownWalletGuardOff`, `guardBlocksTopup`, `directNoFeeScanner`, `perInvoiceSignerUnpinned`, `tagMaskInterop`, `schemeIdFingerprint`, `quoteSweepSameRelayer`, `networkDirectToParty`, `contentNotHidden`, `walletRpcOutsideApp`, `torExitSeesHost`, `outproxySeesDestination`, `nymDestinationGroups`, `ohttpNonCollusion`, `pirNonCollusion`, `lightClientIntegrityOnly`, `payjoinNoSilentPayment`, `payjoinFallbackBroadcast`, `payjoinUtxoProbing`, `payjoinDirectorySees`, `nonDeterministicOrdering`, `experimental`, `mootCombination`.

Acks (`privacy.ack.*`): `hopsWeak` (HOP-REQ-1), `poolDisclosure` (EP N1-N6, SP N1-N9), `shieldedPoolTestnet` (SP-UI), `destinationReuse` (HY typed confirmation), `payerStillPublic` (PH-GEN-5), `ctTrust` (CT 4).

Errors (`privacy.err.*`): `wrongChain`, `wrongEnv`, `notAvailable`, `testModeOnly`, `notSelectable`, `unknownValue`, `selfTestFailed`, `hopsNoPermit`, `ackMissing.<ack>`, `requires.<name>` (`sweepRelayer`, `annMinimal`, `encrypt`, `multiEndpoint`, `torForIndexer`, `poolExit`, `payjoin`, `sellerCt`, plus one per capability `requires.cap.<Capability>`), `conflict.<name>` for every conflict rule in section 8.

## 12. Test plan

1. Unit: catalogue shape, defaults (PP-4, PP-5), each rule R-01..R-40 positive/negative (PP-14), presets per capability set (PP-10, PP-12), serialisation (PP-18), not-selectable and unknown values (PP-17), chain guard (PP-16), self-test gating (PP-21).
2. Property (fast-check): totality (PP-2), determinism (PP-3), monotonicity (PP-11), ack invariance (PP-13), conflict symmetry (PP-15).
3. Spec cross-check: `specrefs.test.ts` (PP-6) reads the spec files; fails when a spec renames an id.
4. Honesty: banned-word grep and `doesNotHide` non-empty (PP-7..PP-9).
5. Snapshot: matrix (PP-15), preset outputs for four fixed contexts (empty caps web Sepolia; full caps web-onion Sepolia; node anvil with `test-mode`; web Base Sepolia with `payer-sponsor` + `eip7702`).
6. Purity: grep test (PP-1); `vitest` with `--pool forks` and no network.
7. Mutation (manual, record in `DEVIATIONS.md`): delete R-11, R-12, R-29; flip a default; each must fail a test.

## 13. PoC acceptance criteria

1. `npm test --workspace @ghostpay/privacy-profiles` green, coverage 95/90/95/95; `typecheck`, `lint` green.
2. All PP-1..PP-18, PP-21 tests exist and pass; PP-19/PP-20 reported.
3. Section 8.1 matrix equals `node scripts/gen-matrix.mjs` output.
4. Four preset snapshots of 12.5 reviewed and committed under `src/__snapshots__/`.
5. `DEVIATIONS.md` lists every `[new]` rule above for owner review.
6. Not done and recorded: UI wiring (lane E6), capability detection (method packages and app), umbrella end-to-end scenario per preset (README section 5).

## 14. Effort

S-M: types + catalogue data S (largest part is transcription from ten specs), rules engine + presets S, tests M (property tests and spec cross-check). About 4-6 engineer-days. No dependency on any other new package; can be built in wave 1.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Catalogue drifts from method specs and packages | PP-6 cross-check; method packages' `*_INFO` tables remain authoritative for copy (PP-20); later a test in `apps/web` compares both |
| Users read preset names as strength claims ("maximum" = anonymous) | strength classes are kinds, not levels; `noAnonymity` on every non-default value; no numeric scores |
| `[new]` rules wrong (over- or under-blocking) | listed in `DEVIATIONS.md` for owner review; conflicts default to blocking when no spec covers a combination |
| Capabilities asserted by a compromised or buggy caller | stated in section 2; method packages enforce their own guards (chain, acks, NO_PERMIT) regardless |
| Preset greedy order hides a better combination | order documented per preset; `confidential-amount` exists because `maximum` (unlinking first) excludes CT via R-12/R-13 |

## 16. Open questions

- Q1 Should `maximum` prefer the own `shielded-pool` over third-party pools on testnet, where only the own pool may be live? Spec: third-party first (larger crowd off-testnet, ragequit escape); downgrade happens automatically when the manifest capability is absent.
- Q2 Should `standard` change any default at all (encrypt, coarse time, scan align, BIP-69)? Spec: yes, they add no party and no cost; owner may revert to "standard = today".
- Q3 R-12/R-13/R-14 (CT with sponsored payer, pool pay, split) are blocking only because no spec defines them. Spec them later or keep blocked?
- Q4 Capability names for spike-gated items (`eip7702`, `erc4337-entrypoint`) depend on PH Q1/Q2 results; who sets them (manifest vs runtime probe)?
- Q5 Per-role selections: payer and seller are different users; one `Selection` per browser profile is assumed. Separate payer/seller stored selections?
- Q6 Legal (deferred by owner): whether presets may enable pool exits by default in any hosted build. Not analysed.

## 17. Sources

All [R], read 2026-10-21: `docs/remote/privacy-specs/{hygiene,amount-blurring,hops,payer-hiding,shielded-pool,external-pools,confidential-tokens,network-privacy,metadata-hardening,btc-payjoin}.md`; `docs/remote/security-specs/privacy-ops.md`; `docs/remote/anonymization-research.md` sections 12, 14; `apps/web/src/lib/settings.ts`; `packages/relayer-guard/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}`.
External: RFC 2119 https://www.rfc-editor.org/rfc/rfc2119 and RFC 8174 https://www.rfc-editor.org/rfc/rfc8174 (keyword conventions) **[U: fetch failed, ENOTFOUND, 2026-10-21]**.

## 18. Chaining

Ordered pipelines of methods (e.g. PH-1 -> AB-DENOM -> pool deposit -> SP-PAY -> hygiene sweep, with network transport as a cross-cutting layer) are specified in [chaining.md](chaining.md). Effect on this package (lane A, additive; no change to sections 6-11 semantics):
- New data files `src/steps.ts` (`STEP_CATALOGUE`: step kinds with typed input/output holdings) and `src/chainRules.ts` (`CHAIN_RULES` C-01..C-35, `chainMatrix()`); new `privacy.err.chain.*` / `privacy.warn.chain.*` keys and ack `ctUnwrapPublic` in `src/keys.ts`; `scripts/gen-matrix.mjs --chain`.
- Each pipeline projects to one `Selection`, so R-01..R-40 still apply; chain rules add ordering only and resolve to the stricter effect (chaining PL-7). Refinement [new]: R-17 applies to the payment step (`pay.from-pool`), not to an earlier payer pool deposit.
- Logic (planner, validator, executor, summary) lives in the new package `@ghostpay/privacy-pipeline`, which depends on this one; this package still imports no method package.
- Presets map to pipeline templates via `selectionToPipeline(applyPreset(...))`; PP-12 extends to templates (no hops, no unwrap, no PayJoin, no second pool).
