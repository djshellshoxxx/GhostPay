# Narrow residual recovery — 2026-11-24

## Source and scope

Worker `/root/ownership_review`, branch
`integration/narrow-residual-recovery-20261124`, isolated worktree based on
`fb12a3302d9a85aa8777805bbdaab1bf2770ea16` (tree
`8086add0f3c77a80ae953e45d50b179244261248`). Initial claim commit:
`369a3d0388d5b36fadb6ef0c4149a012bb2bbd75`.

Reviewed executable source plus corrected fixture:
`817756ad12d3b85bc74947a96ea2933ce9b0a9a7`, tree
`dc2b7ea341c4f3e200e473a27f6bfc181de73bb8`. Later handoff-only commits do not
change tested source. Root owns independent composition, publication and hosted
qualification. Donor refs and whole historical branches remain untouched.

## Accepted recoveries

| Donor | Scoped source and regression | Recovery commit |
|---|---|---|
| #410 | `8ca59c6e1e1b7dc6bcfdf8d24c31fe68214103a1`, `6c645477f8c91d6f0f54b6bb21c6a2710a947b80`; `qrKinds.ts` and adjacent test only | `375a93e67055138206047d59378e8937e5314284` |
| #341 | `26d2ba95a045bb60d9344cb3e4a84224c2b74b50`, `0284eead8822306c625981d5095e983f8364cb93`; hygiene ledger and its browser-chain regression | `57655929b5855f0cfaa107fa76d4084637c2ae9d` |
| #220 | Only merchant-ledger source/regression from `6db114920589a38dbbb5d52f45bb7a52be98d9b6` | `3276c605a6c7b79cecdb5e01d3a25b7ea9907dea` |

#410 preserves all current QR primitive guards, recognized mappings, secret and
bearer precedence, typed true/false behavior and print-size limits. Only literal
`true` suppresses the printed bearer warning. This is defensive API correctness;
no unsafe current browser-input reachability or protection verification is
claimed. The comment now explicitly describes the literal check.

#341 widens only the pure `DestLedger` policy and checks delegated to that
ledger. The existing `chain-adapters/src/config/chains.ts` table explicitly models
EVM/EIP-155 chains: seven enabled testnets and seven disabled mainnets. The
regression pins all seven enabled IDs, valid round trips and chain separation,
Anvil, and rejection of listed mainnets, unknown and malformed IDs. The original
three-chain `assertTestnetChain` is unchanged, with regression controls for the
additional chains. No dependency was added: chain-adapters was already declared.
The README now accurately distinguishes the pure ledger policy from helpers
that use the unchanged PoC guard. Current web source has no `DestLedger` caller;
no browser network, RPC path, persistence or advisory was activated.

#220 is compatible with current public reconciliation contracts. `paidMinor`
counts only pre-expiry positive observations; zero-value rows are rejected.
Tolerance cannot manufacture a payment for a positive-due invoice. Zero-due
invoices still settle, positive counted payments retain tolerance semantics,
and overpaid, partial, expired, late/invalid/duplicate-payment handling remains
unchanged. The independent read-only review confirmed these cases against the
current source and tests. R4 in the reconciliation specification now states
status ordering and the zero-count/high-tolerance expiry case explicitly.

No scoped production hunk was superseded or rejected. Unrelated #220 workflow,
contract, ux-flow and old RPC changes were deliberately excluded; restoring the
old RPC whole file would remove newer finite-retry guards. Current RPC blob
`1c8d1edc486c70b7ea7fee96ec62c57af00e421e` and hygiene testnet-guard blob
`d20f046b8a61f8882e776e9c020eb49efbcb006a` match the base exactly.

## Fixture compatibility correction

The unchanged donor's falsy-value array inferred `string | number | null |
undefined`, so current TypeScript rejected two direct boolean casts (TS2352).
Commit `817756ad12d3b85bc74947a96ea2933ce9b0a9a7` gives those same inputs the
explicit `readonly unknown[]` type already used by the preceding truthy-value
fixture. Every input and assertion is retained. The same commit clarifies the
QR comment and delegated-ledger README wording; package executable source and
regressions are unchanged from their passing package qualification.

## Qualification

All 13 requested gate commands passed (including the two earlier package
builds). Node `v24.22.3`, npm `11.19.1`; unit suites used one worker. External
installed dependencies were reused with checkout-local `@ghostpay` workspace
links. Unchanged dependency outputs came from the coordinator's build; both
affected packages were rebuilt here, and merchant-ledger also rebuilt its
invoice-schema dependency. No manifest or lockfile changed.

| Scope | Tests | Coverage: statements / branches / functions / lines | Static/build checks |
|---|---|---|---|
| hygiene | 175 passed, 8 files | 99.53% / 99.14% / 100% / 100% | Full typecheck, lint, build passed |
| merchant-ledger | 36 passed, 3 files | 100% / 99.34% / 100% / 100% | Full typecheck, lint, build passed |
| relevant web regressions | 178 passed, 10 files | Targeted run without coverage; no full-web coverage claim | Full web typecheck, lint, full and lean builds plus original postbuild bundle scans passed |

Total: **389 passing tests in 21 files**. Neither package suite skipped tests.
Both retain the original coverage thresholds (95% statements/functions/lines,
90% branches). Web suites cover qrKinds, qrClassify (including its existing fuzz
and surrogate fixtures), PrintableBill, QrFrame (normal, existing boundary and
large-warning suites), PaymentRequestQr and Pay invoice QR handling.

Reproduction commands from this worktree root:

```sh
npm run test -w @ghostpay/hygiene -- --maxWorkers=1
npm run typecheck -w @ghostpay/hygiene
npm run lint -w @ghostpay/hygiene
npm run build -w @ghostpay/hygiene
npm run test -w @ghostpay/merchant-ledger -- --maxWorkers=1
npm run typecheck -w @ghostpay/merchant-ledger
npm run lint -w @ghostpay/merchant-ledger
npm run build -w @ghostpay/merchant-ledger
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build -w @ghostpay/web
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build -w @ghostpay/web
```

The targeted web command is run from `apps/web`:

```sh
../../node_modules/.bin/vitest run src/lib/qrKinds.test.ts src/lib/qrClassify.test.ts src/lib/qrClassify.fuzz.test.ts src/lib/qrClassify.unpaired-surrogate.test.ts src/components/PrintableBill.test.tsx src/components/QrFrame.test.tsx src/components/QrFrame.security.test.tsx src/components/QrFrame.largeWarning.test.tsx src/components/PaymentRequestQr.test.tsx src/views/Pay.invoiceQr.test.tsx --maxWorkers=1
```

The initial web typecheck failure and successful corrective reruns are retained
in the coordinator's scratch qualification records. No assertions, coverage
thresholds or gates were relaxed. `git diff --check` passed. The source delta is
limited to the three production files, three existing/donor regression paths,
two public-contract documents and additive ownership/handoff documentation.

## Boundaries

No whole-branch merges, new caller activation, hosted/native feature activation,
workflow, contract, dependency or RPC edits. The separate QR-composition owner
confirmed its reader/vendor/QrView/license paths do not overlap `qrKinds.ts`.
No vulnerability reproductions, stress scenarios, real network payments or
remote mutations were performed. Local existing unit/regression suites and
static builds are not a claim of native-browser or final hosted CodeQL approval.
