# Future-feature continuation — 2026-11-20

This round completed and independently reviewed the first implementation
milestone on three existing future-feature branches. All three branches are
published as separate draft PRs. The modules remain disconnected from the
production composition root and the lean Pages application.

| Module | Published branch | Draft PR | Published head | Focused tests |
| --- | --- | --- | --- | --- |
| F04 merchant dashboard | `future/f04-merchant-dashboard` | [#322](https://github.com/djshellshoxxx/GhostPay/pull/322) | `066731b4d6d19d96469dd18fa082b264f3efed5d` | 61/61 |
| F05 GhostProof | `future/f05-ghostproof` | [#323](https://github.com/djshellshoxxx/GhostPay/pull/323) | `ccd1b16dea7be84552f40d3bcd0f23b4224699d3` | 67/67 |
| F10 private recurring | `future/f10-private-recurring` | [#324](https://github.com/djshellshoxxx/GhostPay/pull/324) | `4a48f2f09b1334036a6a88bab4e51f958cee46dd` | 84/84 |

The original discovery inventory is retained in
[`BRANCH_SNAPSHOT.json`](BRANCH_SNAPSHOT.json). The complete publication record
is in [`PUBLICATION_MANIFEST.json`](PUBLICATION_MANIFEST.json).

## Source and scope

- Initial discovery main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Latest incorporated and validated main:
  `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Forty future modules have forty-one branch refs because F03 retains separate
  implementation and original specification branches.
- F03 signed invoice-file interchange already has implementation in PR #310.
  Its observed head, `1de98f6c9371010883253450446e6f7294da84fa`, includes the
  invoice memo browser-test repair. It remains separately owned and draft.
- Three independent workers implemented F04, F05 and F10 on their original
  feature branches. Separate reviewers checked the source and replayed tests.
- Current main was merged into each lane after implementation. Only appended
  ownership records conflicted; both histories were preserved, and every
  future-module source blob remained identical. The changed payment-URI
  package was rebuilt before the compatibility checks.
- Other active privacy, backup, printing, seller-session and beta consolidation
  work is not taken over by this round.

## Implementation lanes

| Module | Existing branch | Selected milestone | Integration boundary |
| --- | --- | --- | --- |
| F04 | `future/f04-merchant-dashboard` | Evidence-qualified local projection, exact asset-separated totals and bounded selectors | Trusted scan evidence is separate from imported status labels; no RPC client or automatic export |
| F05 | `future/f05-ghostproof` | Bounded offline receipt import and accurate assurance/disclosure review | Existing digest and signed receipt formats; no invented proof protocol, chain lookup or ownership claim |
| F10 | `future/f10-private-recurring` | Browser-safe plan/snapshot validation and bounded due-period review | Existing UTC schedule arithmetic; explicit review only, without unattended signing or notification delivery |

Each feature stays outside the production composition root. Internal libraries
are reused only where their data semantics match the feature. In particular,
fiat minor units in the historical merchant ledger and billing plans cannot be
silently relabeled as token atomic units.

## Research decisions

1. **Receipt assurance and trust are separate.** W3C's
   [Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
   distinguishes cryptographic verification from deciding whether an issuer and
   its claims are trusted. F05 uses that distinction as design guidance; it does
   not claim to implement the W3C credential format. A verified GhostPay receipt
   signature alone does not establish chain settlement or a real-world identity.
2. **Preserve the existing billing calendar.**
   [RFC 5545, section 3.3.10](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.10)
   omits recurrence instances with invalid dates. GhostPay's existing monthly
   schedule deliberately clamps to the end of the month and returns to the
   original anchor day afterward. A generic recurrence-rule package would not
   automatically preserve that behavior, so F10 reuses the existing schedule helper.
3. **Observations can be repeated or removed.** Ethereum's
   [JSON-RPC documentation](https://ethereum.org/developers/docs/apis/json-rpc/)
   documents removed logs, and its
   [WebSocket guide](https://ethereum.org/developers/tutorials/using-websockets/)
   explains repeat observations across chain reorganizations. F04 therefore
   needs stable observation identity, conflict handling and reversible totals.
   This milestone does not independently verify a chain or perform network reads.

## Qualification and continuation

The maintained suites pass **212 tests in total**, with no skips. The checks
below were executed against the source checkpoints retained in each feature's
qualification report. Final publication commits add documentation and evidence
only.

| Check | F04 | F05 | F10 |
| --- | --- | --- | --- |
| Independent source review and focused replay | Passed | Passed | Passed |
| Whole-web TypeScript after current-main merge | Passed | Passed | Passed |
| Scoped strict TypeScript and typed ESLint | Passed | Passed | Passed |
| Scoped coverage: statements / branches / functions / lines | 93.70 / 91.17 / 94.28 / 98.98% | 98.68 / 98.11 / 100 / 99.09% | 95.58 / 93.95 / 100 / 100% |
| Lean build and original bundle scanner | Passed; 17 files | Passed; 17 files | Passed; 17 files |
| Application/assets comparison with current main | 16/16 identical | 16/16 identical | 16/16 identical |

The seventeenth output, `ghostpay-lean-build.json`, contains local build-inventory
metadata. Its dependency path prefixes and rendered-length counters differ;
after those metadata fields are normalized, module/export inventories match.
No future module is included in the lean bundle. Raw metadata is not claimed
to be byte-identical.

Independent review prompted a full-string canonical validation correction in
F04; the same terminal-line-break edge case was corrected in F05. Both include
LF, CR, CRLF, U+2028 and U+2029 regression cases. F10 review found no remaining
introduced blocker in the bounded milestone.

Some initial broad TypeScript/lint attempts ended under memory pressure with
exit 137. They remain failed historical attempts. Whole-web TypeScript later
passed serially with a 1,024 MiB Node heap. Scoped typed lint retained all
repository rules while limiting the TypeScript program to the owned files.
There is no claim of an executed successful full-web lint or full-web unit
coverage suite in this round. Browser, wallet, provider, real-payment and full
feature acceptance qualification remain outstanding.

Hosted Actions were queued at publication; see the explicitly time-bounded
[`HOSTED_CHECKS_AT_PUBLICATION.json`](HOSTED_CHECKS_AT_PUBLICATION.json).
Queued/pending checks are not passes. The three PRs remain drafts while hosted
gates and remaining acceptance work are incomplete.

| Module | Qualification record | Next bounded milestone |
| --- | --- | --- |
| F04 | [Verification](https://github.com/djshellshoxxx/GhostPay/blob/066731b4d6d19d96469dd18fa082b264f3efed5d/docs/future/modules/F04-merchant-dashboard/COORDINATOR_VERIFICATION.md), [handoff](https://github.com/djshellshoxxx/GhostPay/blob/066731b4d6d19d96469dd18fa082b264f3efed5d/docs/future/modules/F04-merchant-dashboard/HANDOFF.md) | Compose trusted P03 evidence and coverage, then P05 encrypted journal/concurrency before UI/export/recovery acceptance. |
| F05 | [Verification](https://github.com/djshellshoxxx/GhostPay/blob/ccd1b16dea7be84552f40d3bcd0f23b4224699d3/docs/future/modules/F05-ghostproof/COORDINATOR_VERIFICATION.md), [handoff](https://github.com/djshellshoxxx/GhostPay/blob/ccd1b16dea7be84552f40d3bcd0f23b4224699d3/docs/future/modules/F05-ghostproof/HANDOFF.md) | Connect localized review UI and app-lock cancellation, with actual P12/P05 claim generation and export separately qualified. |
| F10 | [Verification](https://github.com/djshellshoxxx/GhostPay/blob/4a48f2f09b1334036a6a88bab4e51f958cee46dd/docs/future/modules/F10-private-recurring/COORDINATOR_VERIFICATION.md), [handoff](https://github.com/djshellshoxxx/GhostPay/blob/4a48f2f09b1334036a6a88bab4e51f958cee46dd/docs/future/modules/F10-private-recurring/HANDOFF.md) | Add authenticated P04/P05 artifacts/templates and transactional reservation, then multi-tab/crash recovery and paused legacy migration. |

These are M1 milestones, not completed full features. F05 does not create
zero-knowledge or ownership proofs. F10 returns a reviewed selection and does
not issue/sign an invoice or activate restored legacy plans. F04 uses an
injected local evidence interface and does not independently verify a chain.

The baseline dependency lock is identical to the existing locally available
installation (`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`).
External dependencies are copied into this isolated checkout, and workspace
links target each feature's own source. Internal library outputs are rebuilt
from current main and copied only after checking source identity. No package
version, release gate, coverage threshold or deployment setting is relaxed.

## Publication integrity

Each branch update was a non-forced fast-forward from its observed original
specification head. The authenticated GitHub API was used because this
checkout had no Git push credential. Every recreated commit preserved its
ordered parent structure and exact full Git tree; the mapping records original
local and published SHAs. Fetching the final remote refs confirmed all three
published heads and full trees exactly. No existing source branch was reset
or overwritten.

Feature-specific console evidence is tracked under each module's
`verification/coordinator/`, with SHA-256 manifests. Shared baseline/library
evidence is under [`evidence/`](evidence/). Console files use `.txt` so the
repository's ignored `.log` pattern cannot silently omit them. Current-main
validation records supersede the older baseline for compatibility claims.

This coordination branch contains documentation and evidence only. It leaves
the three implementation branches independent and does not merge or deploy
them to main.
