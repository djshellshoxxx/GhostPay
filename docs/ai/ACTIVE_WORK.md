# Independent merchant-profile clock review — 2026-11-19

Worker: contract_security; evidence branch
`chatgpt/ghostpay-buffered-sweep-20261119`, base
`4d250dbdcde3aaf8093f9bcc643581c7261f8520`. Read-only review of
workflow_fixes' clock repair `67caefd2f0a696f115abbc61a7cfc7ccf923f731`
and genuine signed-profile regression `9f68917f1a3721a8d20d23002174a5094223ca20`.
Owned paths are this entry,
`docs/handoffs/agents/MERCHANT_PROFILE_CLOCK_CROSS_REVIEW_20261119.{md,json}`
and `docs/handoffs/agents/evidence/merchant-profile-clock-cross-review-20261119/`.
Acceptance: verify original-source/test identity and signed-profile RED/GREEN
evidence; preserve all finite clock comparisons, existing expiry/result semantics
and size/format/signature precedence. Record conditional caller-clock reachability
without asserting a remote exploit, archive exact checks, then freeze this branch
for the coordinator's source bundle. No runtime, dependency, browser, JSON-array,
other-owner, gate, deployment or remote changes. Status: source and archived
evidence review PASS. Author packet `34eee707` and integrated packet `3c6f81fe`
are verified; author and coordinator each pass the same 63 clock cases. Full
package coverage remains exit 1 (786 passed / one timeout in an unchanged
passphrase test), with no coverage report; the isolated 1/1 diagnostic does not
erase that result. All 23 original author artifacts match their archives. No
reviewer application-test rerun. This branch is frozen after the review commit;
all earlier owned worktrees are clean and frozen for source-bundle capture.

# Merchant profile verification clock — 2026-11-19

Worker: workflow_fixes; task `RW-MERCHANT-PROFILE-CLOCK`; branch
`chatgpt/ghostpay-merchant-profile-clock-20261119`, isolated
`GhostPay-merchant-profile-clock` worktree, base `8a2ce1da1507771935b88bdc91ecad9eb5c540cb`.
Coordinator explicitly assigned the conditional Low `GP-AUD-208-01` from audit PR #266,
head `75dc9d3b29e3449b56e13889496c3771ec7c2f93`. Own paths:
`packages/invoice-schema/src/merchantProfile.ts`, its existing test file, this entry,
and a scoped author evidence packet. First inspect the verification contract and all
callers, then reproduce the invalid-clock expiry bypass with a genuinely signed expired
profile before changing runtime. Cover NaN, negative Infinity, undefined and runtime
wrong types plus relevant ordinary finite boundary controls. Preserve existing result
semantics and intended ordinary calls; independently review before consolidation.
No #265 JSON-array handling, pinned invoice signer, private scan checkpoint, recovery,
other excluded owner stream, protocol/domain/format change, push, merge or completion
ledger modification. Full merchant-profile file and practical focused package static/
test gates use the existing qualification mutex; retain original source and RED/GREEN.
Status: author source complete and frozen after the evidence commit. Claim `4ea57693`,
genuine signed-profile RED `9f68917f` (26 failed / 37 passed), runtime `67caefd2`.
Full merchant-profile GREEN 63/63; package build/typecheck/lint PASS. Broader full package
remains failed: 786/787, one unchanged passphrase 60-second timeout, no coverage report.
One authorized exact-case diagnostic rerun passed under the original budget and does not
supersede that failure. Root and contract_security source/RED review PASS. No more runs.
Author packet: `docs/handoffs/agents/MERCHANT_PROFILE_CLOCK_20261119.{md,json}`.

# Browser devnet canonical manifest fixture — 2026-11-19

Worker: workflow_fixes; branch `chatgpt/ghostpay-devnet-canonical-fixture-20261119`,
isolated `GhostPay-devnet-fixture` worktree. Root base `f42553ab`; read-only dependency
inputs are backlog_ci's claims/source `b1a7c888`/`8238f66b`, imported as `49c89885`/
`29355af7`. Own paths: `scripts/beta/browser-devnet.sh`,
`apps/web/e2e/devnet/prepare-devnet-manifest.mjs`, focused helper regressions in
`scripts/testnet/make-manifest.test.mjs`, this entry and a scoped evidence packet.
Confirmed gap: the old runner switches a DeployDevnet 31337 deployment with a fresh
noncanonical announcer to 84532; the stronger known-chain readback correctly rejects
that fixture. Preserve the original 31337 broadcast for Pages c2 stand-in-token evidence.
After proving the loopback node is Anvil on 84532, install the existing compiled CC0
reference runtime at the canonical announcer address, then use the unmodified
`Deploy.s.sol` for the 84532 router/sweep broadcast. The helper must consume that
broadcast and assert the canonical getter/code through the normal verifier before signing.
Acceptance: actual failing old native fixture under the stronger verifier, focused RED
before helper changes, bounded real Anvil deployment/seeding/readback/signature checks,
existing manifest tests and shell/static checks, and independent review. Keep the default
runner's full browser requirement; no permanent fixture-only mode or browser-pass claim.
No production verifier or contract change, timeout/skip relaxation, web isolation change,
new provider, public network call, deployment outside owned local Anvil, push or merge.
Status: complete locally. Claim `764dcb63`, RED `05f5631d`, runtime `5f6af961`.
Actual RED: 5 failed / 9 passed plus a real old-fixture canonical mismatch before output.
GREEN: 14/14 manifest tooling tests, all scoped syntax checks, and native Anvil fixture,
runtime seeding, both deployments, ordinary readback and public test signature verification.
Original 31337 broadcast and token code retained; allowlisted token addresses remain empty.
Root and contract_security source review PASS. Both replay-only failures are retained.
No browser acceptance is claimed; default/pages browser execution remains mandatory.
See `docs/completion/remaining-20261119/workflows-devnet-fixture.{md,json}`.

# Library and optional-relayer deployment readback parity — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-deployment-readback-20261119`;
base `db724aa68a21fde8fe35c14baab9ec55a40984f0`. Owned paths:
`packages/chain-adapters/src/deploymentsVerify.ts` and its test;
`apps/relayer/src/runtime.ts` and its test; this claim and the scoped handoff/evidence.
Acceptance: reproduce the primary-only startup check and noncanonical known-chain
announcer acceptance; reuse existing `requestWithFallbackCheck` and
`canonicalAnnouncer` to require agreement for every manifest read when a secondary
is explicitly supplied, fail closed on its absence/failure/mismatch, and preserve
single-provider behavior and development chain 31337. No new provider, contract
identity, signing rule, chain enablement, web wiring, deployment or paid workflow
activation. Coordinator confirmed #250 does not own these files; #251 retains
browser second-provider consent/wiring. Independent review precedes integration.
Status: baseline 12 library and 6 relayer regressions failed as expected; corrected
library 64/64, relayer 149/149 and unchanged web manifest consumer 14/14 pass with
zero skips. Both workspace typechecks, affected builds and separately scoped
lints pass; the earlier combined lint heap exhaustion remains recorded. Root
independent source review passed. Combined-head hosted qualification and the
separately assigned synthetic-84532 devnet fixture correction remain pending.
See `docs/handoffs/agents/DEPLOYMENT_READBACK_PARITY_20261119.md`.

# Concurrent security-source comparison — 2026-11-19

Worker: contract_security; branch `chatgpt/ghostpay-ledger-tolerance-20261119`,
base `5fadb4ff709701bff2a5f08fac548d24c2de42ad`. Owned paths are this entry,
`docs/handoffs/agents/SECURITY_CROSS_REVIEW_20261119.md` and its JSON/raw diagnostic
records. Compare live #255 at `ea47fa75` with our deployment guard and observational
evidence, and independently review coordinator documentation at `854fa4c7`.
Acceptance: pin exact sources, identify stronger behavior and merge overlaps,
retain owner decisions, and avoid duplicate implementation. No source PR/runtime
edits or qualification claims for unrun checks.

# Policy client and current Mythril evidence archive — 2026-11-19

Worker: contract_security, remaining-work coordinator.
Branch: `chatgpt/ghostpay-ledger-tolerance-20261119`, archive base
`beee43cc3756c5bdc5374d93625abe1c5638e904`. Owned paths are this registry entry
and `docs/handoffs/agents/evidence/security-recovery-20261119/` only. Preserve
the completed G1 recovery's original raw qualification logs/patches and committed
handoffs, together with the fresh hosted Mythril report for source `198aa5ba`,
per-finding dispositions and concrete replay evidence. Acceptance: verify every
copied byte against its original and recorded SHA-256, retain original failing
checks and current strict Mythril failure, and record source/tool/run provenance.
This is an evidence-only follow-up; no runtime, analyzer policy or gate changes.
Status: 36 original files preserved; all copied hashes, 28 G1 source hashes and
the hosted ZIP/report/metadata parity verified. Eleven current Mythril findings
remain a strict failure with no approved exceptions.

# Merchant ledger tolerance recovery — 2026-11-19

Worker: contract_security, remaining-work coordinator; Caveman investigate-first.
Branch: `chatgpt/ghostpay-ledger-tolerance-20261119`, base
`3db3c3597666ceb77862481ee8ed4a38a6d2ff81`. Owned paths are
`packages/merchant-ledger/src/reconcile.ts`, `ledger.test.ts`, this registry
entry and the scoped handoff. Selectively recover only #220 D-2 from
`6db114920589a38dbbb5d52f45bb7a52be98d9b6`: a positive-due invoice must have
a counted payment before tolerance can make it paid; zero-due invoices retain
the existing settled behavior. Source PR/workspaces remain read-only.
Acceptance: independently reproduce the unpaid-to-paid error, prove the existing
regression fails, preserve zero-due and counted-payment tolerance semantics, run
the package's unchanged tests/coverage and scoped static checks, then obtain
coordinator review before consolidation. No protocol, dependency or gate change.
Status: independent direct-source probe and historical regression reproduced the
unpaid-to-paid error. Recovery passes all 28 package tests, unchanged coverage
thresholds, typecheck and scoped lint. Zero-due settlement is explicitly preserved;
coordinator source review passed. Raw evidence is archived in the scoped packet.

# Fresh #246 Mythril identity and evidence review — 2026-11-19

Worker: contract_security; branch `chatgpt/ghostpay-buffered-sweep-20261119`, base
`75bbdb8765899a134dd240f7c66efa0a2d261904`. Owned paths are this entry,
`docs/handoffs/agents/MYTHRIL_28EDBCF_REVIEW_20261119.md` and
`docs/handoffs/agents/evidence/mythril-28edbcf-20261119/`. Compare the complete
fresh #246 hosted report for `28edbcf5` with the preserved `198aa5ba` report by
exact finding, source, input and trace identities. Preserve fresh raw evidence,
correct any trace-specific interpretation that no longer applies, and retain
the strict eleven-finding failure and unapproved owner decisions. This is
read-only analysis plus evidence records; no new analyzer campaign, runtime,
test-budget, release-policy or source-PR modification.
Status: five original files and ZIP parity verified. All eleven source/location
observations match, but eight Factory traces differ in 45 primitive fields;
the current R8 distinct-deploy and R11 same-caller corrections are explicit.
The reproducible per-finding packet preserves strict exit 1, zero exceptions,
historical replay limits and all owner decisions. No new campaign was run.

# Independent OP fee accounting review — 2026-11-19

Worker: contract_security; evidence branch
`chatgpt/ghostpay-buffered-sweep-20261119`, base `80cc1109`. Read-only runtime
review of workflow_fixes' `0aef3a25` in its isolated OP-fee worktree; later
receipt-status correction remains owned by that worker. Owned paths here are
this entry, `docs/handoffs/agents/OP_FEE_SOURCE_REVIEW_20261119.{md,json}` and
`docs/handoffs/agents/evidence/op-fee-source-review-20261119/`. Review exact
transaction sizing/signature overhead, canonical receipt-block binding,
reservation/actual-settlement accounting, malformed data and non-OP behavior.
Preserve primary-source identities and the independent old/new status probe.
No runtime, dependency, policy, owner-worktree, merge or deployment edits.
Status: new OP accounting source reviewed PASS. The independent baseline probe
identified inherited malformed receipt-status acceptance; owner regression
reproduced 16 failures/8 valid controls. Narrow repair `2af11e38` independently
reviewed PASS with 97/97 focused author checks. TypeScript argument correction
`de253aaf` separately reviewed as preserving the request objects. Original
source/probe/RED/GREEN identities and full qualification limits are retained.

# Independent current Mythril replay review — 2026-11-19

Worker: contract_security; evidence branch
`chatgpt/ghostpay-buffered-sweep-20261119`, base `ef4e95d6`. Read-only review of
the coordinator's additive concrete replay for hosted source `28edbcf5`.
Owned paths are this entry,
`docs/handoffs/agents/MYTHRIL_REPLAY_CROSS_REVIEW_20261119.{md,json}` and
`docs/handoffs/agents/evidence/mythril-replay-cross-review-20261119/`.
Verify original report/finding/input identity, all archived file and binary
hashes, the retained failed timestamp assumption, unchanged assertions/input
construction, and the corrected zero-interval observations. Record local
target/gas/state/hash-encoding limits. Do not rerun Anvil, change the executed
coordinator scripts or modify strict analyzer/owner policy.

