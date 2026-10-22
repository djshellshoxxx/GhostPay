# Reading guide: ADRs, specifications, audits and DEVIATIONS

The repository has many documents written at different times, some superseded. This page tells you which to trust first, what
each ADR constrains in code, and how to find the evidence behind a claim.

## 1. Precedence (what wins when documents disagree)

1. **The code and its tests.** The root README: "Where a README and the code disagree, the code wins and the discrepancy is a
   bug in the README." Every package `DEVIATIONS.md` repeats it.
2. **`packages/*/DEVIATIONS.md` and `apps/*/DEVIATIONS.md`**: where and why code departs from a spec, with unverified items.
3. **`docs/SPEC_REVIEW.md`**: corrections to the older documents, dated 2026-10-21. It "takes precedence over older text"
   (`DEVELOPER_SPECIFICATION.md` header) and resolves contradictions in the first-generation docs. Read it before the specs.
4. **ADRs** (`docs/adr/ADR-LOG.md`): accepted decisions. A decision is binding for design; its *description of the current
   code* can lag (section 4).
5. **Normative specifications**: `CONTRACTS_SPEC.md` (contracts, normative, with the DEVIATIONS caveat), `FEE_SCHEDULE.md`
   (normative for contracts, relayer and UI), `APP_AND_RELAYER_SPEC.md`, `MULTICHAIN_SPEC.md`, `DEPLOYMENT_MANIFEST.md`.
6. **First-generation planning documents**, partly superseded and annotated in place: `DEVELOPER_SPECIFICATION.md` (security
   invariants and module design remain the intent), `MASTER_BLUEPRINT.md`, `POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`,
   `SECURITY_QA_DEVOPS_PLAYBOOK.md`.
7. **Proposals, not behaviour**: `docs/specs/*.md` (17 implementation specs 01-17) and `docs/specs/ideas/`, plus
   `docs/remote/` (research, gap analysis, plans, round-3 audit parts, third-party notes). Treat them as inputs; nothing there
   describes shipped behaviour unless the code also does.

## 2. The ADR log, one line each

`docs/adr/ADR-LOG.md` (15 ADRs, format Status / Context / Decision / Consequences, all Accepted unless noted; amendments are
dated paragraphs inside the entry).

| ADR | Decision | Where it bites in code | Tests / evidence |
|---|---|---|---|
| 0001 | Scheme-1 maths pinned: 33-byte compressed ECDH, `keccak256`, tag `s_h[0]`, `h = int(s_h) mod n`; a change needs a new scheme id | `core-crypto/src/stealth.ts` | `scheme1.json` vectors, 1000-payment SDK differential |
| 0002 | Dedicated invoice-signing key; bare links give integrity only; UI must not say "verified seller" | `invoice-schema/src/sign.ts`, `envelope.ts` (`signerPinned`, `trust`) | `sign.test.ts`, `envelope.test.ts` |
| 0003 | No on-chain invoice id; single use is client-side | router has no invoice field; `checkExpiry` is advisory | `GhostPayRouter.t.sol` event/metadata tests |
| 0004 | Pinned libraries (viem 2, noble 2, OZ 5, Foundry 1.8.5, solc 0.8.28); amendment: viem drags in noble 1.x | `package.json` exact pins, `THIRD_PARTY.md` | `npm ci`, `npm audit` |
| 0005 | Envelope: AES-256-GCM, random key/nonce per invoice, AAD `"GPI1" \|\| chainId \|\| signer`; the link is a bearer secret | `invoice-schema/src/envelope.ts` | `envelope.test.ts`, independent AES-GCM in tests |
| 0006 | No blocklist/admin/pause in contracts; compliance lives in the frontend/relayer the operator runs | `PolicyGate` hook in the relayer | `api.test.ts` policy cases |
| 0007 | Fee recipient only via the deployment manifest | no address constants; `validateManifest` | manifest tests, grep in review |
| 0008 | EVM first, then BTC (BIP-352), others later; adapters pluggable | `ChainAdapter`, `btc-silent-payments` | `adapter-types.test.ts` |
| 0009 | Sweep sponsorship by ERC-2612 permit + EIP-712 order, not ERC-4337 | `GhostPaySweepRelayer`, `chain-adapters/sweep.ts`, relayer | sweep suites, relayer anvil e2e |
| 0010 | Invoice field shapes are normative for v1; lowercase addresses only; invalid signature does not throw | `invoice-schema/src/schema.ts` | `schema.test.ts` |
| 0011 | Chains/tokens enabled only through the chain-enablement checklist; tables are allowlists | `config/chains.ts`, `config/tokens.ts`, `docs/operators/chain-enablement-checklist.md` | `config.test.ts` |
| 0012 | Fiat-priced invoices disabled until a feed is verified; quotes are quote + explicit amount | `quote.ts` (`FEEDS` empty), web gating | `quote.test.ts` |
| 0013 | Fee bypass by direct payment, immutability trade-off, blacklist risk are accepted and disclosed | router/factory design, user docs | `test_EXPLOIT_*` residual tests |
| 0014 | Policy accounts (`0x47500002`) are experimental: contracts + client library, no UI/relayer, no recovery, not theft-proof | `PolicyAccount*`, `GhostPayPolicyRouter`, `policy-scheme` | policy suites, anvil cross-check |
| 0015 | No hosting, no hosted relayer until manifests are authenticated, releases signed, testnet smoke-tested, owner decisions made | `release.yml` ends at a draft; disabled stub | `docs/operators/release-and-verify.md` |

