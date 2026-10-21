# Security spec: incident response, disclosure, bounty scope, emergency procedures

Status: draft. Owner: [OWNER]. Branch: claude/remote-extensions-1. Written 2026-10-21.
Scope: project-wide. Covers contracts (`packages/contracts`), client (`apps/web`), relayer (`apps/relayer`), client libraries (`packages/*`), release artifacts, and operator-run infrastructure.
Companion specs: `key-lifecycle.md` (section 4.7, KL-32/KL-33), `relayer-abuse.md` (RA-MON-8). Runbooks: `docs/operators/relayer-runbook.md` section 9, `docs/operators/deployment-runbook.md` section 8.

## 1. Purpose

Define how GhostPay detects, contains, reports, and recovers from security incidents when no on-chain control exists. Contracts have no owner, pause, rescue, upgrade, or fee setter (`docs/CONTRACTS_SPEC.md`, ADR-0006 area, `docs/FEE_SCHEDULE.md` section 1). Every response is therefore off-chain: stop an operator service, publish a new release or manifest, deploy a replacement router, and tell users. Speed of notice is the main control.

Out of scope: legal process (points to counsel only), user-side device compromise, and the chain itself.

## 2. Assets

| ID | Asset | Why it matters |
|---|---|---|
| A1 | Relayer hot key and quote secret | Holds float; signs sweeps. |
| A2 | Release signing key and the deployed release hash | Users verify the entry script against it. |
| A3 | Deployment manifest (`apps/web/src/lib/manifest.ts`, `packages/chain-adapters/src/deployments.ts`) | Carries router address and fee recipient. Currently not signature-verified (audit 03). |
| A4 | Router and policy-clone contracts (immutable) | Cannot be patched; a defect is permanent for that deployment. |
| A5 | `FEE_RECIPIENT` / `feeTo` and its blacklist/pause status | Failure blocks `payNative` and `deploy` (audit 02, M-01). |
| A6 | Seller spend keys and meta-address material | Compromise is not reversible on chain (KL-33). |
| A7 | Operator logs and proxy logs | Limited, deliberately minimal data (relayer runbook section 10). |
| A8 | Public trust channel (SECURITY.md contact, website notice, repo) | Needed to warn users fast. |

## 3. Adversaries

| ID | Adversary | Capability assumed |
|---|---|---|
| D1 | Remote attacker on relayer | Request floods, malformed quotes, reverted-sweep spam. |
| D2 | Malicious or compromised RPC provider | Returns false state; consistent lies not detectable by relayer. |
| D3 | Token issuer | Blacklists or pauses `feeTo`, the relayer, or stealth addresses (USDC/USDT). |
| D4 | Compromised hosting or CDN | Serves tampered entry script or manifest. |
| D5 | Malicious browser extension or script on user device | Reads fragments and clipboard. |
| D6 | Insider or operator with key access | Misuses hot key or release key. |
| D7 | Researcher acting in good faith | Needs a clear, safe reporting route. |
| D8 | Legal authority | Data request or order. |

## 4. Requirements

Numbering: IR-<area>-<n>. MUST = release blocker. SHOULD = required unless a recorded exception exists.

### 4.1 Governance and roles

- IR-GOV-1 (MUST): Name an incident commander and a deputy, with contact details, in `docs/operators/` before any mainnet use. Placeholder until [OWNER] confirms.
- IR-GOV-2 (MUST): Keep a single incident log (timestamp UTC, actor, action, evidence hash). Log entries are append-only in the repository or an operator store, never edited after the fact.
- IR-GOV-3 (SHOULD): Run a tabletop exercise per scenario in section 6 at least once before mainnet and after any change to relayer or manifest flow. Record date and result.

### 4.2 Detection and triage

