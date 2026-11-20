# GhostPay final findings quality review

## Scope and verdict

This independent, bounded static review checks proposed findings for evidence, impact wording, severity classes, duplication and contradictory statements. It is not a fresh whole-repository audit. Exact seven-branch runtime applicability remains with the separately assigned reviewer.

The reviewed source supports retaining the three assurance findings, the hosting recovery defect, the legacy configuration/build findings and the six conditional contract risks with the qualifications below. No additional demonstrated production vulnerability, High/Critical impact, or new required finding retirement was established. Keep conditional protocol risks, operational defects and verification-assurance gaps separate from reachable browser security defects in counts and summaries.

Source reads were from the existing audit checkout at `3b7c60d3d67eed0f038108d60f362f5dbef33e39`. Index blob identities were checked, and the name-only diff against HEAD for targeted source paths returned no modifications. Source references below identify the inspected blob. No project code, test, analyzer, browser flow, payload, probe, transaction or deployment was run. No repository source, test, configuration, audit note or Git state was edited.

## Required consolidated wording changes

1. **ROOT-01:** Keep the permissive `verify-pages-site.mjs` reader finding, but do not imply every branch's `scan-bundle.mjs` also reads lean reports. Scanner blob `2b1b579c18c66c552c407d20d96bda6e28bed1e4` contains no such traversal. That auxiliary claim belongs only to carrying later variants. The common Pages verifier independently supports the finding.
2. **CW2-K01:** A payer-specific fee balance/allowance problem alone is not an account-wide permanent lock. Factory deployment is permissionless. A second eligible payer can potentially materialize the same account. Describe the serious availability case as fee-token/view/delta incompatibility that prevents any usable deployment route, or limit a narrower case to the affected payer. Clean transfer refusal can already qualify for the waiver.
3. **CW2-K02:** Use “shared-policy correlation identifier.” Equality does not independently establish a common owner, receiver identity, or deanonymization. Public scheme-2 call parameters expose the value; an event-specific claim is unnecessary.
4. **CW2-K05:** Cite policy router `208–229` for actual token fee transfer/delta checks and `150–156` for native transfers. Existing `179–207` does not include the token fee transfer. Retain atomic rollback in the impact paragraph.
5. **HOST-LATEST-01:** Prefer “failed rollback cleanup can delete a retained recovery backup.” Loss requires an initial replacement failure, failed restore of a previously replaced target, and successful deletion of that target's retained backup. Do not imply every failed write loses prior bytes or that this was the operator's only backup.
6. **HOST-CAND-01:** The lane's “Informational, unconfirmed” status is superseded by root's official Compose interpolation verification. Final status can be **Low operational configuration mismatch**, conditional on differing ambient operator values. Preserve legacy-selfhost scope; this is not a new static-Tor finding or established third-party exploit.
7. **Historical wording:** “Historical; fixed latest” is insufficient where current main still carries the earlier code. Use exact branch labels: present on current main, corrected on named carrying branches. Do not infer a merge or global fix from later branch code.

## Assurance findings

| Finding | Disposition | Supported conclusion and limit |
|---|---|---|
| CW2-01 | Retain Low assurance | The invalid-metadata success branch reverts, the campaign tolerates handler reverts, and no persistent acceptance flag is recorded. No current production acceptance defect was established. |
| CT3-O01 | Retain Informational assurance | The mutation property's successful parse lacks its named same-session assertion. Separate deterministic integrity tests limit the conclusion to this property. |
| ROOT-01 | Retain Low assurance/defense in depth | The downstream reader tolerates incomplete nested evidence. The normal producer is stricter; no deployment bypass was established. |
| ROOT-Q03 | Retain Low assurance | Unsupported selections can select no step and leave success status intact. Hosted CI is a separate control. |

### CW2-01 evidence

- `packages/contracts/test/GhostPayRouter.invariant.t.sol`, blob `bd526370803a3098359f8e3d70661edf26edd2be`: `103–118` contains `payBadMetadata`; `115` reverts after a successful router call; `184–191` selects the handler; `201–235` contains accounting/retention invariants without a persistent invalid-metadata acceptance flag.
- `packages/contracts/foundry.toml`, blob `59bf7337ea5fe8526869f22e9595e022027b4712`: `23–26` sets `fail_on_revert = false`.

An ordinary success-branch revert rolls back state; it is not a persisted violation signal. Keep the recommendation to retain unexpected-acceptance evidence without reverting it, or ensure assertion failures fail the campaign. Separate unit/fuzz assertions acknowledged by the predecessor were not executed here.

### CT3-O01 evidence

- `packages/qr-exchange/src/multipart.test.ts`, blob `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d`: `209–220` names the mutation rejection/same-session property, discards successful `parseChunk` output, and asserts only in the error branch.
- Same blob `128–170`, `179–199` explicitly asserts conflict, CRC, size and final-integrity rejection.

