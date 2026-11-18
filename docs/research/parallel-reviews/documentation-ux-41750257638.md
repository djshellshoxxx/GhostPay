## Question

At the inspected GhostPay revision, how well do the documented checkout, privacy disclosures, errors, mobile accessibility and seller onboarding match the implemented journey? Which narrowly scoped follow-ups can proceed without duplicating active work?

This is one research-only pass dated 2026-11-04 UTC. It qualifies neither a release nor security. Facts below are source observations; hypotheses and proposed tests are explicitly labelled. Only this report was created.

## Current evidence

- **Inspected source:** local `main` and `origin/main` resolve to `0014bc5b26c7487ea1f9fb230194c36673193236`, whose commit subject is “Merge pull request #53 from djshellshoxxx/automation/ghostpay-parallel-review-wave-20261103”. Only these refs are locally available. Application observations describe this checkout, not the unavailable live head of PR #47.
- **Ownership evidence:** the supplied, already-untracked `active-pr-ownership.md` records PR #47 at `f8193502e602c99bb24ff956f142671750b744a0` and PR #52 at `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce`. A read-only request for GitHub’s open PR inventory failed with DNS resolution errors. Thus this report checks the supplied current inventory but cannot independently confirm whether ownership has changed since its generation.
- **Scope authority:** `docs/handoffs/LEAN_RELEASE_SCOPE.md` requires one local/test EVM invoice → explicit consent → detection/reconciliation → invoice-bound receipt → sweep → encrypted backup → independent fresh-profile restore journey. Its baseline is `a6a2a1c5cbccb7d97c36decba78a99fa83e8a6f8`, not this checkout. Deferred features are preserved, not qualified.
- **Reconciliation:** `docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md` records published application source `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2` (PR #41), earlier main `edb0051eb89bd135c73733d9db14569aa000662d`, and unavailable consolidation `7979e6f`. It explicitly leaves qualification and unique-source recovery open.
- **Journey evidence:** `apps/web/src/App.tsx`, `views/Home.tsx`, `views/Pay.tsx`, `views/SellerKeys.tsx`, `components/WalletAttempts.tsx`, `components/Common.tsx`, `components/Disclosure.tsx`, `components/TagArchive.tsx`, `lib/errors.ts`, `lib/manifest.ts`, and `lib/keystore.ts` were inspected, along with the user guides and relevant specifications cited below. Paths beginning `views/`, `components/` or `lib/` in this bullet are relative to `apps/web/src/`.
- **Test evidence is static only:** inspected relevant assertions in `apps/web/e2e/app.spec.ts`, `apps/web/e2e/flows.spec.ts`, `apps/web/e2e/passphrase-vault.spec.ts` and `apps/web/src/views/Pay.test.tsx`, plus `apps/web/playwright.config.ts`. No application, browser, contract, accessibility or usability tests were executed. Existing test names/assertions are not fresh passing results.

## Findings

### 1. The guides need a revision-specific capability and trust reconciliation

**Fact:** `README.md` appropriately warns against real money and anonymity claims, but its status table says hosting is absent while its “Pages prototype” section describes a published prototype. This is an internal wording conflict, not evidence that either deployment status is currently true. `docs/user/README.md` and `docs/user/privacy-limits.md` call Solana/TRON library-only with no UI, while `apps/web/src/App.tsx` imports and routes both views. Reachability is not qualification for the lean release.

**Fact:** `docs/user/review-and-pay-an-invoice.md` says manifest signatures and chain readback are not verified. In contrast, `apps/web/src/lib/manifest.ts` contains bundled-manifest signature verification and rejection when no release key is configured; `apps/web/src/views/Pay.tsx` calls `verifyManifestForFlow` before building its payment context. `apps/web/src/components/Disclosure.tsx` distinguishes signed, unsigned-development and unavailable signature status. Source presence establishes guards, not their successful operation, a trusted hosted build, deployment or external audit.

**Hypothesis:** conflicting descriptions make it harder to distinguish “available in source”, “permitted by this build” and “qualified for use”. A better documentation pattern is a small revision-labelled capability table with those separate columns and links to evidence. Preserve existing limitations until reviewed replacement text is substantiated. Do not simply replace “unauthenticated” with “safe”.

### 2. Privacy language should describe a specific boundary and observer

**Fact:** `docs/user/review-and-pay-an-invoice.md` says everything after `#` stays in the browser and is not sent to the web server. RFC 3986 §3.5 supports fragment separation before dereferencing; it does not prevent page scripts, extensions, copied links, screenshots or browser history from exposing the value. The same guide correctly warns about history and bearer links. `apps/web/src/App.tsx` clears the fragment by default after reading it, with an option controlling this behavior.

**Fact:** `docs/user/privacy-limits.md` contains a useful observer table and sweep-link warning. However, absolute “does not learn” cells depend on uncompromised software and observer capabilities. `apps/web/src/components/Disclosure.tsx` says GhostPay “hides which seller owns” an address, while the guides also explain stable meta-address and sweep linkage. This should be reviewed for contextual qualification, not treated as an anonymity guarantee.

**Proposed wording for review:** “The URL fragment is not included in the normal HTTP request for the page. The app reads it locally. Treat the full link as sensitive: page software, extensions, browser history and people you share it with may expose its contents.” Describe passphrase-protected invoices separately; do not imply the link alone decrypts every supported envelope.

**Hypothesis:** short disclosures placed before sharing a link, requesting wallet authorization and confirming a sweep will improve comprehension more than another general warning. The proposed interactive explainer already exists in `docs/specs/ideas/09-what-is-public-explainer.md`; do not commission a duplicate simulator or claim its no-network design has been implemented.

### 3. Error wording must remain tied to the last known operation state

**Fact:** `apps/web/src/lib/errors.ts` maps unknown errors to “Something went wrong. Nothing was sent.” This is an unsafe general assertion if reused after a wallet request whose outcome is unknown. It is not evidence that the current Pay flow makes that mistake: `apps/web/src/views/Pay.tsx` has terminal post-broadcast handling, and `apps/web/src/components/WalletAttempts.tsx` explicitly says “Outcome unknown; check your wallet before retrying.”

**Fact:** `apps/web/src/views/Pay.test.tsx` includes “WEB-APP-02” assertions that verification failure after broadcast does not re-enable Send or say nothing was sent. `apps/web/e2e/flows.spec.ts` contains late-hash, authority-change and explicit attempt-clearing scenarios. These are existing contributions to preserve, not missing tests to recreate.

**Better pattern, proposed:** document separate states: rejected before wallet request; wallet request unresolved; hash returned but verification pending/failed; included; finality not established. Give a safe next action appropriate to each. For an unresolved attempt, proposed copy is “The outcome is unknown. Check your wallet and transaction history before trying again.” Do not equate clearing local state, navigation or cancellation of a timer with cancellation of a wallet request. EIP-1193 rejection/disconnection codes describe provider responses, not a universal proof that no broadcast occurred.

### 4. Mobile foundations exist; full accessibility remains unestablished

**Fact:** `apps/web/src/App.tsx` provides a skip link, labelled navigation, focus transfer to `main` after view changes and a polite status region. `components/Common.tsx` associates field labels and optional hints and gives errors `role="alert"`. `styles/app.css` provides wrapping, visible focus styling, several 44px minimum control heights, narrow-screen layouts and reduced-motion handling. These are useful foundations, not a conformance statement.

**Fact:** `apps/web/e2e/app.spec.ts` checks skip/navigation focus, body foreground/background contrast above 7 in light/dark schemes, and page overflow at 360×740 during invoice creation/review. It does not establish contrast for every warning, disabled button or focus indicator. Its viewport check does not establish physical mobile-wallet behavior, screen-reader announcements, 320px reflow, 400% zoom or keyboard access inside horizontally scrolling tables. `apps/web/playwright.config.ts` has no explicit Firefox/WebKit/device project matrix and includes Chromium executable candidates.

**Hypothesis:** long addresses, attempt history, receipt JSON, QR import and file/clipboard workflows are higher-risk mobile tasks than the initial home page. WCAG 2.2 provides measurable review criteria: 1.4.3 Contrast, 1.4.10 Reflow, 2.1.1 Keyboard, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), 3.3.1 Error Identification, 3.3.4 Error Prevention (Legal, Financial, Data) and 4.1.3 Status Messages. The 24×24 CSS-pixel target-size criterion has exceptions; a 44px CSS rule alone neither proves nor disproves conformance.