- IR-DET-1 (MUST): Severity levels S0 (funds at risk now, or key compromise), S1 (user-facing wrong payment or privacy break), S2 (defect with no current loss), S3 (hardening). Each level has a response clock (IR-DET-2).
- IR-DET-2 (MUST): Targets: S0 acknowledged and containment started within 1 hour; S1 within 4 hours; S2 within 2 business days; S3 in normal planning. These are targets, not published promises, until [OWNER] confirms.
- IR-DET-3 (MUST): Alerting that the response depends on must exist before mainnet: relayer breaker-open, budget exhaustion, and fee-recipient or relayer address appearing in token blacklist/pause events (RA-MON-8; `modules-needed.md` row 6). Today this is unimplemented; mainnet gate.
- IR-DET-4 (SHOULD): Manifest-vs-chain drift check (deployed `router` bytecode hash vs manifest `bytecodeHashes`) run by operators on each release.

### 4.3 Containment

- IR-CON-1 (MUST): Relayer can be stopped per chain without restarting other chains. Verify the procedure in a staging run.
- IR-CON-2 (MUST): Stop-and-sweep procedure for a hot-key compromise follows `key-lifecycle.md` KL-32. Record every transaction from the old key.
- IR-CON-3 (MUST): Client kill switch per chain: the manifest or a signed status file marks a router `deprecated` or `paused`, and the web app refuses new payments on that router and shows a notice. Because the manifest is not yet signed, the kill switch MUST NOT rely on the manifest alone until D4 is closed (see open question Q3).
- IR-CON-4 (MUST): Users on a compromised or deprecated router keep the direct path where it is safe; the notice names that path.
- IR-CON-5 (SHOULD): Containment never requires publishing a secret in a public channel.

### 4.4 Eradication and recovery

- IR-REC-1 (MUST): Contract defect: deploy a replacement router from a reviewed commit, publish a new deployment manifest, release a new web build with the new hash, and mark the old router `deprecated`. Follow `deployment-runbook.md` section 8 (migration). Old contracts are not changed.
- IR-REC-2 (MUST): Release defect or poisoned build: revoke the bad release hash in the notice, rebuild from the tagged commit, and republish with a recorded hash that users can check on a separate machine (`SECURITY.md` ground rules).
- IR-REC-3 (MUST): Relayer key replacement: new key funded from the operator, `feeTo` unchanged unless A5 is the cause. Old key stays for on-chain history review only.
- IR-REC-4 (SHOULD): Post-incident review within 10 business days: root cause, timeline, what users must do, which requirement failed, and a dated action list.

### 4.5 User and public notification

- IR-NOT-1 (MUST): For any S0 or S1 incident affecting user funds or privacy, publish a notice on the project's repository and in the app within 24 hours of confirmation. The notice states: what happened, which router/chain/release is affected, what users should do, and what is not known.
- IR-NOT-2 (MUST): Notices never claim funds are safe or unsafe without evidence. Unverified statements are marked "under investigation".
- IR-NOT-3 (MUST): Notices never name or accuse a third party (issuer, RPC provider) without evidence and counsel review for a legal risk.
- IR-NOT-4 (SHOULD): Notices are signed with the release key (or a dedicated announcement key) and the fingerprint is published in `SECURITY.md`. Until that key exists, state this limitation in the notice.
- IR-NOT-5 (MUST): Do not use the relayer or the app's analytics to send notices (no analytics per `SECURITY.md`).

### 4.6 Vulnerability disclosure (reporting in)

- IR-DIS-1 (MUST): One reporting channel is live and checked before any mainnet use: GitHub private vulnerability reporting, or a security mailbox with a PGP key. `SECURITY.md` currently has placeholders; a deployment is blocked until [OWNER] confirms the channel.
- IR-DIS-2 (MUST): Acknowledge a valid report within 5 business days (the draft figure in `SECURITY.md`; no commitment made). Owner to confirm.
- IR-DIS-3 (SHOULD): Publish a `/.well-known/security.txt` on the official host conforming to RFC 9116 (fields `Contact` and `Expires` are required by that RFC; see References R1). The host does not yet exist (`SECURITY.md`: "no official host exists").
- IR-DIS-4 (MUST): Coordinated disclosure: fix first, then publish an advisory. Default embargo 90 days from report, shortened if the bug is being exploited or a user notice is needed. Owner decides the exact text.
- IR-DIS-5 (MUST): Reports are never posted in public issues, discussions or pull requests (`SECURITY.md`). Add a template or issue-form warning if the host supports one.
- IR-DIS-6 (SHOULD): Credit reporters by name or handle with their consent.

