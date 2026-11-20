# Future-feature continuation — 2026-11-20

This round resumes existing future-feature branches. It does not activate a
future capability in the Pages beta. The discovery snapshot is
[`BRANCH_SNAPSHOT.json`](BRANCH_SNAPSHOT.json).

## Source and scope

- Observed main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Forty future modules have forty-one branch refs because F03 retains separate
  implementation and original specification branches.
- F03 signed invoice-file interchange already has implementation in PR #310.
  Its observed head, `1de98f6c9371010883253450446e6f7294da84fa`, includes the
  invoice memo browser-test repair. It remains separately owned and draft.
- Three independent workers continue F04, F05 and F10 on their original feature
  branches, preserving specification ancestry and incorporating current main.
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

Implementation and independent review results will be recorded here after the
workers freeze their source. A passing unit test is not a browser, wallet,
network-provider or release qualification result. Each feature's own handoff
records completed acceptance criteria and the next bounded task.

The baseline dependency lock is identical to the existing locally available
installation (`e025d878c55cc215315286fc2df277ce5c79116c1507bba79419c789669e0e4e`).
External dependencies are copied into this isolated checkout, and workspace
links target each feature's own source. Internal library outputs are rebuilt
from current main and copied only after checking source identity. No package
version, release gate, coverage threshold or deployment setting is relaxed.