### 5. Onboarding should teach recovery boundaries with the actual controls

**Fact:** `docs/user/set-up-stealth-meta-address.md` recommends backup and second-profile import, which matches the lean recovery goal. However, it says the backup passphrase needs at least 10 characters; `apps/web/src/views/SellerKeys.tsx` displays 14 and `apps/web/src/lib/keystore.ts` enforces a 14-character minimum plus policy checks. The source also exposes an optional persistent encrypted browser vault. “Keys are forgotten on reload” needs to distinguish unlocked memory from stored ciphertext.

**Fact:** `docs/user/troubleshooting.md` and `docs/user/receive-and-scan.md` say no encrypted tag export exists. `apps/web/src/components/TagArchive.tsx` implements archive export/import interactions and is rendered by SellerKeys. Presence does not certify backup completeness, restore success or lean inclusion. Existing vault reload coverage is visible in `apps/web/e2e/passphrase-vault.spec.ts`; do not confuse it with independently proving a complete fresh-profile recovery.

**Proposed pattern:** a task-oriented recovery checklist distinguishes seller keys, encrypted local vault, tags/reconciliation records and configuration. It states what each backup actually includes and leaves the source intact during restore. Avoid “backup complete” based solely on a download starting. Test users’ ability to explain viewing versus spending authority without collecting their keys, passphrases or real invoice links.