### 4.7 Bug bounty scope

- IR-BTY-1 (MUST): No bounty is offered until (a) at least one independent review of the exact release commit is on file (`docs/audits/` or agreed root `audits/`), and (b) the owner decides on a funding source. Until then, the scope document says "no monetary reward".
- IR-BTY-2 (MUST, when a bounty exists): The scope lists in-scope assets from section 2 and the repositories in `SECURITY.md` "Scope". Out of scope: the public website copy, third-party RPC and issuer systems, social engineering, DoS against the relayer, and any mainnet funds not belonging to the tester.
- IR-BTY-3 (MUST, when a bounty exists): Testing rules: use own keys and funds only; testnets preferred; no tests against user funds; stop after proof of concept.
- IR-BTY-4 (SHOULD): Severity rubric references the S0-S3 levels in IR-DET-1 and states that a bug in an immutable contract is not fixable in place (see section 5).
- IR-BTY-5 (MUST): Safe-harbour wording is not published without counsel review (open question Q5).

### 4.8 Evidence and data handling

- IR-EVD-1 (MUST): Keep only what the relayer already keeps (nothing persisted per request per relayer runbook section 10). Incident evidence is taken from on-chain data and retained logs the operator chose to keep. Do not add new logging to collect incident evidence without a privacy note.
- IR-EVD-2 (MUST): Never place keys, seeds, quote secrets, or full bearer URLs in an incident log or report. Redact before sharing.
- IR-EVD-3 (SHOULD): Legal requests go to counsel first (relayer runbook section 9, last row). Record the request and response in the log.

## 5. Design notes

1. Immutability shifts the problem. A bad contract cannot be repaired. The design response is migration: new router address, new manifest, new release, old router marked `deprecated`. Users on old links may still reach the old router, so the app must read a status from a source that is not the same untrusted manifest (IR-CON-3, Q3).
2. The control set is off-chain by design (ADR context in `docs/adr/ADR-LOG.md`, consequence "owner carries compliance responsibility"). This spec does not add an admin key. Any pause mechanism would reverse ADR-0006 and needs its own ADR.
3. Relayer containment is cheap: stop the process per chain. Keep the direct sweep path working so users are not stranded (IR-CON-4).
4. Token-issuer blacklist (D3) can freeze `feeTo` and stealth addresses. Mitigations are monitoring (IR-DET-3), choice of a plain multisig for `feeTo`, and a documented migration. A pull-vault redesign is an option recorded in audit 02 M-01 and is a design change, not part of this spec.
5. The manifest is the single point where D4 hurts most. Until it is signed and verified, every notice must tell users to check the release hash on a separate machine (`SECURITY.md` known limitations).
6. Keep notices short, dated, and factual. Users will read them under stress.

## 6. Acceptance tests (tabletop or staging; record date, actor, result)

| ID | Scenario | Pass condition |
|---|---|---|
| AT-1 | Relayer hot key suspected compromised | Service for chain stopped within 1 h (IR-DET-2); old key transactions listed; new key funded; incident log has timestamps. |
| AT-2 | Router defect found after mainnet | Replacement router deployed from reviewed commit; new manifest published; old router flagged `deprecated`; web app shows the notice and refuses new payments on old router (IR-CON-3). |
| AT-3 | `FEE_RECIPIENT` blacklisted by issuer | Alert fires (IR-DET-3); operator follows migration; notice published within 24 h; users told which path still works. |
| AT-4 | Poisoned release hash on hosting | Notice names bad hash; user checks hash from separate machine per instructions; rebuild reproduces tagged hash. |
| AT-5 | Vulnerability report received through the channel | Acknowledged within 5 business days; severity assigned with IR-DET-1; report not posted publicly; fix and advisory order follows IR-DIS-4. |
| AT-6 | RPC provider returns consistent false state | Detection path documented as limited (D2); operator switches `rpcUrlEnv` target and restarts; log records the switch. |
| AT-7 | Relayer request flood | Rate limit tightened and proxy block applied; other chains unaffected (IR-CON-1). |
| AT-8 | Legal data request | Counsel engaged; only retained logs are produced; request logged (IR-EVD-3). |
| AT-9 | Log review | Grep of incident logs and public notices finds no key material, seed, quote secret, or full bearer URL (IR-EVD-2). |