Completed: independent PASS on packet `5e753eb9`, with all six raw archive
hashes, all eleven keyed creation/call inputs, eight original address-`0x1`
constructor rejections, both clock outcomes and the exact assertion-preserving
script correction verified. Original failed attempt and local execution limits
are explicit. No new EVM run or analyzer policy change.

# Independent action runtime review — 2026-11-19

Worker: contract_security; evidence branch
`chatgpt/ghostpay-buffered-sweep-20261119`, base `cbff782b`. Read-only review of
root source `f42553ab`, limited to the two pinned create-pull-request action
updates. Owns this entry,
`docs/handoffs/agents/ACTION_RUNTIME_CROSS_REVIEW_20261119.{md,json}` and
`docs/handoffs/agents/evidence/action-runtime-cross-review-20261119/`.
Compare exact committed workflow bytes, independently retrieve both upstream
action manifests, verify the used interface and unchanged authority, and retain
the coordinator's existing local qualification. No live workflow dispatch,
paid execution, pull request creation or source mutation is part of this review.

Completed: source/interface PASS. Each workflow differs only in the one pinned
SHA/version-comment replacement. Independently retrieved upstream manifests
differ only in the Node runtime declaration, with identical inputs/defaults and
outputs; the v8.1.3 ref resolves to the new pin. Coordinator's 33/33 local checks
and pin/secrets receipts are retained with clear attribution.

# Independent combined integration review — 2026-11-19

Worker: contract_security; isolated evidence branch based on `fc506491`.
Read-only review of root runtime `6fe060e3`, OP/status source `a2afd126`, configured
secondary/canonical readback `8238f66b`, and action pins `f42553ab`. Owns this
entry, `docs/handoffs/agents/COMBINED_INTEGRATION_CROSS_REVIEW_20261119.{md,json}`
and `docs/handoffs/agents/evidence/combined-integration-cross-review-20261119/`.
Verify source parity, caller/guard interaction and existing qualification/raw
artifact provenance. Preserve the first missing-artifact failure. No runtime
edit, suite rerun, compilation, deployment, browser or paid workflow execution.

Completed: scoped integration PASS. Twelve source files match their reviewed
checkpoints, all eight coordinator evidence files match their committed hashes,
and both exact artifacts plus all 29 metadata source hashes match `6fe060e3`.
The original 241-pass/1-failure/4-skip prerequisite result remains; the unchanged
required-Anvil selection passes 246/246 and readback passes 64/64. No coverage,
full test-source typecheck, public OP or browser acceptance claim.

# Independent canonical devnet fixture review — 2026-11-19

Worker: contract_security; isolated evidence branch based on `eed26a15`.
Owns this entry, `docs/handoffs/agents/DEVNET_FIXTURE_CROSS_REVIEW_20261119.{md,json}`
and `docs/handoffs/agents/evidence/devnet-fixture-cross-review-20261119/`.
Read-only review of runner/helper repair `5f6af961`, regression source `05f5631d`
and the author's archived packet `bd62f073`. Check local endpoint admission,
compiled canonical runtime provenance, preserved token broadcast, ordinary
readback before signing, unchanged browser execution and exact failure/pass
evidence. No source mutation, native replay or browser run by this reviewer.

Completed: source/evidence PASS. All 57 raw files and 14 source hashes match the
committed packet; unchanged regressions improve from 5 failed/9 passed to 14/14.
The old native rejection and two replay-wrapper failures remain explicit. Final
native evidence and an independent offline signature check pass, with unchanged
mandatory browser branches and no browser/public-chain acceptance claim.

# Buffered ERC-20 sweep native acceptance — 2026-11-19

Worker: contract_security; branch `chatgpt/ghostpay-buffered-sweep-20261119`, base
`cbed997a1fd8398975feac8fa23f9162a65f7e73`. Owned paths are
`packages/chain-adapters/src/router.anvil.test.ts`, this entry, and the scoped
handoff/evidence packet. Existing Anvil router tests cover fee math but not the
spec 13 section 4 / CONTRACTS_SPEC sections 1 and 3 acceptance case of a direct
ERC-20 sweep paid only from the router's gas buffer (F-CTR06). Acceptance: derive
and verify a fresh stealth signer with zero starting ETH, demonstrate the
no-buffer insufficient-funds control, execute an actual buffered token payment
and signed sweep, and assert exact token/native/gas/nonce accounting. Use the
existing compiled local contracts and unchanged qualification budgets; obtain
independent coordinator review. No contract, UI, fee policy, feature flag,
authority or other owner's implementation changes are claimed.
Status: the full focused native file passes 4/4 with REQUIRE_ANVIL=1; package
typecheck and scoped typed lint exit 0. Coordinator independently reviewed the
final test source and approved the stated local acceptance scope. Raw command
receipts, source/artifact identities and logs are in the scoped handoff packet.
# Experimental design-support model CI coverage — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-design-model-ci-20261119`.
Base: `fe7a598d589057c139ef0f823fa02b7c0cc38e04`.
Owned paths: the existing rest-0 Node-test invocation in `.github/workflows/ci.yml`,
this claim and `docs/handoffs/agents/DESIGN_MODEL_CI_20261119.md` with evidence.
Acceptance: run the existing milestone-escrow and policy-recovery model suites,
then include those two files in the existing CI invocation while preserving all
current test patterns, gates, triggers and permissions. Models and product code
remain unchanged. This is design-support test wiring; it does not implement
fund control, select an authority model, activate recovery or qualify a release.
Status: the unchanged existing models pass 38/38 with no skips. YAML/shell and
argument-preservation checks, 114 action pins, secret scan and diff check pass.
Independent coordinator source review passed; combined hosted CI remains pending.

# Browser network isolation: unowned transport gaps — 2026-11-18

Worker: ChatGPT lead with separate transport implementer and independent privacy reviewer.
Branch: `codex/ghostpay-browser-isolation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (live `main`).
Owned paths: `packages/net-transport/src/fetchTransport.ts`, `fetchAdapter.ts` and new focused
transport isolation tests; `packages/solana-stealth/src/rpc.ts`, `packages/tron-adapter/src/rpc.ts`
and new `rpc.isolation.test.ts` tests (chain adapter worker); `apps/web/src/lib/release.ts`, its
focused tests, a new browser network isolation spec; new machine-readable egress inventory
and scoped isolation documentation; new `scripts/tests/network-egress-inventory.test.mjs` and
independently authored `scripts/tests/network-isolation-native.test.mjs` QA. Both chain RPC files were checked against all 39 open
PRs, including new recovery #239 (`d2c64522`); no current PR changes either file.
Acceptance: reproduce and fix unintended redirect egress, cancelled/stale request dispatch,
unbounded transport failure and untrusted error disclosure in these paths; prove no fallback,
bounded failure and fixed error messages with controlled fixtures and browser requests. Record
source-pinned findings, exact checks and unresolved integration dependencies.
Status: implemented and independently re-reviewed in draft PR #241. Hosted first-head typecheck,
unit/integration suites and lean browser acceptance passed; 11 lint errors were corrected with their
adversarial assertions preserved. Final-head checks and the separately owned policy integration are
tracked in `docs/handoffs/BROWSER_NETWORK_ISOLATION_2026-11-18.md` and the PR.

Active inputs remain read-only: privacy #222 (`2bc20982`), own-node #228 (`685fe1a3`), Sweep
consent #231 (`d9ff3868`), browser fixtures #233 (`67cf835d`), integration #238 (`198aa5ba`),
recovery/keypair exports and Mythril remediation. Their UI, service policy, settings, scan,
Sweep, catalogs, consolidation ledgers and release gates are not owned by this task. The
five lower-level transport files were compared against these heads and are unchanged; this
lane extends existing adapters without a second policy engine. Recheck all heads before PR.

# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
The test file is imported from the separate review lane; product edits start after this claim. PR #209's frame and
unload changes remain on its own branch. No deployment, signing, publication, mainnet, or release-gate changes.

# Repository consolidation — 2026-11-18 (active)

# Remaining-work browser qualification — 2026-11-18

Worker: ChatGPT root, branch `chatgpt/ghostpay-remaining-work-20261119`, source
`264cf86b`. Owned path: `apps/web/e2e/app.spec.ts` hostile-text test only.
The live #233 file list does not claim this test. Its global dialog handler
dismisses the legitimate SEC-40 beforeunload prompt, aborting `openFresh()`.
Acceptance: accept only beforeunload in this synthetic-key test; continue to
record/dismiss every script dialog and preserve every inert-DOM assertion.
No application, privacy, recovery, timeout, or assertion relaxation.

# Remaining unassigned work — 2026-11-18 (client date)

Coordinator: ChatGPT root; branch `chatgpt/ghostpay-remaining-work-20261119`.
Base main: `dfc75ef2087fa6463ae59e0818abec01796c578d`; integration source:
`198aa5baff22272453733a0f3dcfcac0e0994eec` (#238).
Owned paths: `docs/completion/remaining-work-20261118/`, integration of the isolated
policy, historical CLI/relayer, and CI qualification lanes, and this registry.
Acceptance: source-pin every task and source PR; recover only existing requirements
or confirmed defects; obtain failing/passing regression evidence and independent
review; consolidate verified commits; use actual GitHub merge confirmations.
The seven separately assigned feature streams remain read-only inputs. Their
defects are referred to their owners. Strict Mythril policy remains unchanged.
No deployment, production release, branch deletion, force-push, or paid-agent
workflow activation. Existing branch heads are rechecked before integration.

# Fee-charging Factory deployment safeguards — 2026-11-19

Worker: contract_security, Caveman investigate-first, remaining-work coordinator.
Branch: `chatgpt/ghostpay-policy-guard-20261119`; base:
`198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238).
Owned paths: the seven deployment-policy paths from PR #217 (`DeployPolicy.s.sol`,
`pre-deploy-check.sh`, `DeployPolicy.t.sol`, `DeployChecksum.t.sol`, contract gas
snapshot and README, deployment runbook), `scripts/tests/policy-predeploy.test.mjs`,
this registry entry, and the scoped handoff. Original PR #217 is a read-only input.
Acceptance: recover #217's token-specific nonzero-fee acknowledgement, prove missing
and wrong-token rejection and zero-fee compatibility with deterministic offline
shell cases, run pinned Foundry checks, preserve contract runtime bytecode and the
unchanged strict Mythril policy. No deploy, source-PR mutation, release or main merge.
Coordinator owns integration and all other completion records; independent review
is required before consolidation.
Status: selective recovery and exact-address preflight fix committed at
`c0d718578fb4aa855ffcd4a87241a5efabf9732f`. Independent coordinator source review
found no security blocker; its misleading-zero-fee diagnostic correction is
included in the follow-up commit. Policy shell 22/22, scoped Node checks 68/68,
deployment/checksum 5/5 and native gas snapshot 445/445 passed. Full Forge compilation
was killed by SIGKILL, so full fuzz/invariant qualification remains unclaimed.
# OP Stack relayer fee accounting — 2026-11-19

Receipt-status follow-up (separate inherited R07 defect, explicitly authorized by
the coordinator after independent review): `chain.ts` must return a mined receipt
only for exact `success`/`reverted` status. Missing/unknown status must make lookup
fail and receipt waiting remain unsettled, on OP and non-OP chains alike. Own the
shared status admission helper and missing/unknown/valid-control tests in the same
receipt path. Capture a new RED before this follow-up, preserve the completed OP
full-suite result at `6d23e5b6`, and obtain independent final-delta review.

Status: R07-4 runtime and separate inherited status admission implemented and independently reviewed PASS.
Full OP relayer coverage 556/556 at 6d23e5b6; post-status 97-case selection and final 62 regressions pass;
runtime build and scoped lint pass. Two whole-package typechecks were SIGKILL and remain unqualified.
Public OP-chain and combined-head hosted acceptance remain separate. Exact sources, retained failures,
review commits and raw hashes are in `docs/completion/remaining-20261119/workflows-op-fees.{md,json}`.

Worker: workflow_fixes; branch `chatgpt/ghostpay-op-fees-20261119`, isolated
`GhostPay-op-fees` worktree, base `7be82871` (completed compatibility packet).
Coordinator `fe7a598d` relayer/guard source is byte-identical to this base.
Requirement: #218 R07-4 / `d894106e382c143c511912cb443cb980f5cf9731`, the
remaining total-cost accounting gap in `apps/relayer/DEVIATIONS.md`, and the
coordinator's explicit implementation directive. Historical branches stay read-only.
Owned paths: `apps/relayer/src/chain.ts`, new local OP fee helper and tests,
`service.ts`, `budget.ts`, their focused regression fixtures, relayer README and
DEVIATIONS, this entry and `workflows-op-fees` evidence. No web Sweep helper edits.
Acceptance: first reproduce execution-only under-reservation; include L1 and
operator fees in quotes, fee coverage and daily/loss reserves using the existing
OP oracle predeploy and 2x reserve policy. Bound legacy unsigned transaction size
correctly for quote; recheck fees against the actual signed transaction before
broadcast; settle actual receipt L1 and receipt-block operator fees without
counting fees twice or guessing fork formulas. Missing/malformed oracle/receipt
fee data must fail closed. Preserve non-OP behavior, signed-quote fields, journal
privacy, unknown-send reservations, dependency pins and excluded owner streams.
Run targeted RED/GREEN, unchanged relayer coverage including required Anvil,
package build/typecheck/lint, and independent coordinator source review. Public
OP-chain acceptance remains a separately recorded qualification gate. No new
provider, wallet, custody or amount authority; no push, merge or deployment.