## Proposed independent tests

These are unexecuted protocols, not new test files or fresh results. Use synthetic invoices, throwaway keys and local fixtures only. Record exact source/build, browser/OS, viewport, assistive technology, fixture and observed result; redact all secrets.

| Protocol | Method and acceptance evidence | Independence / overlap |
| --- | --- | --- |
| Guide-to-control walkthrough | On a pinned candidate, follow setup → backup → fresh-profile import with the source profile retained. Record exact visible labels, accepted passphrase policy, artifacts included and claimed persistence. Acceptance: every documented step maps to a control and no statement promises unsupported recovery. | Editorial observation is separable; implementation or new recovery automation is **blocked** on #47 and acceptance-test ownership. |
| Mobile and assistive-technology observation | Review invoice, final wallet preview, unknown attempt, scan result, receipt and backup using keyboard and screen reader; inspect 320px reflow and 400% zoom, focus visibility, errors and status announcements, QR/text alternatives, clipboard denial and file selection. Evaluate relevant WCAG criteria individually and record permitted exceptions. | A manual evidence worksheet is separable; browser matrix/CI integration overlaps #52 and release/acceptance lanes and is **blocked** pending coordination. |
| Privacy and uncertainty teach-back | Give participants synthetic screenshots of bearer versus passphrase-protected invoices, invoice signature, pending hash and sweep destination. Ask who learns what and whether to retry or deliver goods. Record misunderstandings without recording secrets. Acceptance: findings are reported with sample size and observed answers, not generalized claims of safety or usability. | Research-only comprehension protocol is separable; changing product disclosures or transaction-state behavior is **blocked** on #47. |

## Ownership and overlaps

The following are future task proposals, not authorization to edit existing material. Live ownership must be refreshed before assignment; no task is certified unclaimed merely because the supplied inventory omits it.

1. **Candidate independent task — revision-labelled documentation discrepancy ledger.** Produce a separate editorial artifact mapping each stale sentence above to source evidence, proposed qualified wording and a review owner. Completion means each claim has a revision, boundary and unresolved evidence field. Do not edit core guides or declare findings closed. Actual guide/spec amendments are **blocked: #47**, with handoff reconciliation also overlapping #42/#43.
2. **Candidate independent task — manual accessibility observation worksheet.** Create a standalone, dependency-free worksheet for the proposed mobile/assistive-technology protocol, with individual criteria and evidence slots. Completion means it can record both failures and untested cases without generating a compliance score. Product/CSS fixes and automated checks are **blocked: #47/#52** and the acceptance/release lanes until assigned.
3. **Candidate independent task — synthetic privacy/error comprehension study script.** Prepare questions and a consent/data-minimization plan using synthetic screenshots; execution needs a separately arranged participant study. Completion means it distinguishes signature consistency from seller identity, URL transport from page access, and unknown outcome from failure. New explainer UI or error changes are **blocked: #47** and the existing explainer proposal.

`active-pr-ownership.md` lists other work that remains preserved: #51 recurring backlog automation; #49/#45/#34 dependency updates; #32 tooling action update; #44 audit-report permissions; #43/#42 handoffs; #41 scanner/secret-loading consolidation; #40 relayer secret loading; #39 audit follow-ups; #36 hosting; #31 EVM detect/receipt E2E; #30 extension work. Their exact heads are recorded in that file. No source is replayed, replaced or removed. In particular, #31’s existing E2E must not be recreated, and #39/#41 scanner qualification must not be inferred from a documentation correction. #52’s separate four-agent QA workflow and #53’s research workflow remain distinct. This pass invokes no agents and alters neither workflow.