When you want to change behaviour that an ADR covers, write a new ADR (next number: 0016; specs 06 and 09 already name an
`ADR-0016` "reference contracts used as deployed" that has not been written), mark the old one amended or superseded with a dated note, and
update the specs and DEVIATIONS in the same pull request.

## 3. Reading paths by task

| You want to... | Read, in this order |
|---|---|
| Understand the product and its limits | root `README.md` -> `docs/user/privacy-limits.md` -> `docs/threat-model/THREAT_MODEL.md` sections 1-3 |
| Change stealth/crypto code | ADR-0001 -> `core-crypto/DEVIATIONS.md` -> `test-vectors/README.md` -> [api/core-crypto.md](api/core-crypto.md) |
| Change invoices/links | ADR-0002, 0003, 0005, 0010 -> `invoice-schema/DEVIATIONS.md` -> DEVELOPER_SPECIFICATION Module C -> [api/invoice-schema.md](api/invoice-schema.md) |
| Change fees | `FEE_SCHEDULE.md` -> ADR-0013 -> `chain-adapters/src/fees.ts` -> `CONTRACTS_SPEC.md` section 1 |
| Change a contract | `CONTRACTS_SPEC.md` -> `contracts/DEVIATIONS.md` -> `docs/audits/02-security-review-contracts.md` -> `docs/audits/00-slither-triage.md` -> [contracts-reference.md](contracts-reference.md) -> [extending.md](extending.md#4-change-a-contracts-public-abi) |
| Work on the relayer | `APP_AND_RELAYER_SPEC.md` section 3 -> `apps/relayer/{README,DEVIATIONS,PRIVACY}.md` -> `docs/operators/relayer-runbook.md` -> audit 03 |
| Work on the web app | `APP_AND_RELAYER_SPEC.md` section 1 -> `apps/web/DEVIATIONS.md` -> `docs/reviews/` -> audit 03 |
| Enable a chain/token | ADR-0011, 0012 -> `docs/operators/chain-enablement-checklist.md` -> `chain-adapters/TODO-VERIFY.md` -> `MULTICHAIN_SPEC.md` section 2 |
| Deploy or release | `docs/operators/deployment-runbook.md` -> `DEPLOYMENT_MANIFEST.md` -> `docs/operators/release-and-verify.md` -> ADR-0015 |
| Work on Bitcoin | `MULTICHAIN_SPEC.md` section 3 -> `btc-silent-payments/{README,DEVIATIONS}.md` -> `test-vectors/README.md` there -> `docs/guides/bitcoin-silent-payments.md` |
| Work on policy accounts | ADR-0014 -> `CONTRACTS_SPEC.md` section 4 -> `contracts/DEVIATIONS.md` (P1-P19, R1-R13) -> `policy-scheme/DEVIATIONS.md` -> `docs/guides/policy-accounts.md` |
| Pick up planned work | `docs/remote/gap-analysis.md` -> `docs/specs/README.md` (priority table) -> `docs/remote/plans/implementation-plan.md` |

## 4. Known drift between ADRs/specs and code

Verified while writing these pages (commit `7aee906`); fix the documents, not the code, unless a code change is intended:

- ADR-0014 point 2 says `flatSecurity` reports `available`; the `FeeStatus` type has no `available`, and `createEvmAdapter` reports
  `not_deployed` / `enforced` / `not_enforceable` from `manifest.policy` (`DEVIATIONS.md` item 6 of chain-adapters is accurate).
- ADR-0014 context ("router hard-codes scheme id 1", "no TypeScript derivation, ABI, scanner, vectors") predates
  `GhostPayPolicyRouter` and `@ghostpay/policy-scheme`. Its decision (not enabled, no recovery, not theft-proof) still stands.
- ADR-0012 point 5 says relayer prices are operator constants: still true. Its statement that the Create page "should hide or
  disable" the fiat option was addressed by the round-3 web change (`apps/web/DEVIATIONS.md` item 23).
- `packages/contracts/README.md` "Verification status" says Echidna was not run; `docs/remote/contracts-assurance.md` records runs.
- `.github/workflows/nightly.yml` header says no Echidna harness exists; the harnesses exist, just outside CI.
- `CONTRACTS_SPEC.md` section 4 and the `PolicyAccountFactory` fee text were updated for the M-03 waiver; older audit text
  ("deploy reverts when the fee token blacklists the recipient") describes the pre-R11 behaviour.
- Test counts and "pass" claims in READMEs are snapshots from the commit named there.

## 5. Evidence index (how to cite)

| Series | Where | Meaning |
|---|---|---|
| `G-01..G-33` and rows `R-`, `O-`, `C-`, `W-`, `A-` | `docs/audits/01-completeness-audit.md` | spec-vs-code traceability and gaps |
| `M-01..M-03`, `L-01..L-06`, `I-01..I-08` | `docs/audits/02-security-review-contracts.md` | contract findings (Medium/Low/Info) |
| `S3-01..` | `docs/audits/03-security-review-client-relayer.md` | client and relayer findings |
| `D1..D10` | `docs/audits/04-independent-design-analysis.md`, `THREAT_MODEL.md` section 7 | design-level privacy/security risks |
| `N-01..N-08`, `TS-xx`, `NC-01..NC-11` | `docs/remote/audit-parts/{contracts,apps,ts-libs,new-code}.md` | round-3 findings and the review of their fixes |
| `1..N`, `P1-P19`, `A1-A6`, `R1-R13` | `packages/contracts/DEVIATIONS.md` | contract deviations (behaviour, policy design, audit fixes, policy router) |
| `S1-S6` | `packages/policy-scheme/DEVIATIONS.md` | scheme-2 client choices |
| numbered items | other `DEVIATIONS.md` files | per-package deviations |
| `PoC 01..11` | `docs/audits/poc/` (`run-all.sh`) | executable reproductions |
| Phase B records | `docs/reviews/` | per-feature self-reviews (not independent) |

Cite the ID and the commit in commit messages, test names and PR descriptions (existing tests do: `test_EXPLOIT_*`,
`test_policy_calldataDoesNotLinkPaymentsToSeller`).

## 6. Other documentation trees

`docs/user/` (plain-language manuals), `docs/guides/` (illustrated help guides, glossary, FAQ), `docs/operators/` (runbooks:
relayer, deployment, mirror hosting, local scanner/RPC, chain enablement, release), `docs/reviews/`, `docs/threat-model/`,
`docs/audits/`, `docs/specs/`, `docs/remote/`, `docs/tools/third-party-table.mjs`, and this `docs/developer/` tree.