# Solana/TRON CLI compatibility recovery — 2026-11-19

Worker: workflow_fixes; branch `chatgpt/ghostpay-sol-tron-compat-20261119` in
`GhostPay-compat`, base `308a2148` (completed relayer recovery qualification).
Authority: coordinator explicitly authorized coherent PR #211 compatibility after relayer;
this is the existing ADR-0017/ADR-0019 web scheme and formats, not a new protocol.
Source: #211 `a92658b1ef6b95ff0145b2e1933d0047d51289d5`; implementation sources
`179a5b433f35396ca4f0961c99226dbb38e4e4cd`, `28ce8a0b6fe22458505da6a77ae7c7cf81db8864`,
`b9af22a9c85c6a8674d8ac72d7f038954ce713b9`, shared vectors
`e2427c20387aa2e228309c49a1558d3edc6583ce`, and the G5b CLI companion in `1b28f355`.
Owned paths: `packages/chain-solana/**`, `packages/chain-tron/**` excluding manifests;
`packages/cli/src/{chain-commands.test.ts,payment-context.ts,commands/chain.ts}`;
`test-vectors/meta-address-sol-tron-v1.json`; this claim and scoped workflow evidence.
Acceptance: reproduce current CLI/web format and payment mismatch; restore coherent
meta-address, memo and derivation parity using source-pinned shared vectors and differential
web-package tests; reject retired formats with fixed errors; retain CLI testnet-only behavior;
refuse TRON build when its GPT1 memo cannot be bound to transaction bytes. Actual failing
regressions precede implementation, including the builder refusal separately after codec
recovery. Package coverage/build/typecheck/lint and focused CLI checks retain original gates.
Live #250 at `22af2074a086d9957a18e310ef8572b28d1facd0` and its ACTIVE_WORK claim were
read through the connector: it owns chain-adapters deployments/quote/rpc and tron-adapter
RPC completeness, not these CLI-side packages. #252 Sweep consent stays with its owner.
No edits to web `solana-stealth`/`tron-adapter`, browser transport, recovery, scan checkpoint,
pinned signer, BTC scan, TM1–15, idle locking, dependencies, wallets, RPC configuration or
remote branches. Pure/local fakes only; no network/provider/wallet calls, push or merge.
Status: runtime `9c014e2b` independently reviewed PASS; actual baseline failures retained.
Solana 111/111 and TRON 57/57 package coverage passed with original thresholds; CLI 45/45,
all three typechecks, builds, scoped/separate lint and web-only vector reproduction passed.
Evidence: `docs/completion/remaining-20261119/workflows-compat.{json,md}`. No external
chain acceptance or independent cryptographic audit is claimed.

# Optional relayer and abuse-limit recovery — 2026-11-19

Worker: workflow_fixes; branch `chatgpt/ghostpay-relayer-recovery-20261119` in its
completed workflow worktree, base `d84292a3` (quote and Pay residual implementations).
Source: PR #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`, delta from
`5467c158069c5bab264b6a653ac56e89e13f3e13`; historical owner branches remain read-only.
Owned scope: additive relayer/relayer-guard hardening and associated tests/docs;
manifest fee fixture in `scripts/devnet/e2e.mjs`; one refusal classification plus its
regression in `apps/web/src/lib/relayerClient.ts`. Preserve the current privacy config,
zero-log wrapper, request padding, ingress restrictions and exact dependency pins.
Requirements: R07-2/R07-3, LF-074edb61e-1/-4/-7/-8/-9, LF-2789f780b-2/-3,
LF-29de09c05-1/-4, LF-6f25385ce-1, T-dd756b08-3/-4. R07-4 OP Stack total-cost
accounting stays an explicit unimplemented interface/policy follow-up.
Acceptance: execute historical hardening and abuse regressions on the unchanged base;
selectively apply the donor delta while retaining newer behavior; exercise affected
relayer, limiter and pool consumer checks, native local tests where available, package
typecheck/build and separate-project lint; independent coordinator review before integration.
Use the existing qualification mutex with `flock --close`, Node 22 and a 768 MiB cap.
No hosted relayer, protocol redesign, contract source change, public provider/wallet call,
new egress, push, merge, deployment or excluded feature-stream edit.
Status: source `e7b14844` independently reviewed PASS. Baseline regressions reproduced;
full relayer 518/518 including required Anvil, limiter 183/183, pool consumer 35/35 and
web client 34/34 passed. Original coverage gates, package builds/typechecks and separate
package/client lint passed. R07-4 is open, pending a dedicated source-based cost-accounting
feasibility/implementation pass; no external blocker is assumed. Evidence: `workflows-relayer`
under `docs/completion/remaining-20261119/`.

# Payment nonce and delay-label recovery — 2026-11-19

Worker: workflow_fixes; branch `chatgpt/ghostpay-pay-residuals-20261119`.
Base: quote-age recovery and its evidence, `eb92878c`.
Source: `65392fcefefdb102bf71863d25f4a5ed9cd07e21`, #218 L3 residuals
LF-65392fcef-3/-4. Owned paths: the permit nonce reader in `apps/web/src/lib/pay.ts`,
its isolated regression; `apps/web/src/lib/format.ts` minute formatting and the existing
Pay delay label plus one component regression. Acceptance: malformed RPC nonce words
must fail as a fixed user-facing error; the displayed delay must retain fractional minutes;
capture actual baseline failures, preserve valid nonce behavior and all scheduling/signing
logic, and qualify focused checks. No wallet/provider network calls, cryptographic protocol,
private scan, recovery, browser isolation, signer policy or idle-lock changes.

# Quote freshness recovery — 2026-11-19

Worker: workflow_fixes; branch `chatgpt/ghostpay-quote-age-20261119`.
Base: `1ad4c9a3` (reviewed R11 CLI recovery on PR #238).
Owned paths: feed freshness in `packages/chain-adapters/src/quote.ts` and focused quote tests;
`apps/web/src/lib/pay.ts` and focused quote/permit tests; additive freshness-error locale
entries and security-key list; L3 fractional-minute formatting and its existing Pay label.
Requirement: #218 L3 / LF-365f017ac-1 / LF-7aee9060b-1 (feed heartbeat plus 300-second
margin must cap the seller-authored quote window); LF-65392fcef-3/-4 (permit nonce ABI
size and accurate fractional-minute display). Historical fixes: `365f017ac47c02734bf1f69ade4f28a8828e1cd9`,
`7aee9060b0361de5a8b053d54f0a3927fe4fda62`, `65392fcefefdb102bf71863d25f4a5ed9cd07e21`.
Acceptance: reproduce stale-price acceptance and missing-metadata behavior first; validate
trusted feed heartbeat, preserve stricter quote age and existing oracle/permit checks; run
focused regressions and related suites, typecheck/lint and independent coordinator review.
No cryptographic scheme, signer policy, private scan, recovery, network isolation or idle
lock change. No new service, dependency, deployment or production release.

# Remaining workflow fix recovery — 2026-11-19

Worker: workflow_fixes, coordinated by remaining-work integration.
Branch: `chatgpt/ghostpay-workflow-recovery-20261119`.
Base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238).
Owned scope: selective integration and independent requalification of completed PR #218
CLI argument, reconciliation evidence, malformed observation and display-safety fixes;
then the optional relayer/limiter lane if it does not conflict with current privacy owners.
Source: #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`; historical branches read-only.
Owned paths: `packages/cli/src/**`, `packages/cli/README.md`; later relayer/limiter
paths only after source-boundary review; `docs/completion/remaining-20261119/workflows*`.
Acceptance: demonstrate recovered regressions fail on the base; preserve dependency
alignment and all newer behavior; complete focused and full CLI tests/typecheck/lint,
independent source review, and coordinator consolidation. No merge/push/deployment.
Excluded seven feature streams remain read-only. Current user directive explicitly
authorizes CLI/optional-relayer fixes beyond the previous Pages-only milestone.

# Policy-client validation recovery — 2026-11-19

Worker: contract_security, Caveman investigate-first; coordinator-owned remaining work.
Branch: `chatgpt/ghostpay-policy-client-20261119`, base `0249b30c`.
Owned paths: #211 G1/N09–N11 changes under `packages/policy-scheme/src`, that
package README, `apps/web/src/features/policy`, exact required policy locale and
security-key additions, scoped policy API documentation, this claim and handoff.
No dependency manifests, protocol/domain/typehash changes, numerical delay-policy
changes, excluded privacy/recovery implementation or source-PR mutations.
Acceptance: recover source-pinned validation and signing checks first; reproduce
their historical regression tests, then recover send binding and existing asset
coverage checks; run affected suites with unchanged assertions/thresholds, obtain
independent coordinator review and consolidate. Original #211 is read-only.
Status: existing recovery complete with one test-only Anvil fixture correction
needed by the newly enforced proof check. Baselines reproduced 14 library,
4 send-binding, 5 record-coverage and 6 UI/logic failures. Full policy package
118/118 (all 7 Anvil cases), focused web/security keys 121/121, library
typecheck/build, scoped lint, locale checks, secret scan and independent
coordinator source review pass. Coverage thresholds and budgets are unchanged.
Only client SEC11 mitigation is recovered; unknown asset coverage and protocol
owner decisions remain open. See `docs/handoffs/agents/POLICY_CLIENT_20261119.md`.

# Confidential-router return-data defense recovery — 2026-11-19

Worker: contract_security, Caveman investigate-first, remaining-work coordinator.
Branch: `chatgpt/ghostpay-confidential-forward-20261119`; base
`198aa5baff22272453733a0f3dcfcac0e0994eec`. Owned paths:
`packages/confidential-contracts/contracts/GhostPayConfidentialRouter.sol`,
`contracts/mocks/ReturnBombStealth.sol`, and `test/router.test.ts` within that
package; this registry and the scoped handoff. Recover only A-3 from PR #220,
source `cd54452991b9f4e193d98c1365b9dbc4eb838f3b`; no A-1/A-2/D-1 protocol changes.
Acceptance: reproduce the excessive caller-side memory cost, recover the no-copy
native-buffer call, run the complete package's original checks/budgets and an
independent review, then give the coordinator the verified commit for integration.
No deployment, source-PR update, main merge, analyzer-policy change or real funds.
Status: original A-3 regression reproduced (116,145 extra gas) and passes after
the exact historical three-file recovery. Typecheck, formatting, secret scan and
independent coordinator source review pass. Full default and 768-MiB-capped runs
both exit 137, as does a mutex-protected seven-case selection after two passes;
whole-package qualification is explicitly blocked locally, not claimed passing.
See `docs/handoffs/agents/CONFIDENTIAL_FORWARD_20261119.md`.

# Self-host image defaults and Compose validation — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-selfhost-pins-20261119`;
base `bda57c32`. Owns `deploy/.env.example`, `deploy/docker-compose.yml`,
`deploy/tor/Dockerfile`, `deploy/selftest.sh`, `deploy/README.md`, the explanatory
comment in `deploy/nginx/security-headers.conf`, one config validation step in
the existing `ci.yml` job, and the scoped handoff/evidence.
Acceptance: recover verified image digest defaults and their regression checks
from PR #209; validate the public Compose configuration with all services enabled
without resolving service env files or invoking image/container lifecycle actions.
Preserve explicit operator execution, release gates and existing workflow policy.
No schedules, credentials, version migration, deployment or live-host claim.
Status: baseline selftest fails on exactly three unpinned defaults; corrected
selftest passes. Official checksum-verified Compose 5.8.0 validates public config
with and without onion. YAML/shell, header parity and 114 action pins pass.
Independent coordinator source review passed; hosted and live-host acceptance remain separate.

# Full-severity Slither visibility — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-slither-visibility-20261119`;
base `f3c38f3f`. Owns only the existing nightly Slither job, this claim and
`docs/handoffs/agents/SLITHER_VISIBILITY_20261119.md` with evidence.
Acceptance: selectively recover PR #209/08c26b12 reporting of low, informational
and ignored findings, preserving the existing Medium/High gate byte for byte,
all workflow triggers and every unrelated job. No release-test relaxation,
new schedule, finding suppression, analyzer-disposition approval or deployment.
Status: workflow structure, shell syntax and 114 pinned action references pass.
Report flags verified against the published pinned Slither wheel; no full local
analyzer campaign claimed. Independent review and hosted qualification pending.

# Existing merchant and IndexedDB CI coverage — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-example-idb-ci-20261119`;
base `bd6b26dd`. Owns the existing `ci.yml` example/test steps, this claim,
and `docs/handoffs/agents/EXAMPLE_IDB_CI_20261119.md` with evidence.
Acceptance: execute all existing example test files and the webhook selftest in
the current build/check job, and the existing two-tab IndexedDB browser check in
the full-profile browser job. Preserve existing tests, skips, timeouts, permissions,
release gates and publishing policy. No schedules, package metadata or app runtime
changes. Record actual local and hosted qualification limits before integration.
Status: 60/60 example tests and webhook selftest pass; local Chromium launch is
blocked by socket EPERM before IDB assertions. Source review passed; hosted IDB
acceptance remains required. No gate was skipped or weakened.