## Remaining uncertainties

- Live PR status and changed-file ownership could not be refreshed: GitHub API DNS resolution failed. PR head identities above come from the supplied inventory, not fetched objects or inspected diffs.
- Public specification retrieval also failed due to DNS. Links below identify authoritative references and relevant sections from established specifications; their current online text was not independently retrieved in this pass.
- No fresh runtime evidence establishes deployments, host availability, mobile-wallet support, security guards, backup completeness, finality or successful end-to-end recovery. Documentation assertions about current hosting/network status need owner evidence.
- The private review packet and unavailable `7979e6f` consolidation were not available. This report cannot close their assignments or certify source completeness.
- Existing screenshots, real-device/assistive-technology findings, representative user studies and human-reviewed locale quality were not established here. No translation or WCAG conformance claim follows from source inspection.
- Proposed wording needs product/security review against the eventual integrated build. API billing was not observed; the $10 target is not a verified expenditure.

## Sources

Repository paths refer to inspected commit `0014bc5b26c7487ea1f9fb230194c36673193236` unless a different snapshot is explicitly given. Public repository: <https://github.com/djshellshoxxx/GhostPay/tree/0014bc5b26c7487ea1f9fb230194c36673193236>.

- Scope/history: `README.md`; `docs/handoffs/LEAN_RELEASE_SCOPE.md`; `docs/handoffs/SOURCE_RECONCILIATION_2026-11-02.md`; `docs/handoffs/GHOSTPAY_PARALLEL_RESEARCH_2026-11-03.md`; supplied untracked `active-pr-ownership.md`.
- Guides: `docs/user/README.md`; `docs/user/review-and-pay-an-invoice.md`; `docs/user/privacy-limits.md`; `docs/user/set-up-stealth-meta-address.md`; `docs/user/receive-and-scan.md`; `docs/user/troubleshooting.md`.
- Specifications: `docs/APP_AND_RELAYER_SPEC.md`; `docs/specs/ideas/09-what-is-public-explainer.md`. Specifications include targets and dated deltas, not blanket evidence of current behavior.
- Source: `apps/web/src/App.tsx`; `apps/web/src/views/Home.tsx`; `apps/web/src/views/Pay.tsx`; `apps/web/src/views/Sweep.tsx`; `apps/web/src/views/SellerKeys.tsx`; `apps/web/src/components/Common.tsx`; `apps/web/src/components/Disclosure.tsx`; `apps/web/src/components/WalletAttempts.tsx`; `apps/web/src/components/CameraImporter.tsx`; `apps/web/src/components/TagArchive.tsx`; `apps/web/src/lib/errors.ts`; `apps/web/src/lib/manifest.ts`; `apps/web/src/lib/keystore.ts`; `apps/web/src/styles/app.css`.
- Test/configuration evidence: `apps/web/src/views/Pay.test.tsx`; `apps/web/e2e/app.spec.ts`; `apps/web/e2e/flows.spec.ts`; `apps/web/e2e/passphrase-vault.spec.ts`; `apps/web/playwright.config.ts`.
- Principal PR references: [#47](https://github.com/djshellshoxxx/GhostPay/pull/47), head `f8193502e602c99bb24ff956f142671750b744a0`; [#52](https://github.com/djshellshoxxx/GhostPay/pull/52), head `68dc5b502f25ed192f3ca82ee4fece8ee91d3bce`; [#53](https://github.com/djshellshoxxx/GhostPay/pull/53), local merge `0014bc5b26c7487ea1f9fb230194c36673193236`; [#41](https://github.com/djshellshoxxx/GhostPay/pull/41), reconciliation snapshot `70d8bf6ec37a5ea61868b9de2a3cea60e22ca6d2`.
- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/): success criteria cited in finding 4. Normative evaluation reference, not a GhostPay compliance result.
- IETF, [RFC 3986 §3.5, Fragment](https://www.rfc-editor.org/rfc/rfc3986.html#section-3.5): fragment handling before URI dereferencing; not protection against application access or history.
- Ethereum EIPs, [EIP-1193, Provider API](https://eips.ethereum.org/EIPS/eip-1193): provider errors including user rejection (4001) and disconnection (4900/4901).
- Ethereum EIPs, [EIP-5564, Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564): stealth meta-addresses and announcements; not certification of this implementation or an anonymity guarantee.