This supports an omitted success-branch assertion, not production acceptance of altered protected data or failure of the separate deterministic tests.

### ROOT-01 evidence

- `scripts/pages/verify-pages-site.mjs`, blob `30fbe84911c51c484a966a604351ed4a395dd18e`: `186–203` checks top-level format/profile/nonempty arrays but substitutes empty lists for absent modules/worker chunks and does not require finite nonnegative lengths or matching emitted filenames.
- `apps/web/scripts/localBuildProfile.mjs`, blob `65c1b1690763f34c64262643e94cdd672f0f057b`: `64–86` validates records/lengths; `102–133` requires nonempty provenance and export metadata; `248–268` checks final bundle/worker evidence and output-module membership before writing a normal report.
- `apps/web/scripts/scan-bundle.mjs`, blob `2b1b579c18c66c552c407d20d96bda6e28bed1e4`: this main-line variant performs bundle/source scans and has no lean-report reader. Do not assign later reader behavior to this blob.

The regular producer is a material control. Checksums do not authenticate a hostile report and artifact controlled by the same party. No external untrusted path bypassing production deployment checks was established.

## Conditional contract risks

These IDs concern distinct mechanisms. Their severity labels assess conditional impact; they do not establish that a deployed application uses the affected configuration.

| Finding | Disposition and limitation | Exact evidence |
|---|---|---|
| CW2-K01 | Retain Medium conditional availability. Requires nonzero fee, funded undeployed account and fee-token dependency blocking usable deployment. One payer failure is insufficient for permanent lock. | `PolicyAccountFactory.sol`, blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7`, `101–117`, `128–163`. |
| CW2-K02 | Retain Medium conditional privacy risk: shared-policy linkability. Reused destination/delay/limits-root yields the same public hash; common identity is not established. | Factory same blob `180–190`; `GhostPayPolicyRouter.sol`, blob `56f5ef6ef90c6441812f3695da55916ecce352c4`, `15–27`, `93–104`, `232–241`. |
| CW2-K03 | Retain Medium conditional asset availability. Missing immutable asset eligibility and incompatible withdrawal deltas are distinct causes within this funding/withdrawal-boundary risk. Native buffer is held by the account, not the owner EOA. | Policy router same blob `160–177`; `PolicyAccount.sol`, blob `1e5eeadfe7ba6e2a68f64e95ef1ca84afe12cbf4`, `26–43`, `170–185`, `216–239`. |
| CW2-K04 | Retain Low conditional fee economics. Requires suitable payer-controlled clean transfer veto; no deployed token choice established. Consequence is waived factory revenue, not ownership or withdrawal bypass. | Factory same blob `128–163`; experimental helper below. |
| CW2-K05 | Retain Medium conditional payment availability. Actual nonzero-fee recipient rejection can revert a payment; attempted funds are not retained in a partial payment. No live recipient failure established. | `GhostPayRouter.sol`, blob `bc6369fffe44ebcad5548ae731860161444e7998`, `54–66`, `121–128`, `179–198`; policy router same blob `150–156`, `208–229`. |
| CW2-K06 | Retain as Low conditional sponsor economics/design assumption, not a confirmed deficient relayer service. Sponsorship entails costs under execution-time token/owner state. | `GhostPaySweepRelayer.sol`, blob `3095160e30f5bcc109e7786ec410ab81741dadd4`, `46–65`, `101–114`, `118–143`. |

For K01/K04, `apps/web/src/features/policy/withdraw.ts`, blob `292f043fa2966470785cb1a5119af0faac655fc3`, `147–151`, rejects nonzero factory fees. Preserve this caller boundary. Policy activation and exact branch applicability remain with the separate reviewer.

For K03, distinguish an immutable missing leaf from temporarily incompatible token behavior. “Cannot currently withdraw under the stated token behavior” is more precise than unconditional permanent loss for the latter. K05's nonzero-fee condition is correct for transfer rejection; do not broaden it into a claim that fee-recipient balance views are irrelevant at zero fee, since those views are unconditional.

K01/K04 share source but concern different consequences: inability to materialize an account versus waived revenue. K01/K03 concern deployment versus withdrawal eligibility. K05 concerns payment routing, and K06 sponsorship cost. They are not exact duplicates.

## Hosting and supporting infrastructure

### HOST-LATEST-01

Retain **Medium operational recovery/reliability**, with the multi-failure condition:

- `tools/portable-hosting-kit/src/core/atomic.mjs`, blob `d6099cdbaffc8767c13de1532d399b0f1d4eec46`, `122–135`: a failed restore leaves its backup reference non-null.
- Same blob `144–166`: subsequent catch cleanup attempts to delete every remaining non-null backup.
- `tools/portable-hosting-kit/src/core/package.mjs`, blob `cd7207c96ed47f9c3b1effae9997eedbecab2d6b`, `178–180`: archive then SHA-256 sidecar are committed together.

The bounded consequence is loss of that helper-created recovery copy and possible inconsistent output after the specified failures. No arbitrary file deletion, hostile archive, remote compromise, live outage or actual lost record is established. A fresh output destination limits this prior-file scenario in the new wrapper. Importing a shared helper does not make every failure condition reachable in every caller.

### HOST-LATEST-02

Retain **Low documentation accuracy/privacy expectation**, or Informational if final taxonomy reserves severity for executable defects:

- `tools/portable-hosting-kit/src/package-docs.mjs`, blob `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8`, `46–55`, especially `52`, includes subpaths in a separate-origin assurance.
- Kit `README.md`, blob `af59c25cb5507830967defad216ddf9c5c2b223a`, `104–107`, gives correct shared-origin guidance.
- `src/cli.mjs`, blob `5b4445881537af302d3d94e6cd0c4e41aa7adaa1`, `768–770`, requires subpath acknowledgement.

Correct the origin boundary. Do not imply every cookie has identical path attributes or the CLI silently enables shared-origin operation.

### HOST-CAND-01

Retain root's promoted **Low operational mismatch**, with root's verified Docker rule cited in the final report. This worker did not repeat the external lookup.

- `deploy/selfhost.sh`, blob `e353f5537e8f5571e0c3e085c6e25d1e1af59cb1`, `110–118` reads the env file; `141–161` validates file-derived port/UID/distribution inputs; `280–285`, `394–398` invoke Compose without making those values authoritative over inherited environment.
- `deploy/docker-compose.yml`, blob `2020e2031560bb3e7eaf16475e00be5eac9970f7`, `21–22`, `53–64`, `82–83`, interpolates image, UID, web-dist and port inputs.
- Root verified <https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/>: shell environment precedes an explicitly supplied env file for interpolation.

The condition is conflicting operator environment values; validated/installed inputs may differ from effective legacy configuration. Third-party control of the environment was not established. Do not apply this to `deploy/tor-static` merely because both use Compose.

### ROOT-Q03 and ROOT-I01

- **ROOT-Q03:** `scripts/dev/local-ci.sh`, blob `9fded4999dea9bc50835fe10a4c1d817fa8b7cc8`, `24–38`, `40–45`, `75–87`, supports unsupported selection yielding zero executed steps and initial success. This review did not recheck every hosted-CI parity claim; the precise zero-check finding is sufficient.
- **ROOT-I01:** Retain **Low legacy recipe availability**. `infra/web/Dockerfile`, blob `392a01a256e49f0b5c786791b258196544ea8a88`, `15–21`, and `infra/devnet/Dockerfile.web`, blob `c7abd58b4194e91b0db12b6b717e012f6938997a`, `5–8`, omit root scripts while invoking `build:libs`. `package.json`, blob `a4b3282474dbf3b55e1945c201d4a862aeb13670`, `19`, requires `scripts/build-workspaces.mjs`. No recipe was built and no Pages or portable-Tor outage established.

## Duplicate and retirement controls

- Keep **CP-C01 merged into CUSTODY-02**; no additional receipt-date count.
- Keep **ROOT-02 merged into PS2-02**; no additional print-defect count.
- Keep **CP-O03 retired as active vulnerability** because caller `DOMAIN_SEPARATOR` validation is part of the boundary. It may remain an Informational API-contract note. `crypto_tests_wave3.md:102` must not resurrect it by broadly retaining CP-O01 through CP-O03.
- Keep **PS2-01's test correction**: existing route/guard tests assert clear/retry. An unrun assertion is neither a missing test nor proof of runtime success.
- CP-01 and CW2-H04 share a memory-hygiene family but cite different helpers and branch remediation states. Cross-reference; they are not exact duplicates unless intentionally grouped as a family.
- CW2-01, CT3-O01, ROOT-01 and ROOT-Q03 affect different assurance mechanisms. Keep separate IDs if useful, but exclude them from a count described as demonstrated runtime security vulnerabilities.
- Predecessor handoff lists of unread tests are superseded by completed successor ledgers. Do not repeat them as final coverage gaps.

## Final presentation

Use exact branch applicability and distinguish present-on-main from corrected-on-an-unmerged-branch. Count known conditional contract risks separately from new confirmed defects. Attribute existing test expectations and prior analyzer results to their source reports; this audit did not execute them. Root's consolidated coverage ledger supersedes provisional wave inventories.

No source change or additional test is requested. The required work is corrected evidence and classification in the final catalogue.