# Deployment tooling and registry documentation parity — 2026-11-19

Worker: backlog_ci; branch `chatgpt/ghostpay-deployment-docs-20261119`;
base `5128da10`. Owns `packages/chain-adapters/TODO-VERIFY.md`, its README's
verification-status pointer, `docs/operators/testnet-runbook.md`, this claim and
`docs/handoffs/agents/DEPLOYMENT_DOC_PARITY_20261119.md`.
Acceptance: correct F-DEP-04/F-DEP-05 stale source claims, distinguish the client
registry from the deployment-script allowlist, preserve signed-manifest review
and explicit deployment authorization, and retain all unresolved live acceptance.
No contract, deployment, package metadata, public RPC or signing changes.
Status: source parity corrected; configuration matrix and 14 relative links pass.
Strict release readiness remains blocked. Independent coordinator review requested.

# Deployment verifier policy implementation parity — 2026-11-19

Worker: backlog_ci; independent reviewer: coordinator. Branch:
`chatgpt/ghostpay-verifier-parity-20261119`; base: `264cf86b`.
Owned paths: `packages/chain-adapters/src/verify.ts`, its focused tests,
this claim and `docs/handoffs/agents/DEPLOYMENT_VERIFIER_PARITY_20261119.md`.
Acceptance: reproduce F-DEP-02 missing policy implementation bytecode verification,
reject missing or mismatched implementation code against the existing signed manifest,
and preserve configured provider agreement. No ABI, manifest format, provider selection,
or deployment changes. Record focused regression, typecheck and lint evidence before
independent review and coordinator integration.
Status: 21 pass / 3 fail red, 51/51 focused deployment green, 24/24 final verifier
green, scoped typed lint and package TypeScript pass. The coordinator independently
reviewed the source. Failed resource/lint attempts are retained in the handoff;
combined hosted qualification and integration remain coordinator owned.

# Pages smoke render-error regression — 2026-11-18

Worker: security_recovery, independent Pages review lane. Branch:
`integration/ghostpay-pages-smoke-render-errors-20261118`. Base:
`e85db1ef942bda9cb54317a6c036a22484b46ff9` (coordinator integration source).
Owned paths: `scripts/pages/smoke*`, a narrow render-error observer and its Node
regressions, this claim, and `docs/handoffs/agents/PAGES_SMOKE_RENDER_ERRORS_20261118.md`.
Acceptance: a caught, uncaught or recoverable React root error must fail the Pages
smoke check even when navigation still renders; arbitrary console messages and
error payloads must not be copied into the new failure record. Preserve existing
page-error, request-failure and foreign-request checks and manual deployment policy.
Run low-memory Node regressions only while the coordinator builds libraries.
No browser-pass claim, app/runtime change, remote mutation or deployment.
Status: source `a77cadbb7deca0cb2bf8829ed1215962bb8b4d9f` passes all 9 new
entrypoint regressions and the complete 95-test Pages Node suite with one worker;
the CI reviewer independently cleared the source and reran all 9 regressions.
The tests use synthetic browser events, so actual Chromium/hosted acceptance remains
pending. See `docs/handoffs/agents/PAGES_SMOKE_RENDER_ERRORS_20261118.md`.

# Pages beta consolidation continuation — 2026-11-18

Worker: ChatGPT coordinator, with independent branch archaeology, recovery/security and CI reviewers.
Branch: `integration/ghostpay-pages-completion-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: consolidation conflicts and Pages security/privacy integration, focused regression tests,
this registry, and `docs/handoffs/pages-completion-20261118/`.
Follow-up: the coordinator owns the legacy portable keystore's temporary passphrase-byte lifetime and its focused
regression in `packages/ux-vault/src/keystore-portable*`; archaeology independently reviews the change.
Recovery, dependency and security-tooling implementation use separate worktrees and branches.
Existing remote PRs are read-only source inputs. The #209 extraction includes Pages hosting protections,
root error reporting and backup navigation; release-test relaxation and unrelated workflow updates are excluded.
Acceptance: preserve non-custodial client-side key handling and testnet restrictions; integrate only reviewed changes;
execute focused and combined tests; obtain independent review; record source and evidence before any main merge.
No deployment, release, branch deletion, force-push, or paid agent workflow activation is authorized.
This restores the coordinator claim first committed in `b828b44e`, dropped during registry reconciliation.
Qualification update: the full `npm test` command completed at `e8c77e7e8699dd16b86b7a1ff90b834594d07105`
with exit 0 on Node 22.23.5/npm 11.21.2. The identical runtime tree was published as draft PR #238 at
`9bad95e5cc0ee73f5adb8d2c587161074b21e080`. Documentation integration `e033855b` changes no runtime/test input.
The coordinator owns final result/diagnostic reconciliation in the completion packet and the Pages README's
HTTP/CSP reachability clarification. Subsequent published-runtime full/lean builds, Pages static/loopback checks,
development release build and two-clean-clone reproducibility passed. The final isolated web lint retry exited 137;
actual browser attempts failed before application assertions. Strict Mythril, full dependency audit and final
candidate hosted/security gates remain unresolved. Completed execution and independent evidence review are in
[the completion packet](../handoffs/pages-completion-20261118/COMPLETION_REPORT.md); the PR body carries the final
documentation head, transport mapping and refreshed CI observation. No main merge or release is qualified.

# Pages privacy consolidation — 2026-11-18

Worker: ChatGPT coordinator. Branch: `integration/ghostpay-privacy-20261118`.
Base: `305ccb0d570c27a47435083059492edc819a0101` (reviewed narrow repairs staged from main).
Owned paths: privacy changes from #222, #228, #230 and #233, their integration conflicts and focused regressions.
Acceptance: preserve v4 checkpoint names and explicit balance-request lifecycle from #235/#231; encrypted invoice default,
minimized receipts, per-dispatch RPC policy and session-only sweep linkage must pass combined tests and independent review.
All publication, main merge, hosted qualification and release actions remain coordinator gated.


# Pages idle-clock integration — 2026-11-18

Worker: ChatGPT coordinator, with independent privacy-review implementation and source review.
Branch: `chatgpt/ghostpay-pages-idle-clock-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: `apps/web/src/AppShell.tsx`, `apps/web/src/AppShell.idleClock.test.tsx`, and the idle-clock handoff.
Acceptance: reproduce clock rollback on current main, retain sleep-aware wall-time checks, add monotonic expiry,
preserve sole-copy key recovery policy, pass focused shell tests and scoped lint, then require exact-head CI.
Source `613667be` is now staged in the consolidation branch; final combined-head qualification remains pending.

# Session-only sweep destination history — 2026-11-18

Worker: ChatGPT security review, Caveman workflow. Branch: `chatgpt/ghostpay-sweep-ledger-memory-20261118`.
Base: PR #222, `2bc2098298d90928eb1acafad969f28316bb05fc`.
Owned paths: sweep destination history source/tests, the two Sweep view recording call sites and focused tests,
the existing reuse-warning messages, user privacy guidance, this claim and the task handoff.
Acceptance: no source/destination linkage is serialized to browser storage; delete only the legacy plaintext key
without importing it; clear memory on app lock and seller-session change; reject delayed records from old epochs;
retain nonblocking reuse warnings within the active session. Persistence across sessions stays unavailable until an
encrypted, explicitly opted-in design is qualified. Signing and duplicate-send journal behavior remain unchanged.
Local verification complete: 171 affected tests, focused lint, whole-web typecheck and i18n check passed.
Evidence and remaining integration gates: `docs/handoffs/GHOSTPAY_SWEEP_LEDGER_PRIVACY_20261118.md`.

# Pages Spec 18 recovery integration — 2026-11-18