Automated check (SHOULD): CI script fails if `SECURITY.md` still contains the `[OWNER]` placeholder when a mainnet tag is created.

## 7. Open questions

- Q1. Who is incident commander and deputy? (IR-GOV-1). Owner.
- Q2. Which reporting channel is live: GitHub private vulnerability reporting, a mailbox, or both? Is a PGP key available? (IR-DIS-1). Owner.
- Q3. How does the web app learn that a router is deprecated or paused without trusting the unsigned manifest? Options: signed status file on a separate host, a signed manifest (new ADR), or an in-app notice only. (IR-CON-3, D4). Needs ADR.
- Q4. Is there a funding source and independent review budget for a bounty? (IR-BTY-1). Owner.
- Q5. Safe-harbour wording and counsel review. (IR-BTY-5). Owner plus counsel.
- Q6. Concrete time targets (section 4.2) are internal. Confirm before publishing.
- Q7. Who owns the on-chain blacklist/pause watch: relayer, ops monitor, or both? (`relayer-abuse.md` open question 6; `modules-needed.md` row 6 refers to a missing `specs/ops-monitor.md`.)
- Q8. Where do incident logs live, and who can read them? Not defined in repo.
- Q9. Does the owner accept the 90-day default embargo (IR-DIS-4)?

## 8. Existing coverage (as found on 2026-10-21)

- `SECURITY.md`: reporting route with placeholders; scope; known limitations. Not confirmed live.
- `docs/operators/relayer-runbook.md` section 9: relayer-only incident table. Does not cover contracts, client, releases, notices, or disclosure.
- `docs/operators/deployment-runbook.md` section 8: migration procedure (cited, not re-read in this pass).
- `docs/remote/security-specs/key-lifecycle.md` 4.7: KL-32, KL-33 only.
- `docs/remote/modules-needed.md` rows 6, 7, 8, 15: incident runbook "Partial", bounty "Missing", pausing governance "Deliberately absent".
- `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` line 98 and line 229: asks for an incident procedure before mainnet and for compromise response on frontend hosting. No project-wide procedure exists.
- Not found: a security.txt, a bounty scope, a notice template, or a project-wide severity scheme.

## 9. References

- R1. IETF RFC 9116, "A File Format to Aid in Security Vulnerability Disclosure" (2022). URL: https://www.rfc-editor.org/rfc/rfc9116. UNVERIFIED in this run: fetch failed (proxy/DNS unreachable 2026-10-21). Field names from memory.
- R2. NIST SP 800-61 Rev. 3, "Incident Response Recommendations and Considerations for Cybersecurity Risk Management" (2025). URL: https://csrc.nist.gov/pubs/sp/800/61/r3/final. UNVERIFIED in this run: not fetched; title and date from memory. Rev. 2 (2012) is the older form.
- R3. ISO/IEC 29147 (vulnerability disclosure) and ISO/IEC 30111 (vulnerability handling processes). Standard numbers from memory; not fetched; purchase-only text. UNVERIFIED.
- R4. Repo sources: `SECURITY.md`; `docs/FEE_SCHEDULE.md`; `docs/adr/ADR-LOG.md`; `docs/CONTRACTS_SPEC.md`; `docs/audits/02-security-review-contracts.md` (M-01, L-05, M-03); `docs/audits/03-security-review-client-relayer.md`; `docs/operators/*.md`.
- Caveat: `docs/remote/audits/*` (haiku reports) are unverified claims and were not used as evidence here.