Worker: security_recovery (independent integration lane). Branch:
`integration/ghostpay-recovery-completion-20261118`. Base:
`dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: Spec 18 export/recovery components and tests, paymentKeyExport and stealthExport
helpers, exact credential/session additions, ux-vault portable codec and tests, recovery
scripts/vectors, recovery i18n entries, exact Scan/SellerKeys wiring, and this handoff.
Inputs: #213 `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` and #229
`18110015e99efbeb4f23d47cd88bd6f917010108`. The coordinator owns unrelated
privacy/session/scanner changes and final integration. Acceptance: inspect current sources,
reconcile both PRs onto live main, reproduce and fix concrete defects, run complete focused
codec/recovery/vault checks plus web typecheck and scoped lint, and record exact evidence.
No remote mutation, deployment, release, mainnet enablement or browser-pass claim.
Status: integrated and independently reviewed at code/test source
`f2ed1ed4240f91ef2fb41f3edaf3ea6546e87e60`. Web recovery selection 135/135,
core crypto 75/75 and complete vault coverage 348/348 pass; the independent
export/i18n selection passes 24/24. Node recovery passes 15 cases, with the
separate raw-key interoperability case passing on available Foundry 1.5.1 only.
Full-web typed lint remains blocked by executor memory; actual browser, pinned
Foundry 1.8.5 and final combined/hosted qualification remain pending. See
[the exact-source recovery handoff](../handoffs/agents/PAGES_RECOVERY_INTEGRATION_20261118.md).

# Recovery cancellation review — 2026-11-18

Worker: ChatGPT recovery review agent using the Caveman workflow. Branch:
`chatgpt/ghostpay-recovery-review-20261118`; base PR #213
`ebf7c92c3be1c7aebd37fc58b5567e114fb932fc`. Root coordinates integration.
Owned paths: `apps/web/src/components/StealthExportRecovery.tsx` and its test;
`docs/user/recover-stealth-payment-keys.md`; the scheme-1 boundary in the format reference and recovery script help;
the three existing payment-export warning strings in `apps/web/locales/{en,es,ja,ar}.json` (coordinator-approved);
this claim and the recovery review handoff.
Acceptance: reproduce a cancelled master-import request affecting a later export, bind replacement authorization
to the selected export and current operation, preserve lock/session guards, and verify the focused recovery suites.
Document the scheme-1 viewing-key plus payment-private-key spending-authority boundary. Other locale, session,
Scan and CI paths remain coordinator-owned. No remote mutation, deployment, release or real funds.

# Spec 18 key portability + consolidation follow-through — 2026-11-18 (ACTIVE)

Worker: Claude Code cloud session `ghostpay-consolidation-9xhtxg` (this session promoted PR #203 to `main` as
`5467c158`). Spec 18 work started 06:27 UTC from candidate `71abc7e5` (tree equal to `main` `5467c158`) on local branch
`spec18-local`; pushed to `claude/ghostpay-consolidation-9xhtxg-spec18`. Committed so far: format reference `a62f489d`,
codec `5c0a12cc`, independent recovery script + K04 anvil interop + user guide `b5762d19`; web UI, e2e, independent
review and verification in progress.

| Lane | Owned paths (exclusive) | Acceptance |
|---|---|---|
| Spec 18 K01-K06 (codec, recovery, web UI, e2e) | `docs/specs/18-stealth-keypair-export-formats.md`; `packages/ux-vault/src/stealth-export-portable*.ts`, `packages/ux-vault/src/{portable,portable-errors}.ts` export/error lines; `test-vectors/{generate-stealth-export.mjs,stealth-export.json}`; `scripts/recovery/**`; recovery user-guide page; `apps/web/src/lib/{stealthExport,paymentKeyExport}.ts` (+ tests), re-authentication helper lines in `apps/web/src/lib/{session,keyVault}.ts`; spec 18 entry points in `apps/web/src/views/{Scan,SellerKeys}.tsx`; `apps/web/src/components/StealthExport*.tsx`; `apps/web/e2e/stealth-export.spec.ts`; `stealthExport.*` / `error.stealthExport.*` keys in `apps/web/locales/*.json` and `apps/web/src/i18n/securityKeys.ts`; one glob added to the ts-test shard-0 script-test line in `.github/workflows/ci.yml` | Spec 18 acceptance list on one exact SHA; independent review; external wallet/device rows pending |
| #204 reconciliation (PR #206) | `CLAUDE.md`, `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md`, the ci.yml shard-0 script-test line | Merged after green CI |
| Security/release reconciliation (PR #212) | `docs/audits/{mythril-reevaluation,echidna-and-fee-token-review,ci-supply-chain-review}-20261118.md`, `docs/handoffs/consolidation-20261118/{OWNER_ACTION_PACKET,STATIC_BETA_DECISIONS}.md`, `docs/pages/PAGES_QUALIFICATION_20261118.md`, `scripts/contract-analysis/mythril-disposition-check.mjs` + test; already made before seeing #209's claim: `.github/dependabot.yml` (CI-06), `apps/web/package.json` `validate:deployments` script + `apps/web/src/validateDeploymentsScript.test.ts` + `apps/web/deployments/README.md` (B03) | Merged after green CI; #209 lanes B1/B4 may skip CI-06 and B03 |

Not claimed (left to PR #209 / #211): SEC-09/SEC-10 Pages origin and loopback CSP, every other #205 row.
Out of scope: deployment, signing, release, mainnet, contract source changes, branch deletion, owner decisions.


# Pages beta security tooling extraction — 2026-11-18

Worker: ChatGPT branch-archaeology/security-tooling worker. Coordinator: current Pages integration session.
Branch: `integration/ghostpay-security-tooling-20261118`; base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.

Owned paths: standalone Mythril disposition helper and its tests; web deployment-validator npm entrypoint and
regressions; local audit static helper and tests; HTTPS-only pinned download commands; bidirectional-character
source escapes; shared RPC fetch metadata regression; viewing-key boundary regression and directly related docs;
agent workflow path-policy and untrusted-input hardening plus focused tests; cached-solc integrity verification.
Source inputs: #212 + #225, #224 + #226, and selected security changes from #220. These branches remain read-only.

Acceptance: preserve source pins, current action pins, runner selection, existing workflow triggers and approval
gates; the Mythril helper remains unwired; reproduce applicable pre-fix regressions and run focused Node/Vitest,
typecheck, lint and security checks. No contract, D-1 proof-design, deployment, publication or gate-policy change.
The coordinator owns browser privacy/receipts, shared integration and remote writes. RPC fetch options overlap #222
and must resolve to the same `omit`/`no-referrer`/`no-store` behavior.

# Repository consolidation — 2026-11-18 (historical)


Coordinator: Claude Code session (integration owner). Integration branch: `nodata/wizardly-allen-qwol6u`, created from
unified `beb525dd` (tree `36177d29`), main ancestry merged at `f5e10f84` (tree unchanged), Pages #200 lineage merged at
`d39e304a`. The coordinator alone owns this branch, the consolidation ledgers under `docs/handoffs/consolidation-20261118/`,
`package-lock.json`, this registry and the merge sequence. Worker branches are local task branches based on `d39e304a`;
each commits only inside its owned paths and is integrated by the coordinator after review.

| Worker branch | Owned paths | Acceptance |
|---|---|---|
| `consolidation/20261118-reimport` | `apps/web/e2e/core-journey.spec.ts`, keystore import/session lifecycle source and focused tests only as diagnosis requires | Establish the cause of the #201/#202 verified-keystore reimport timeout with synthetic secrets; minimal regression-backed fix; original stale-session assertions and #202 control both execute and pass. |
| `consolidation/20261118-tagarchive` | full-profile `TagArchive` component and its focused test | Port #193 blocked-click regression; cleanup on throwing click; success and failure messaging verified; lean bundle untouched. |
| `consolidation/20261118-specs` | `docs/specs/**`, `docs/future/privacy-architecture/**` | Integrate #190/#191; spec 18 canonical; privacy 5k corrected; unrelated future specs remain proposed. |
| `consolidation/20261118-cigates` | `.github/workflows/release.yml`, `contract-analysis.yml`, `nightly.yml`, workflow tests/runbook | Source-matched analyzer success becomes an enforced promotion condition; missing/skipped/cancelled evidence fails. |
| `consolidation/20261118-echidna` | `packages/contracts/test/echidna/**`, Echidna config/corpus/runner tests | Demonstrate >= 3 successful native policy withdrawals without lowering the threshold or weakening properties. |
| `consolidation/20261118-mythril-expiry` | new expiry-focused contract tests, expiry disposition record | Individual dispositions for the three expiry-timestamp Mythril records. |
| `consolidation/20261118-mythril-factory` | new factory-focused contract tests, factory disposition record | Individual dispositions for the eight factory/OpenZeppelin call-path Mythril records. |

Out of scope for every worker: protected-main merge, deployment, release signing/publication, Wiki publication, branch
deletion, real funds, new custody/authority surfaces, and spec 18 key-export implementation (next phase).

The ChatGPT "zero-codex" rotation automation is an active external writer on `chatgpt/zero-codex/*` branches (observed
pushes 2026-11-18 01:39-01:44 UTC). Those branches are read-only inputs here; heads are rechecked before integration.

> Current coordination status (2026-11-16): all listed source lanes have completed and their reviewed changes are integrated through `2962554d`. The claims below preserve history. Final hosted candidate qualification and development artifact verification are coordinator-owned; current gates are recorded in [the authoritative ledger](../handoffs/GHOSTPAY_MASTER_COMPLETION_LEDGER.md).

## Team H dedicated BTC scan worker — 2026-11-16

Worker: btc_worker, Caveman. Branch: `codex/unified-btc-worker`; base `a94989ce`.
Owned paths: BTC scan worker/client/protocol, scan.ts, BtcView and focused tests, browser acceptance, worker handoff.
Acceptance: responsive cancel through worker termination; bounded messages; ephemeral scan key copies; checkpoint acknowledgments preserve encrypted CAS commits; restored matches require fresh validation; no spend secret sent to worker or secrets sent over network/storage. No mainnet enablement or release claim.

## Team A hosted-CI reconciliation repair — 2026-11-16

Worker: ci_reconciliation agent, Caveman. Branch: `codex/unified-ci-reconciliation`.
Base: `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: CLI reconciliation source/test/helper files and `apps/web/src/components/ReconciliationLedger.invoices.test.tsx`; related reconciliation sources only after coordination.
Acceptance: reproduce hosted CLI and web matching failures, preserve canonical block-time semantics, repair their cause, pass focused and broader affected tests, typecheck/lint, independent review and source-pinned handoff. No dependency, BTC or other web-test ownership.
Status: completed at product source `e79821d3`, compiled fixture `612d3c35`. Full CLI 570/570, compiled acceptance 21/21, native devnet acceptance 124/124, browser ledger 36/36 and independent time regressions 9/9 passed. Coverage, typechecks, scoped lint and build passed. See `docs/handoffs/agents/TEAM_A_CI_RECONCILIATION.md`.

## Team H encrypted BTC scan continuity — 2026-11-16

Worker: btc_persistence agent, Caveman. Branch: `codex/unified-btc`; base `f783f14e`.
Owned paths: `apps/web/src/features/btc/scan*`, `BtcView*`, wallet documentation and scoped tests; package scan-state interfaces only if required.
Acceptance: opt-in encrypted wallet/network-scoped IndexedDB state; per-block crash/cancel resume; canonical reorg rollback; no persistent secret/tweak bytes; restored outputs require fresh source/header validation before sweeping; stale-session and cross-tab writes fail closed. Reuse existing HKDF/AES-GCM and transactional CAS patterns. No mainnet enablement or external-node qualification claim.

# Unified completion coordinator — 2026-11-16

Owner: root coordinator. Branch: `codex/ghostpay-unified-completion`; base `0c4c3c8d951a9d6e71affcdaa26478911c8037f1`.
Owned paths: integration conflicts, locale/security catalogs, master completion ledger, final evidence and handoffs.
Acceptance: preserve source ancestry and verified behavior; classify new identity/privacy disclosures; run combined-head checks and record remaining gates. Worker branches own their separate modules; no protected-main merge, deployment, signing or release.

## Historical and worker claims

## Ops-monitor W3 streamed artifact cap — 2026-11-16

Worker: current Codex child agent. Branch: `codex/ghostpay-ops-response-cap-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `packages/ops-monitor/src/fetcher.ts`, focused fetcher tests, this registry, task handoff.
Acceptance: enforce release-artifact byte cap while streaming; refuse oversized declared lengths without consuming the
body; cancel rejected streams without waiting on a remote cancel promise; preserve exact-limit bytes, malformed/missing
length handling and UTF-8 bytes split across chunks.
Status: implemented. Full package suite passes 113/113 with 98.01% statements, 93.59% branches, 97.72% functions and
99.78% lines; package typecheck/build and focused ESLint pass. Full package lint terminated with exit 137; external
HTTP receiver acceptance was not run.
## Team A unified reconciliation review — 2026-11-16

Worker: reconciliation agent, Caveman workflow. Branch: `codex/unified-reconciliation`.
Base: `27852ba898968a08f7d7c448fac8b19058189281` (PR #186).
Owned paths: chain-adapters logs/rpc/scanVerify and tests; vault reconciliation modules/tests; web scanner and reconciliation libraries/tests.
Acceptance: canonical header timestamps survive scanning and encrypted persistence; provider disagreement, reorg, imported history, duplicate conflicts and finality remain fail-closed; exact bigint arithmetic is preserved. Run targeted tests, correct reproduced defects, and provide a source-pinned handoff. No public-chain writes or release qualification claim.

## Historical and worker claims

## Canonical block-time reconciliation — 2026-11-16

Worker: canonical-time implementation agent. Branch: `codex/ghostpay-canonical-time-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: chain-adapter block references and announcement scanner; portable reconciliation record/matcher;
reconciliation tests and related security-key/locale entries if new message key is needed; this registry and handoff.
Acceptance: only timestamp from a canonical block header matching announcement block number/hash can establish
invoice timing; new verified late-scanned pre-expiry payments can match; post-expiry payments remain ambiguous;
legacy/imported records without block timestamp never become exact through wall-clock fallback; optional field keeps
old vault data readable; reorg and backup/import behavior remain sound.
Status: implementation and regression coverage complete. `git diff --check` and locale JSON/key parity pass; `npm ci --ignore-scripts --no-audit --no-fund` exited 137, so focused tests, typechecks and build cannot run here (Vitest and TypeScript unavailable).

## Unified registry ENS lookup — 2026-11-16

Worker: Team B registry. Branch: `codex/unified-registry`. Base: `365a1c38`.
Owned paths: chain-adapters registry and ENS helpers/tests/index exports; web registry view/tests;
`docs/handoffs/agents/TEAM_B_REGISTRY_UNIFIED.md`.
Acceptance: explicit ENS lookup uses only the selected, already-validated Ethereum or Sepolia RPC;
normalizes names, validates returned addresses and meta-addresses, never follows offchain gateways,
and rejects stale UI results. No cross-chain fallback or delegated signing/sending UI is added.
Locale additions are coordinated with the integration owner.
## Unified Team D — verified matrix — 2026-11-16

Worker: matrix; branch `codex/unified-matrix`; base `365a1c38`.
Owned paths: `packages/chain-adapters/config/matrix.json`, `scripts/check-chain-matrix.mjs`,
`scripts/lib/chain-matrix.mjs`, companion tests, release gate wiring and operator matrix documentation.
Acceptance: all configured chains/tokens/feeds have provenance-aware cells; malformed or mismatched data fails;
release verification refuses every enabled chain with an unverified required cell. Existing development configuration
remains available. No deployment addresses, code hashes, source attestations or runtime verification are invented.
Status: implementation in progress; external deployment/RPC acceptance remains pending.
## Unified observability review and completion — 2026-11-16

Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source.
Status: matrix implemented at `aa1d5153`; quote-decimal agreement implemented at `39f79175`. Targeted checks passed; final combined web typecheck/CI and external deployment/RPC acceptance remain pending.
Follow-on ownership: `packages/chain-adapters/src/quote.ts` and tests; `apps/web/src/lib/pay.ts` and tests.
Acceptance: configured feed decimals must agree with the RPC result before any quote/payment request is produced;
generic standalone `readPrice` callers may omit the expected-decimals parameter.
## Team B/I template issuance follow-on — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `e84e72d9`.
Owned paths: merchant template issuer component/helper/tests, merchant profile panel, SDK v2/tests,
`invoiceCreate.ts` exact-second expiry support and tests, related specification/user docs. Catalogs remain coordinator-owned.
Acceptance: only a matching loaded signer with verified backup or prior explicit waiver may create a new signed
invoice from a verified template; exact minor amount, chain/token allowlists, requested expiry and stale-state guards
must hold. Optional amount requests require signed `allowAmount`; they never edit an existing payer invoice.

## Team B/I unified merchant embedding — 2026-11-16

Worker: merchant agent; branch `codex/unified-merchant`; base `365a1c38`.
Owned paths: `App.tsx`, merchant-profile components and tests, `embedHost.ts` and tests,
`merchantIdentity.ts` and tests, embedding documentation. Catalog changes belong to the coordinator.
Acceptance: explicit HTTPS loading with bounded/cancellable fetch; verified signed profile presentation;
user-confirmed source-origin/full-key pins, mismatch warnings without silent replacement; signed template display
without changing or authorizing an invoice. Remains excluded from the lean Pages profile.
Worker: Caveman Team C, branch `codex/unified-observability`, base `c738f96e2f1a0dfef9003ae29ad636b03cf74b09`. Owned paths: `apps/relayer/**`, `docs/operators/relayer-monitoring.md`, and this worker handoff. Acceptance: qualify the private metrics/stats listener and signed webhook, repair reproduced resource/authentication/lifecycle defects, and complete spec-07 alert detectors with bounded data and no user-data leakage. Public deployment and external scrape acceptance are excluded. Other teams own web, chain-adapters, and vault source. Completed through `364efaf3902351886eb2baa739e8e0dc70101617`: bounded webhook lifecycle, rejection detector, exact gas/loss/fee and quote counters, latency histograms, log severity and native authenticated scrape. Full relayer gate 443/443 with zero skips; coverage, typecheck, build and full lint pass. Independent agent review found no blocker. Provider-disagreement and stale-feed detectors remain dependent on absent provider/feed inputs. See `docs/handoffs/agents/TEAM_C_UNIFIED.md`.

# Active AI work registry

## Registry bundle egress correction — 2026-11-16

Worker: Team B registry. Branch: `codex/fix-registry-bundle-egress`. Base: `53d2163be5f7eaa8592750649d54df06b133b80c`.
Owned paths: `packages/chain-adapters/src/registryEns.ts`, its tests, this claim and the correction handoff.
Acceptance: preserve selected-RPC-only ENS behavior while eliminating the viem PublicClient/default-chain dependency
graph; reproduce the unchanged full and lean bundle guards before correction, then pass both real builds and scans.
No host allowlist, source guard, security policy, RPC default or test threshold may be weakened.

## Relayer observability spec 07 completion — 2026-11-16

Worker: current Codex worker. Branch: `codex/ghostpay-observability-20261116`, base
`2de9b0c5764cb1fb80a648e18d269b4d91210dcc`.
Owned paths: `apps/relayer/src/config.ts`, `server.ts`, `runtime.ts`, `alerts.ts`, `metrics.ts`, `metricsServer.ts`,
their focused tests, `apps/relayer/README.md`, `docs/operators/relayer-monitoring.md`, this registry.
Acceptance: add opt-in loopback metrics listener, authenticated `/metrics` and `/v1/stats`, signed HMAC-SHA256
alerts with 15-minute per-event/chain dedupe, and safe shutdown. Preserve request-path behavior. Add endpoint,
signature, privacy, SSRF and shutdown tests.
Handoff: local implementation committed on this branch. `git diff --check` passes. `npm ci --ignore-scripts --no-audit --no-fund` exits 137. Targeted Vitest cannot load `vitest/config`; typecheck lacks `tsc`; lint lacks `eslint`. No test suite, typecheck, lint, real Prometheus scrape, or receiver acceptance completed. Keep spec 07 partial until real scrape and receiver acceptance pass. Exact source pin is in task handoff.

## Merchant identity localization and security classification — 2026-11-16

Worker: current Codex session using Caveman workflow. Branch: `codex/ghostpay-caveman-followup-20261116`, base
`4ee9dd770826e705cb8c2437a53cf6714a003635`.
Owned paths: `apps/web/locales/{es,ja,ar}.json`, `apps/web/src/i18n/securityKeys.ts`,
`apps/web/src/i18n/securityKeys.test.ts`, this registry.
Acceptance: match all source catalog keys in locale drafts; classify merchant identity verification disclosures as
security-critical so unreviewed translations cannot replace English; pass catalog and security-key regressions.
Status: locale/security source fix implemented. GitHub logs confirmed 12 locale-key validation errors and the exhaustive security-key census failure on the 4ee9dd77 candidate. Reviewed #178 recovery: current source already revokes its Blob URL and removes the anchor on click or append failure; current tests cover both paths, so #178 source change is superseded. Local dependency installation is unavailable (npm ci exits 137); catalog shape and diff checks remain available. Exact-head hosted CI is still required.

## Registry builder acceptance — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-registry-lifecycle-20261116`, base `7a208005`.
Owned paths: web `features/registry/registry.anvil.test.ts`, this record, continuation evidence.
Acceptance: the recovered builders execute against the local reference registry; a valid delegated registration works,
replay fails, nonce invalidation rejects a previously signed update and fresh authorization succeeds. No public-chain
transaction, wallet signing UI or production contract modification.
Completed: five native Anvil/reference-registry tests passed with zero skips, web typecheck and focused lint passed.
Local reference compiler is solc 0.8.38; hosted pinned-compiler checks remain required.

## Merchant profile stream cap — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-profile-cap-20261116`, base `beb99464`.
Owned paths: web `embedHost.ts`, `embedHost.test.ts`, `e2e/reconciliation.spec.ts`, and this record.
Profile tests: 47 plus 77 integration/privacy cases passed; web typecheck/full lint passed.
Also scope the reconciliation browser assertion to the invoice identity paragraph after the amount summary added a
second nested hint. Preserve the digest, language-change, backup import and lock assertions. Baseline #182 browser
CI reproduced the strict-selector failure; final browser execution remains required.
Acceptance: enforce the existing 8192-byte profile limit during streaming, cancel rejected responses without waiting
on remote cancellation, preserve signed-profile verification and fetch privacy options, and test exact boundaries,
lying/missing length headers and split UTF-8. No UI/network enablement or new endpoint is introduced.

## Custody recovery — 2026-11-16

Worker: current session. Branch: `codex/ghostpay-custody-caveman-20261116`, base `47f92f6f`.
Owned paths: `keystore-portable.ts`, web `keyVault.ts`, `keyVault.test.ts`, `keystore.test.ts`, and the SellerKeys comment.
Recover the two isolated custody fixes from `dded4c02` and `f12f9418`, reproduce their regressions against the published
candidate, then qualify normalized password policy and verified-copy checks before integration. No other local branch
payload is imported. Recovery source and final checks must be recorded in the continuation handoff.

## Caveman continuation — 2026-11-16

- Worker: current Codex session, sequential implementation and review.
- Branch: `codex/ghostpay-caveman-completion-20261116`.
- Published base: `b4be8866f6ff883fbbedc49be88b5b251a7d270e` (#179). Recovery inputs: #180 and #181.
- Owned paths: `packages/ux-vault/src/reconciliation-amounts*`, `portable.ts`; web invoice summary and reconciliation ledger components/tests; associated locale/security keys; registry builder verification; relevant completion documentation.
- Acceptance: exact bigint invoice totals from explicit live final-at-scan links; scope-wide conflict rejection and deduplication; no inferred linking or settlement claim; UI wiring and translation safeguards; package builds, regression/property tests, typecheck and lint. Validate recovered analyzer and registry helpers before publishing.
- Status: implemented; final hosted checks pending. Existing source branches remain unchanged. This record supersedes no other worker claim.

The same branch also owns integration review of #164's `payer-sponsor`, `pool-relayer`, QR warning and source-gate
changes. Acceptance includes preserving both sets of linear-parser regressions and rejecting invalid queue limits.

This file is a coordination template, not a live lock service. Always inspect open PRs and branch heads before relying on it.

| Worker | Branch | Base SHA | Owned paths | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- |
| Codex browser cleanup worker | `codex/ghostpay-download-cleanup-20261116` | `f6728033258edf203f35fe1a064660fb6ff233ce` (test-only #178) | `apps/web/src/components/Common.tsx`; `apps/web/src/components/Common.test.tsx`; this registry | Failed downloads preserve the thrown error and release the Blob URL and temporary anchor; successful downloads retain the deferred revocation window | Implemented; test-only `1ed3926b` reproduced 2 failures / 12 passes, corrected suite 14/14 passes and targeted ESLint passes. Combined-tree typecheck/build/CI still required. |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | Integrated locally; coordinator owns final combined-head verification |

| Codex historical preflight review | `codex/ghostpay-policy-preflight-20261116` | `d239d520294513114e686bd2d2e94422436fb327` | Read-only policy send/journal assessment; this registry and consolidation ledger | Verify whether historical remediation is safely recoverable; run current behavior tests | Complete: historical patch already intentionally rejected; 37/37 focused tests passed |
| Codex consolidation worker | `codex/ghostpay-integrate-pages-20261116` | `d26418c2539619fb75783a82886a96971142d226` | Merge conflicts in incoming Pages fixes; audit documentation; `docs/consolidation/PAGES_INTEGRATION_2026-11-16.md` | Preserve broad integration plus Pages fixes through #177; source-pin decisions; leave final combined-head checks to coordinator | In progress |
| Codex linear parser worker | `codex/ghostpay-linear-parsers-20261116` | `30733000` | `packages/i18n/src/ux/readability.ts`; readability regression tests; `packages/ops-monitor/src/fetcher.ts`; fetcher regression tests; this registry | Remove confirmed polynomial regex paths while preserving sentence and URL semantics; pass adversarial-input regressions and seeded equivalence checks | Implemented. Test-only `28a94f25` reproduced both performance failures. Corrected full suites: i18n 213/213, ops-monitor 106/106, coverage gates pass; 2,000 seeded equivalence cases pass; both typechecks and i18n lint pass. Ops-monitor lint terminated by local memory limits (exit 137); CI required. |

Incoming Pages #173–#177 records are preserved in their source history; their fixes are integrated here for combined-head validation. This branch owns only consolidation, not the original workers’ branches.

Workers should update their task-branch copy and communicate ownership through the PR description. Do not treat absence from this table as proof a path is free.

| Fuzz harness QA | `codex/ghostpay-fuzz-harness-20261116` | `d26418c2539619fb75783a82886a96971142d226` | `packages/contracts/scripts/run-echidna.sh`, `scripts/tests/echidna-runner.test.mjs` | Reject missing/duplicate/unknown property results and abnormal exits; require all real properties passed and all canaries failed; validate with offline executable fixtures | Complete: 13/13 offline runner regressions passed; bash syntax and diff checks passed; real Echidna campaign not run |
| protocol_qa | codex/ghostpay-protocol-qa-20261116 | d26418c2539619fb75783a82886a96971142d226 | packages/ux-vault/src/reconciliation-portable.ts; apps/web/src/lib/reconciliationMatch.test.ts; apps/web/src/lib/reconciliationVault.invoices.test.ts | Imported historical annotations cannot reserve a current invoice; verified live links still reserve it; encrypted import/confirmation and bounded property regressions pass | Implemented; 3 regressions RED before fix, 28 matching/vault tests GREEN, 150 property cases, typecheck/lint passed; full coverage retry pending after worker SIGKILL |
| spec-acceptance worker | codex/ghostpay-pages-runtime-acceptance-20261116 | 30733000 | apps/web/e2e/pages-devnet.spec.ts; apps/web/e2e/devnet/pages.ts if needed; docs/handoffs/GHOSTPAY_SPEC_STATUS_2026-11-16.md | Built Pages artifact handles same-nonce cancellation without false payment success or duplicate send; seller profile survives browser-process restart with encrypted vault, checkpoint and reconciliation intact | in progress |
| security_notes | codex/ghostpay-security-20261116 | d26418c2539619fb75783a82886a96971142d226 | PolicyReceive.tsx; PolicyReceive.regression.test.tsx; policyTime.ts/test; relayer config.ts/config.test.ts/ops.test.ts/README.md | Preserve fresh withdrawal-attempt discovery, render arbitrary chain timestamps without throwing, require explicit development/test mode for ephemeral relayer state; targeted regressions and lint/typecheck | implemented; targeted verification complete; independent review requested |
| security_notes | codex/ghostpay-security-20261116 | 1acb7b79 | packages/cli/src/invoice-parity.test.ts; packages/payer-hiding-contracts/test/GhostPayErc4337.t.sol; security remediation note | Assert disabled-chain inspection classification and fuzz EntryPoint rejection of inverted paymaster windows without deposit expenditure | implemented; 11 CLI tests and 10,000 inverted-window fuzz cases passed |
| Mythril gate QA | `codex/ghostpay-mythril-gate-20261116` | `b4be8866` | `packages/contracts/scripts/run-mythril.sh`; `scripts/tests/mythril-runner.test.mjs`; this registry | Reject abnormal tool exits and malformed/incomplete reports; preserve pinned analyzer invocation; prove gates with offline executable fixtures | Complete: test-only `5e7c23c3` reproduced 9 failures / 10 passes; corrected Mythril fixtures 19/19 and existing Echidna fixtures 13/13 pass; bash syntax and diff checks pass. No real symbolic-analysis run claimed. |

## Coordinator status — 2026-11-16

All scoped worker patches above are integrated locally and source-reviewed in PR #179. The coordinator owns
final combined-head CI and the completion task ledger. Earlier in-progress statuses describe original worker
claims; they do not imply that those source branches were modified or that release gates passed.

| Codex registry builder worker | `codex/ghostpay-registry-recovery-20261116` | `b4be8866f6ff883fbbedc49be88b5b251a7d270e` | `packages/chain-adapters/src/registryDelegation.ts`; companion tests; `src/index.ts` export; scoped spec audit note | Match canonical ERC-6538 calldata; validate registrants/keys/signature bytes; retain opaque ERC-1271 signatures; no sends, signing, pins or UI enablement | Recovered from recorded source after environment loss. 40 focused tests/3 files and 200 seeded cases passed locally. Typecheck/lint killed137; build/export and recovered-tree verification pending. |

## Unified independent security and authority review — 2026-11-16

Worker: Team J (`security_inventory`). Branch: `codex/unified-audit`. Base: `365a1c38770ba02826d7e039dbeef44e5a966323`.
Owned paths: this claim and `docs/handoffs/agents/TEAM_J_UNIFIED.md`; product edits require coordinator notification first.
Acceptance: independently inspect PR #184, execute supported security gates, inventory authority-model and external-adapter blockers, and reconcile relevant historical branch provenance without claiming an external audit.
Team B/I milestone: implementation `4655bab8` is committed. Final focused integration has 116 passing tests and
web typecheck/focused lint pass, using coordinator catalog overlay `cb6a3de3`. Independent reviewers found and
rechecked pin concurrency, stale consent and remote iframe corrections. Browser acceptance is added but unrun.
See `docs/handoffs/agents/TEAM_B_UNIFIED.md`; coordinator owns final combined-head qualification.

## BlindBit gRPC-Web adapter — 2026-11-16

Worker: fresh Team H transport, Caveman workflow. Branch: `codex/unified-blindbit-grpc`; base `492cc20d`.
Owned paths: new btc-silent-payments scan gRPC-Web adapter/generated schema/tests, index export, package dependency/lock additions, transport provenance and handoff. Existing scan state/BTC UI remain owned by Team H persistence.
Acceptance: explicit HTTPS endpoint, no wallet key request fields, bounded/cancellable unary frames, strict protobuf/domain validation, network/hash agreement, exact satoshi amounts, pinned MIT provenance. Live proxy/oracle qualification remains external.

Follow-up: coordinator authorized the isolated `packages/contracts/scripts/run-echidna.sh` and
`scripts/tests/echidna-runner.test.mjs` correction after the checksum-pinned native 2.2.7 campaign completed
300,021 Router calls and emitted final `passing` property statuses rejected by the prior parser. Require the
completed configured call budget while retaining abnormal-exit, complete-inventory and failing-canary checks.
Independent review requested from `final_review`; no contract or analyzer setting changes.

Hosted follow-up authorized by coordinator: extract Echidna/Mythril into a read-only, path-scoped PR and reusable
workflow called by nightly; preserve analyzer settings, failing outcomes and bounded source-pinned report artifacts.
Owned additional paths: `.github/workflows/{nightly,contract-analysis}.yml`, contract script compatibility/report
helpers and `scripts/tests/contract-analysis-workflow.test.mjs`. No dispatch, publication, release or deployment.

Team B/I follow-on: `5d36ac5d` implements merchant-key-authorized template issuance and signed-permission amount
requests. Final focused integration: 115 tests passed; full web typecheck/focused lint passed. Independent final review
is source-pinning this commit. Profile-only automatic checkout remains a documented destination/fee/pricing/signature
schema or signing-transport decision; it is not a missing local merchant signing path anymore.
## Coordinator hosted-CI regression repair — 2026-11-16

Worker: root, Caveman. Branch: `codex/ghostpay-unified-completion`; base `8298fc24296194f05b686b44bec542d10276c8d3`.
Owned paths: `apps/web/src/lib/relayerClient.ts`, its tests, and `tagArchive.test.ts`.
Acceptance: reconcile browser pre-broadcast classifications with the current public relayer API; preserve unknown-response refusal safety; guarantee the archive-corruption fixture changes ciphertext; run focused regressions and independent review. CLI and ledger fixtures are owned by ci_reconciliation separately.

## Dependency remediation — 2026-11-16

Owner: dependency agent, Caveman workflow. Branch: `codex/unified-dependencies`; base `ab5039a3da0a1653df85b8ecbda6973947827547`.
Owned paths: workspace package manifests, package-lock and dependency evidence/handoff.
Acceptance: fix confirmed compatible security updates, preserve runtime/protocol pins unless necessary, audit exact resulting lock and verify affected tooling. Do not force major migrations to conceal remaining findings.
Status: implementation `379fe300` preserves all production lock records; complete audit is 17 low findings, production audit zero. npm 10 clean install, five dependency integration checks, affected lint, Hardhat compile/typecheck and 39 router/chain-guard tests pass. Full FHE fuzz and npm 11 clean install exited 137 locally and remain unqualified. See `docs/handoffs/agents/TEAM_J_DEPENDENCIES_UNIFIED.md`.
## Team D optional quote protections — 2026-11-16

Worker: price_gates, Caveman. Branch: `codex/unified-price-gates`; base `b0b7afa9de68510b821cc702a0f82847a205495b`.
Owned paths: `packages/chain-adapters/src/quote.ts`, quote tests, spec-03 status and this handoff. No dependency, relayer signed-quote ABI or web caller edits.
Acceptance: configured sequencer outage/grace, fresh reference-feed deviation and USD peg checks fail closed with exact bigint boundaries; standalone conversion rejects malformed price precision; no invented feed addresses or activation claims. Required production pins, external feed tests and relayer protocol integration remain separately recorded.
## Fresh final integration review — 2026-11-16

Owner: final_review, Caveman workflow. Branch: `codex/unified-final-review`; initial review base `f5142b19a6868f155b682eed50f606603cb68b97`, documentation worktree base `53d2163b`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md` and this claim only. Product sources remain read-only.
Acceptance: inspect cross-module authority, runtime export/build-profile, network and concurrency boundaries of the integrated candidate and newly completed workers; pin findings to source, verify corrections independently where practical, and distinguish source review from release or external audit qualification.

Milestone: reviewed the pinned sources in `docs/handoffs/agents/UNIFIED_FINAL_REVIEW.md`; no additional blocking source defect found. Independent focused merchant tests 21/21 and Echidna parser fixtures 22/22 passed. Coordinator owns final combined-source qualification. Follow-up dependency remediation is outside this milestone until its source is ready.

Follow-up: reviewed the dedicated BTC worker, dependency remediation, CLI canonical-time propagation, relayer refusal classification and optional price guards at the exact revisions in the handoff. Worker network/artifact and late-response cleanup findings were corrected before clearance. Independent additional selections passed: worker/bridge 16/16, dependency tooling 5/5, CLI timing 9/9 and quote guards 19/19. All clearance is source-scoped; final combined-head gates and external acceptance remain coordinator responsibilities.

Current follow-up: hosted analyzer workflow source cleared at `6fb739ed` with 5/5 independent helper/workflow tests; pure Bitcoin output proof helper cleared at `a4496071` with 34/34 tests after coinbase exclusion. Relayer feed/provider source cleared at `87f3dd50` with 29/29 independent tests after correcting a feed-validity deadline lost across nonce/signing awaits. Integrated Bitcoin source/light-mode product source cleared at `d9ba1253` after mandatory proof integration and bounded tweak cleanup, with 34/34 independent tests and a final 12/12 worker rerun. Coordinator-owned critical locale integration and combined artifact/browser gates remain separate.

## Team H source selection, full-block cross-check and light inclusion proofs — 2026-11-16

Worker: btc_sources, Caveman. Branch: `codex/unified-btc-sources`; base `25bbf1e3c87b9b2d8feeeeaca804027511b18608`.
Owned paths: Bitcoin view, scan source composition, typed worker oracle bridge and focused tests; spec-12 source status and handoff. Root owns locale catalogs and security-key classification.
Acceptance: optional user-selected BlindBit HTTP or HTTPS gRPC-Web data must agree with every locally verified Esplora block before results or checkpoints are accepted; exact network and full-index capabilities; no worker network API or keys in source requests; bounded/cancellable transport; source edits invalidate prior work; encrypted history is freshly revalidated. Preserve own Esplora mode A and stronger full-block Merkle/witness checks. No mainnet enablement, invented endpoints, hosted scan-key mode or SPV-only claim.


Scope continuation: parent explicitly authorized light oracle scans with mandatory per-match raw-transaction/Merkle proof against checked headers, current outspend checks, optional full second-source agreement and accurate omission/privacy limitations. No separate direct-bitcoind adapter is required for the existing own-node Esplora architecture.

Team H source status: implementation `d5632c9e` plus review follow-up `d9ba1253` complete and independently source-cleared. Scoped oracle/UI/transport/policy tests and all 17 chain-view outcomes pass; final web typecheck/scoped lint/full+lean build and unchanged bundle guards pass sequentially. Root owns critical locale merge and combined artifact/browser gates. Handoff: `docs/handoffs/agents/TEAM_H_SOURCES_UNIFIED.md`.

## Team C/D configured source checks — 2026-11-16

Worker: relayer_sources, Caveman. Branch: `codex/unified-relayer-sources`; base `ccd7721a797ae8b1d73adfd8568c7227d5a356c9`.
Owned paths: `apps/relayer` source/config/tests, operator monitoring documentation and this handoff. No dependency or signed-quote schema changes.
Acceptance: opt-in canonical-header agreement compares two actual configured providers; configured registry-feed pricing fails closed on stale/invalid rounds without fixed fallback; quote expiry cannot exceed feed validity; truthful bounded telemetry; source-pinned tests and independent review. Existing fixed pricing remains a separately documented legacy mode.
Status: final source `87f3dd50`; independent review and 29 focused tests passed. Full native-inclusive relayer gate passes 475/475 with original coverage thresholds, full lint/typecheck/build. Quote ABI remains unchanged; production source pins, live acceptance and signed round-identity schema remain explicit gates. See `docs/handoffs/agents/TEAM_C_SOURCES_UNIFIED.md`.

## Team G escrow supporting model — 2026-11-16

Worker: escrow_support, Caveman. Branch: `codex/unified-escrow-support`.
Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: `scripts/experimental/milestone-escrow/**`, spec 17 implementation status,
escrow reuse/research documentation, and `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Acceptance: isolated, unaccepted deterministic stage model; explicit dispute/release variants;
exact conservation, domain/replay, timing, terminal-state and canonical replay evidence;
decision table with custody/dispute/recovery consequences; independent review.
No guardian-model duplication, product import, Solidity custody contract, admin authority,
dependency change, UI activation, deployment or claim that spec 17 is complete.

Milestone complete: source `307f9008`; standalone 19/19 tests, model 100% line/branch/function
coverage, and independent source/test review by `final_review2`. All 42 state/action pairs and
15,444 bounded transition attempts are covered. Handoff: `docs/handoffs/agents/TEAM_G_ESCROW_SUPPORT.md`.
Authority decisions and product escrow implementation remain blocked; no fund path was enabled.

## Team I final hosted browser repairs — 2026-11-16

Worker: browser_finish, Caveman workflow. Branch: `codex/unified-browser-final`; base `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37`.
Owned paths: browser reconciliation fixtures, skip-link focus and pairing error behavior/tests; browser handoff. No locale, BTC source, relayer or native registry edits.
Acceptance: explain checkpoint55e8 hosted browser failures from exact logs; preserve canonical payment authority and all accessibility/rejection assertions; fix source bugs with focused regression evidence; record local browser launch limits honestly.

Team I browser repair milestone: source `9642e75a` repairs skip-link order and canonical RPC test evidence; 77 focused DOM tests, typecheck and scoped lint passed. Pairing generic-status browser failure remains explicitly pending hosted rerun with stronger diagnostics and unchanged original assertion. See `docs/handoffs/agents/TEAM_I_BROWSER_FINAL.md`.

## Fresh final delta review — 2026-11-16

Owner: final_review2, Caveman workflow. Branch: `codex/unified-final-delta-review`; base `191bbce3c30d94b8f48f767b7ab77ec739e62b9a`.
Owned paths: `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md` and this claim. Product sources are read-only.
Acceptance: independently review new delegated registry signing, isolated escrow supporting harness, corrected worker fetch injection/CI setup, browser regression repairs, and oracle critical-message integration. Preserve prior reviewed-source evidence and separate execution, external acceptance, and final-candidate gates. Record findings at exact source pins and execute bounded focused regressions when available.

Review milestone: source-scoped delta review complete in `docs/handoffs/agents/UNIFIED_FINAL_DELTA_REVIEW.md`. Independent workflow 5/5, worker/privacy 51/51, locale 12/12, delegated helper 53/53, native registry 9/9, escrow model 19/19 and browser DOM 34/34 passed. Hosted pairing rejection status remains pending actual browser rerun; final combined qualification remains coordinator-owned.
# Qualified source promotion — 2026-11-18

Worker: ChatGPT integration coordinator. Branch: `integration/ghostpay-qualified-fixes-20261118`.
Base: `5a33a435ffbb4711d0a5fa69ade9d32ad4f8b929` (reviewed PR #241 merged into main).
Owned paths: integration of already independently reviewed #237, #227, #234 and #235; their nonconflicting source/tests;
this registry and `docs/consolidation/master-20261118/QUALIFIED_GROUP.md`.
Acceptance: preserve all source parents and worker claims, qualify the combined tree against current main, independently review,
then merge only with successful applicable checks. Existing strict Mythril release failure remains explicit and unchanged.
No deployment, release, branch deletion or shared-branch rewrite.



## Beta acceptance log artifact capture — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-beta-log-artifact-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main).
Owned paths: `.github/workflows/beta-acceptance.yml`; this claim;
`docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.

Acceptance: trace the observed missing artifact in run `44279444368`, job `134715943959`, to the retained
log paths and the exact pinned upload action behavior; enable hidden-file inclusion only for the existing
`scripts/beta/.state/*.log` upload. Preserve the path, artifact name, retention, permissions, failure behavior,
acceptance commands and every existing gate. Run existing relevant workflow/action checks and inspect the
exact diff; add no setting-mirroring test. No product/dependency change, new infrastructure, deployment,
workflow rerun, publication or upload of state JSON/private fixture material.

Status: workflow source `05a3b45bda60d18a6922c0897d48bd8984bad377` adds only the requested boolean
input. Existing workflow checks pass 6/6 with no skips; action-pin check passes all 111 references;
`git diff --check` passes. Coordinator and privacy reviewer independently cleared that exact workflow
source after checking the pinned upstream filter, retained logs and unchanged upload scope. No new test,
dependency, build, upload or rerun. Hosted artifact existence remains unverified; early failures can still
precede log creation, and the earlier browser acceptance failure remains red. Evidence and integration
limits: `docs/handoffs/agents/BETA_LOG_ARTIFACT_20261118.md`.



# Own-node request guard — 2026-11-18

Worker: ChatGPT privacy review agent using the Caveman workflow. Branch:
`chatgpt/ghostpay-own-node-guard-20261118`; base PR #222
`2bc2098298d90928eb1acafad969f28316bb05fc`.
Owned paths: `apps/web/src/lib/defaultServices.ts`, its focused tests, this claim,
`docs/handoffs/OWN_NODE_GUARD_REVIEW_20261118.md` and
`docs/handoffs/PRIVACY_CONSOLIDATION_REVIEW_20261118.md`.
Acceptance: switching to acknowledged own-node mode prevents cached RPC clients
and their retries from sending new requests to a third party. Refusals contain
no endpoint or request data. Loopback requests remain usable in own-node mode.
Other #222 findings and integration conflicts remain separate; no Tor or release
qualification, remote mutation, deployment or public-chain transaction.

## Privacy-default browser fixtures — 2026-11-18

Worker: ChatGPT recovery reviewer, Caveman workflow. Branch: `chatgpt/ghostpay-privacy-browser-fixtures-20261118`.
Base: PR #222 head `2bc2098298d90928eb1acafad969f28316bb05fc`; the failing hosted Pages job tested synthetic merge
`644a43ee6366298f418a0aca5a40ecf974871748` in run `44279444265`, job `134715947261`.
Owned paths: affected receipt/envelope/consent setup in `apps/web/e2e/{pages-devnet,core-journey,devnet-journey,flows,sweep}.spec.ts`,
`apps/web/e2e/devnet/pages.ts`, a pure invoice-tamper fixture helper, its focused `apps/web/src/test` regression,
this claim and `docs/handoffs/agents/PRIVACY_BROWSER_FIXTURES_20261118.md`.
Acceptance: assert minimized receipts omit the payment address, then explicitly opt into full receipts without
weakening signature/address assertions; preserve encrypted invoice defaults and prove altered amounts still decrypt
but fail signature verification; explicitly request Sweep balances before existing spend/dust assertions.
Runtime sources, defaults, dependencies, CI gates and skips remain unchanged. Local helper and existing UI tests,
scoped lint/typecheck and independent source review are evidence only for their stated scope. Local Chromium cannot
launch; no browser acceptance is claimed and fresh hosted CI remains required.

Milestone: repaired fixture source `6dc3ae7c419c8f706c11fc3d96de66e055ad165d` passes 49 focused tests, whole-web
typecheck at a 1536 MiB cap and scoped lint. Independent review reports no blocker and independently passes the
three pure tamper-helper tests. Playwright discovery lists 14 tests in three mocked suites without execution.
The prior hosted result remains 11 passed, 2 failed and 3 not run until fresh exact-source CI executes.
Handoff: `docs/handoffs/agents/PRIVACY_BROWSER_FIXTURES_20261118.md`.

## Pages beta dependency qualification — 2026-11-18

Worker: ci_qualification, Caveman investigate-first, lean-build and verify-and-stop workflows.
Branch: `integration/ghostpay-dependency-qualification-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
Owned paths: root/workspace package manifests, package-lock.json, dependency tooling regressions if a defect is reproduced, and a source-pinned dependency handoff. No application source, workflows, coverage configuration, contracts or deployment changes.
Acceptance: integrate the exact paired #210 and #236 dependency revisions; clean installation; library and web builds; relevant original coverage-enabled suites, typechecks and lints; full and production dependency audits; preserve pending browser and hosted qualification honestly. No forced peers, casts, blanket overrides or weakened gates.
Source candidates: #210 `4d19655a2e5d93ad9378803cd4163245168aca24`; #236 `defdaa308a2d05ab407af7e42f8dc457cf52d103`.

## Remaining-work CI metadata qualification — 2026-11-19

Worker: backlog_ci, Caveman investigate-first. Branch: `chatgpt/ghostpay-remaining-ci-20261119`.
Base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (#238).
Owned paths: `.claude/skills/ghostpay-package-map/PACKAGE_MAP.md`,
`scripts/tests/lean-core-reachability.test.mjs`,
`packages/chain-adapters/src/payments.bulkCancellation.test.ts` (only the confirmed async-without-await fixture),
this claim and a source-pinned completion handoff.
Acceptance: reproduce the three hosted rest-0 metadata failures; regenerate the package map;
retain the unchanged owner-reviewed allowlists and explicitly record the integrated hygiene/metadata-hardening
dependencies as pending owner review; preserve exact closure, deferred-route exclusion and privacy assertions.
Fix the one hosted fixture lint error without changing runtime cancellation behavior or lint rules.
No feature, runtime, workflow, dependency, coverage, recovery, browser-fixture or approval-policy changes.
Root owns independent review, integration, final CI and any publication.

Status: three metadata failures reproduced and repaired (13/16 baseline to 16/16 green);
fixture lint failure reproduced from baseline, corrected scoped lint/typecheck and all six
cancellation tests pass. Secret scan/action pins/diff checks pass. Fresh high-threshold npm audit
passes after upstream picomatch withdrawal; 17 development-only low entries remain explicit.
Source pins and qualification evidence: `docs/handoffs/agents/REMAINING_CI_20261119.md`.
Await coordinator independent review and combined-source integration/qualification.

## Remaining-work pool seed backup security — 2026-11-19

Worker: root, Caveman investigate-first. Branch: `chatgpt/ghostpay-pool-seed-security-20261119`.
Base: `824091cf0bef4128641264fde3b606243ef66af3`; current main checked before claim.
Sources: SEC-16 in PR #205, audit 24 L8-07, and PS-10 in the existing pool SDK audit.
Owned paths: `packages/pool-sdk/src/store.ts`, seed-backup regression tests and existing seed fixtures,
`packages/pool-sdk/{README.md,package.json,vitest.config.ts}`, the corresponding local workspace dependency
entry in `package-lock.json`, generated package map, and a source-pinned completion handoff.
Acceptance: bound attacker-controlled seed-backup parsing/KDF work before derivation, use the existing
keystore passphrase policy for new exports, authenticate the versioned seed header, preserve bounded legacy
v1 recovery with exact legacy password bytes/AAD, wipe owned temporary secret buffers, and retain test coverage.
This is the separate experimental pool seed format; no Spec 18, ux-vault source, pool payment protocol,
contract, authority, deployment, publishing or release-policy change. Independent review: contract_security.
## Shared invoice signer-policy extraction — 2026-11-18

Worker: recovery_review, Caveman workflow. Branch: `chatgpt/ghostpay-invoice-validation-20261118`.
Base: `dfc75ef2087fa6463ae59e0818abec01796c578d` (main). Source reviewed:
PR #218 `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`, #209
`b5e2ea3e5030b56c79063eb1f91c8a634ee5d740`, and #211
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

Owned paths: `packages/invoice-schema/src/{envelope.ts,errors.ts,pinnedSigner.test.ts}`;
`packages/invoice-schema/{README.md,DEVIATIONS.md}`; `packages/ux-core/src/{errors.ts,errors.test.ts}`;
this claim; `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.

Acceptance: reproduce the missing opt-in `requirePinnedSigner` contract on main before implementation;
restore only the shared parser guard and fixed typed error/catalog entries; verify real signatures,
plaintext/encrypted/passphrase paths, invalid-signature precedence, default compatibility and
unchanged format/schema/decryption failures. Run affected package tests/typecheck/lint/build and
existing browser-consumer regressions with matching compiled packages. Document that no current
browser caller opts into this policy and that default unpinned-seller review remains unchanged.
No CLI, relayer, backend, experimental, dependency, cryptographic-format or browser trust-policy
changes. Independent source review and exact-head hosted CI remain integration gates; no publication
or browser-execution claim from this worker.

Status: additive API implementation and local review complete at product/test source
`079222115f494d966f1f25be31ffca4d66346461`; regression commit `e3a34d4081aa63d05f36c2e82961299fadaf3f76`
reproduces 10 signer-policy failures and 1 catalog failure against main. Full invoice-schema 728/728 and
ux-core 119/119 pass with original coverage thresholds; affected package typecheck/lint/build pass.
Existing Pay/Receipt tests pass 153/153 at `964b60d6`, before the sole final catalog identity-wording
correction. Privacy reviewer independently passes 13 signer + 15 catalog tests at final source;
coordinator independently passes the same 13 signer cases. Both source reviews find no blocker.
These independent counts overlap author coverage. No browser/default enforcement, cryptographic format,
optional backend or experimental changes. Exact-head hosted CI and browser acceptance remain separate.
Evidence and integration limits: `docs/handoffs/agents/INVOICE_VALIDATION_20261118.md`.



## Main-targeted Pages checkpoint v4 extraction — 2026-11-18

Worker: ChatGPT privacy_review, Caveman surgical-patch.
Branch: `chatgpt/ghostpay-pages-checkpoint-v4-20261118`; base main
`dfc75ef2087fa6463ae59e0818abec01796c578d`. Reviewed #222-lane source input:
`1dd0fa6152f67010dd38db35d46d102130b583f3`, preserved with its handoff at
`f90499d2925a965b73533da2650c60ca9ea119ed`.
Owned paths: `apps/web/src/lib/scanClient.ts`, `apps/web/src/lib/scanClient.test.ts`,
`apps/web/src/lib/scanCursorSlot.ts`, `apps/web/src/lib/scanCursorSlot.test.ts`,
`apps/web/src/lib/scanCheckpointPrivacy.test.ts`,
`apps/web/src/lib/scannerCore.spam.nocov.test.ts`, checkpoint row only in
`docs/threat-model/PRIVACY_THREAT_MODEL.md` and the browser-profile row only in
`docs/threat-model/THREAT_MODEL.md` (coordinator-approved), this claim and
`docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`.
Acceptance: extract only identity-bound v4 checkpoint persistence/lending and the
relevant regressions onto main; preserve main scanner body, evidence/reorg/finality
checks and application behavior. No #222 bulk-evidence feature, transport/BTC/contract
or dependency changes. Reproduce main's legacy behavior before product edits; run
focused/full scanClient tests, million-announcement resume, whole-web typecheck and
scoped lint; request independent source/test review. Record both source lanes, old
record rescan and privacy/storage limits. No remote mutation, duplicate PR, merge,
deployment or local browser-pass claim.
Status: completed at main product/test source
`7c37de5154ac18e06725ecde6d194185b2e820f2`. Main RED commit
`1d8e61776b2e28a4a4d2e082399eefe58148ea7c` reproduced 5 failures/2 controls.
Full scanner/privacy/helper selection passed 110/110; million-announcement resume
passed 1/1; full-web typecheck1536MiB and scoped lint passed. Independent recovery_review
found no blocking source issue and reran 20 privacy/helper plus 3 pending-corroboration
lifecycle cases at the exact source. Main scanner bytes before persistence are unchanged
except the helper import; no #222 bulk-evidence code was copied. Public/unauthenticated
cursor values, deliberate legacy rescan, existing same-key-restore AbortSignal dependency,
sole-copy idle-retention policy and lack of cross-tab locking remain explicit.
See `docs/handoffs/GHOSTPAY_CHECKPOINT_V4_MAIN_20261118.md`. Publication and combined
candidate qualification remain coordinator-owned; no duplicate #222-lane PR.

## Remaining SDK and registry documentation — 2026-11-19

Worker: root; branch `chatgpt/ghostpay-remaining-work-20261119`, base `dfdc5d51`.
Sources: F-PROTO-12 missing SDK README, F-CTR-04 stale ADR-0018, F-WEB-18 embed header path,
and current quote/RPC source. Owned paths: `packages/sdk/README.md`, `docs/adr/ADR-0018-erc6538.md`,
`packages/chain-adapters/README.md`, comment in `apps/web/src/lib/embedHost.ts`.
Acceptance: document actual exports and verdict semantics without changing payment authorization,
state current delegated/ENS support and deployment-verification limits, correct source paths,
and validate relative links. No protocol, authority, deployment, release or runtime behavior change.

## Remaining focus and lean-buffer acceptance — 2026-11-19

Worker: root; source `74a1e38a`, current main `e454de6a`. Sources: SEC-30/R-04
and F-WEB-05, historical focus test `407868a1`. Owned paths: new
`apps/web/e2e/focus-scope.spec.ts`, one full/lean v1 buffer case in
`apps/web/src/views/Pay.supported.test.tsx`, lean scope clarification and evidence.
Acceptance: preserve the accepted AppShell focus behavior in a browser regression;
prove the v1 buffer is initially off in both profiles and displays its amount/public
linkage only after opt-in. No application behavior or seven owned feature changes.
Browser execution remains a hosted gate if the local Chromium socket restriction persists.

## Remaining GitHub Action runtime maintenance — 2026-11-19

Worker: root; branch `chatgpt/ghostpay-remaining-work-20261119`, base `5e753eb9`.
Source: unassigned dependency PR #207, independently reviewed at
`199ab7ef1e80e6368fdc17c09b94c87a62871861`, and GitHub's Node 20 action-runtime retirement.
Owned paths: the two `peter-evans/create-pull-request` pins in
`.github/workflows/ghostpay-codex-cloud.yml` and
`.github/workflows/ghostpay-parallel-review.yml`, this claim and the review evidence.
Acceptance: adopt the reviewed Node 24 action while preserving every trigger,
permission, input, output consumer and paid-workflow activation condition; run
the existing automation hardening/workflow tests and action-pin checks; obtain
independent source review. No workflow dispatch or paid-agent activation.
The unrelated setup-python v7 upgrade remains optional maintenance.
