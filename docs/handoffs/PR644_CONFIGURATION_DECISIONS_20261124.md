# PR #644: privacy-profile configuration decisions

Date: November 24, 2026, America/Los_Angeles.

Status: selected technical policy in response to the owner's request to resolve
PR #644's configuration choices. This record distinguishes the decisions from
pending implementation. It does not assert that the follow-up behavior is
implemented, qualified, merged or enabled. The standalone library and the F18
application remain separate deliverables.

## Source baseline

| Source | Inspected revision | Meaning |
| --- | --- | --- |
| Main | `f18e8c0c949459f6ecbe8d2c6d71ea208a6d160f` | Base of this documentation branch. |
| [PR #644](https://github.com/djshellshoxxx/GhostPay/pull/644) | `94ab256e5285f4009f915be18415bf0146a1242f` | Draft standalone library on `nodata/peaceful-faraday-enxrin`. |
| [Legacy profile specification][profiles] | Same #644 revision | Original Q1-Q6 and catalogue requirements. |
| [Full F18 specification][f18] | `5c0f12c5d3373d81ab3fda9095bc3c64b8bd777a` | `future/f18-privacy-modes`; absent from the inspected #644 tree. |
| [Privacy Suite issue #284][issue284] | Read November 24 Pacific | Future product scope and fee constraints. |

The short `docs/future/privacy-first/18-privacy-modes.md` is not the full F18
specification. Section and acceptance-case references below mean the pinned full
specification. This record resolves [DEVIATIONS.md][deviations]'s named choices
without rewriting the active package worker's files.

## 1. Defaults and preset membership

### D01 — Release posture and fresh profiles

Keep F18 application activation disabled for the current beta and preserve its
existing payment/release gates. When a separately implemented profile editor
creates a fresh proposal, use **Standard**. Enhanced, Shielded and Maximum require
explicit selection and review. Names do not rank or certify privacy. Selecting a
preset contacts no provider, creates no wallet request and charges no fee.

This is future configuration policy, not a change to today's browser application.
#644 configures, validates and describes; its [completion report][completion]
leaves application integration outstanding.

### D02 — Q2: Standard adds four settings; legacy values stay intact

Retain the four existing Standard proposal changes:

| Option | Proposed value | Applicability |
| --- | --- | --- |
| `invoice.encrypt` | `on` | Invoice creation. |
| `invoice.coarseTime` | `on` | Invoice metadata. |
| `net.scanAlign` | `on` | Scanning. |
| `btc.ordering` | `bip69` | Supported Bitcoin action only; no Bitcoin beta activation. |

Fresh proposals call `applyPreset('standard', context)` and show effective values.
These settings introduce no new paid service or trust party; this does not mean
an ordinary transaction has no gas or existing protocol cost.

Preserve existing effective settings during migration. Do not apply Standard
automatically on import or error recovery. In #644, `defaultSelection()` and
`emptyConfig()` retain an empty `standard`-labelled compatibility baseline, which
differs from applying Standard. Present it as current/legacy settings until a new
proposal is reviewed. Describe enabled features from effective values, never the
label alone. This library distinction says nothing about current web invoice
encryption: the web app does not consume this new configuration flow.

Evidence: [presets][presets], [resolver][resolver], [config][config] and
[snapshot label handling][snapshot].

### D03 — Q1: retain pool proposal order

Keep `sweep.exit` ordering:

`privacy-pools` → `railgun` → `shielded-pool` → `plain`.

This is deterministic proposal ordering, not evidence of a larger testnet crowd,
stronger protection, provider endorsement or deployment availability. GhostPay's
own pool does not become preferred merely because it may be the only fixture.
Ordinary capability, context, maturity and consent rules remain mandatory.

The current resolver can return `plain` with a downgrade. The future UI must show
the requested pool feature as unavailable. A weaker proposal needs fresh review
and an effective **Custom** summary; a public/plain operation must not be
advertised as Shielded or Maximum. The requested preset may remain visible as
provenance. Never apply proposal fallback automatically to continue an accepted
private-required action.

### D04 — Shielded is a limited pool-track research proposal

Retain the internal `shielded` identifier. Its selected scope is pool exit/source,
denomination planning for the exit, and optional payment delay. Exclude
confidential-token combinations, hops, payer sponsorship, payment splitting and
added network-routing preferences. Local baseline settings remain available.
Keep `confidential-amount` separate.

A future research UI should say **Shielded — pool track, unqualified**, then list
actual effects. This is narrower than issue #284's eventual Shielded product,
which includes confidential amounts and supported hidden parties. It does not
complete that product requirement. Maximum remains a separately reviewed bundle
of pool, network and other supported options. Both descriptions remain
`qualification: 'unqualified'` and `verified: false` in this library.

### D05 — Shielded initially uses buffer-funded exit gas

Select `sweep.exitGas=buffer` as Shielded's sole automatic gas preference.
`permit-sponsored` and `eip7702` remain catalogued advanced edits, available for
proposal only when applicable context and capability checks pass. Individually
review their party, quote and authorization terms. Preset acceptance
does not authorize signing a permit or installing a persistent delegate.

**Follow-up required:** #644 currently inherits
`eip7702` → `permit-sponsored` → `buffer`. The package owner should adjust only
Shielded's gas preference and affected tests/documentation. This record changes
no code. Maximum's advanced proposal order stays intact, subject to the same
separate action authorization.

Buffer funding may reveal funding relationships. It avoids making delegated
spending authority part of the initial Shielded proposal; it is not a stronger
privacy guarantee. It does not remove `sweep.poolSubmit=relayer`: a selected pool
can still require a relayer and its consent. See [catalogue.ts][catalogue].

## 2. Validation, consent and saved configuration

### D06 — Retain consent for every effective trust party

Keep all `party:<trust party>` requirements, including
`own-circuits-dev-ceremony` and `own-unaudited-contracts`. Keep experimental-value
consent in addition to ordinary acknowledgements. Do not exempt GhostPay's own
unaudited components. The UI may group disclosures but must preserve distinct
recorded requirements and allow consent withdrawal.

Consent documents disclosure; it does not establish trust or authorize an
endpoint, fee, signature or delegation. A category such as `party:pool-relayer`
cannot authorize substituting a different operator. The app review must bind the
concrete provider and terms. Acknowledgements cannot waive blocking rules.

### D07 — Reject dependency cycles as an authoring policy

Retain errors for multi-option cycles through `requires` rules or `activeWhen`
conditions.
Full F18 section 6 also rejects descriptor cycles. This keeps resolution
understandable and deterministic; it is not a proof that every cyclic logical
constraint is impossible. A future mutual dependency needs a reviewed composite
or deliberate policy revision, not a silent validator exception.

### D08 — Strict v2 persistence; sanitizer is legacy-only

Use `parseConfig()` at new import/persistence boundaries and `serializeConfig()`
for v2 storage. This version is independent of the proposed F18 outer envelope's
version. Valid v1 migration adds no consent, acknowledgements, providers, paid
modules or effective setting changes.

Unknown/newer versions, unknown fields and invalid input block adoption. Preserve
the original bytes for recovery/export and show located errors. Do not replace a
rejected record with defaults. Keep a valid current profile when an import fails.
On startup without a valid selection, block affected profile-dependent actions
until restore or explicit creation of a fresh selection; retain recovery access.

Preserve `sanitizeSelection()`'s return contract for old v1 callers, but treat it
as deprecated for new integrations. Its silent fallback is not an acceptable
import strategy. `loadConfig()` returns a fallback object **and errors**: errors
prohibit automatic activation or persistence of that fallback. Never discard
them by passing only `loadConfig(...).config` to `createSnapshot()`. The lenient
`toConfig()` constructor is also not an import validator. Evidence:
[config.ts][config], [serialize.ts][serialize].

### D09 — Q3: keep unsupported confidential combinations blocked

Retain blocking R-12, R-13 and R-14 until separately specified and qualified:

| Rule | Combination kept blocked |
| --- | --- |
| R-12 | Non-public amount visibility with any non-direct payer mode, including `fresh-wallet`. |
| R-13 | Non-public amount visibility with `pay.source=shielded-pool`. |
| R-14 | Non-public amount visibility with split or denomination payment amount blurring. |

Retain R-11's separate confidential-asset/pool-or-hop guard. No preset, consent or
experimental toggle bypasses these rules. See [rules.ts][rules].

### D10 — Q5: independent payer and seller application records

Keep the library's action-scoped `Selection` API. The future app stores separate
payer/seller configurations scoped to local profile and wallet/session identity.
Do not add an undocumented `role` to library `Context`, or change the v2 format
merely to hold two configurations.

The outer envelope owns role, revision, session and concurrency binding. Shared
transport changes need review for each affected role, without silently rewriting
the other role's consent or an in-flight plan. Ambiguous legacy settings import
as a draft, never as approval for both roles. Sensitive saved variants use
encrypted storage; ordinary plaintext settings sanitization is insufficient.

## 3. Capability authority and action-time decisions

### D11 — Q4: stable IDs; qualification and availability are separate

Retain `eip7702`, `erc4337-entrypoint` and other existing names. The library stays
pure and treats them as caller assertions. Future adapters derive enabling
assertions from reviewed descriptors and consented observations for the exact
context. A manifest alone does not prove runtime availability; reachability does
not prove privacy qualification. Unknown maturity, unsupported context, absent
evidence or stale observations cannot become available by selecting a preset.

Preset selection triggers zero discovery or network probes. Provider checks
belong to independently authorized operations under the existing network policy.
A Tor Browser user assertion is not verified routing. See [F18 sections 4/9][f18].

### D12 — Support stays testnet-only and evidence-specific

Retain catalogue EVM chain IDs `31337`, `11155111`, `84532` and Bitcoin networks
`testnet`, `signet`, `regtest` for their applicable actions. This validation
boundary does not establish protocol deployment, qualification or availability,
and does not expand beta networks or activate Bitcoin, Node integrations or mainnet.

The app admits only the intersection of its release-approved network, descriptor
support and qualified/current context. Match provider, protocol, asset identity,
browser/build and evidence revision. Library `asset` is an asset kind, not a
token-contract identity. No live Shielded/Maximum context is approved here.

### D13 — Freshness is operation-bound

Historical qualification remains bound to exact source/build/provider context.
A relevant change needs applicable qualification evidence. Elapsed time or a
successful ping cannot broaden that qualification.

Re-evaluate live availability per operation using observations permitted by
network consent. Never restore it as authority from preferences, reload or a
prior session. At review commit and before provider/wallet action, check current
context, the provider policy's freshness bound, operation deadline and quote
expiry. The earliest applicable expiry wins. Missing required freshness policy
means unavailable. Each adapter must supply a reviewed bound before activation;
there is no invented universal TTL. A still-current, authorized observation may
be reused within its bound; re-evaluation does not require unauthorized traffic.

Lock, account/role change, sleep/resume, and changes to endpoint, network, asset,
policy, descriptor, build or evidence revision invalidate pending action review
until revalidated. #644 implements neither a clock nor this outer state machine.

Its [snapshot context][snapshot] covers action, chain, BTC network, environment,
asset kind and capability names. `snapshotIsCurrent()` is one check. The app's
review digest must also bind the concrete account/role, session epoch, endpoint
and provider identity, policy/descriptor digests, build/evidence revision, asset
identity, quote/recipient/fee terms, expiry and workflow revision as applicable.
A library snapshot is not a stored credential or transaction authorization.

### D14 — Weaker alternatives need a separate prospective edit

An uncommitted proposal may show local metadata, timing, query or routing
alternatives. A deliberate relaxation needs the exact changed parties,
disclosures, costs and protections plus fresh acceptance. A user-required module
stays required until that separate edit; retries cannot silently remove it.

Chain/asset validity, valid configuration, key control, fee limits/recipients,
signature scope, required consent, transaction reconciliation and release gates
are never click-through downgrade options. Missing private transport cannot
trigger direct traffic; unavailable pool/confidential settlement cannot silently
become a public payment. Preserve approved in-flight plans, unresolved financial
journals and recovery data.

## 4. Commercial and deployment choices

### D15 — Paid add-ons are unavailable until approved configuration exists

Today's state is **paid capability unavailable / fee policy unconfigured**.
Missing configuration is not an approved zero rate. Invent no prices, caps,
recipients, collection authority or operator revenue split. Existing protocol
fees retain their existing policy. Free/local settings remain usable without
purchasing an optional service.

A future paid capability needs approved versioned terms, bounded quotes, separate
protocol/add-on/gas/third-party line items, and explicit acceptance of the exact
charge. Privacy consent never grants fee consent. The optional P19 gateway stays
outside this library and cannot become mandatory. This resolves current
availability; commercial terms remain a separate owner decision. See
[issue #284][issue284] and [F18 section 8][f18].

### D16 — Q6: no hosted pool default

Do not enable pool exits by default in a hosted build. Legal/deployment review
remains a separate pre-activation gate. This record makes no legal conclusion
and does not make that future review a blocker for standalone configuration policy.

## 5. Implementation handoff and measurable acceptance

The decision task is complete when this record is checked and published. The
following work remains **pending**; it does not imply implementation or authority
to activate F18. Respect #644's active package ownership and claim later slices
separately. Preserve donor/source branches.

| Slice | Bounded work and acceptance |
| --- | --- |
| Package decision alignment | Set Shielded's gas proposal to `buffer`; preserve Maximum and every other membership. Update affected docs/tests/snapshots. A context with all relevant capabilities must still propose buffer; explicit supported advanced edits remain possible with conflicts/consent enforced. Run existing package typecheck, lint, build and test/coverage gates without weakening thresholds. |
| Standard and import integration | Fresh Standard shows the four applicable values. Legacy empty `standard` values survive import unchanged. Valid v1 migration adds no consent. Invalid/newer input reports errors, preserves bytes/current settings and cannot become an accepted fallback through `loadConfig`. |
| Review and role state | Bind D10/D13's outer fields. Account, role, endpoint, quote, expiry, sleep and revision changes invalidate pending reviews. Conflicting tabs return conflict instead of last-writer overwrite. Stale async results cannot restore locked data or alter in-flight plans. |
| Truthful availability and fallback UI | Missing capabilities produces an unavailable pool requirement, not Shielded/Maximum active. Accepted weaker settings show Custom with exact disclosures. Missing/stale private transport produces zero automatic direct requests. Toggling emits zero network/wallet actions. Keyboard/screen-reader users can inspect the same differences and costs. |
| Combined qualification | Reconcile privacy-pipeline's rule copy through PL-7 against `RULES`. Qualify supported compositions and applicable Chromium/Firefox/WebKit cases for F18-AC01 through AC12. Collect exact-context Shielded/Maximum evidence separately. Keep unqualified labels and application activation disabled until separately cleared. |

Before integration, refresh main/#644, inspect overlapping work and satisfy
current review/CI/ownership gates. This document acquires no integration lease
and grants no merge, deployment, pricing or real-funds authority.

## 6. Verification of this record

The change contains one decision record and an additive ownership entry. Review
used pinned source, the original questions, full F18 and two independent
read-only AI reviewers. This is not a professional audit or new end-to-end
privacy qualification.

Publication checks cover source/path references, option/rule names, Markdown
links, whitespace and the repository secret scanner. They are not library,
application, contract or browser test results. The PR body records actual
outcomes and any remaining CI status.

[profiles]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/docs/remote/privacy-specs/profiles.md
[f18]: https://github.com/djshellshoxxx/GhostPay/blob/5c0f12c5d3373d81ab3fda9095bc3c64b8bd777a/docs/future/modules/F18-privacy-modes/SPEC.md
[issue284]: https://github.com/djshellshoxxx/GhostPay/issues/284
[deviations]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/DEVIATIONS.md
[completion]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/COMPLETION.md
[presets]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/presets.ts
[resolver]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/resolve.ts
[config]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/config.ts
[snapshot]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/snapshot.ts
[catalogue]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/catalogue.ts
[serialize]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/serialize.ts
[rules]: https://github.com/djshellshoxxx/GhostPay/blob/94ab256e5285f4009f915be18415bf0146a1242f/packages/privacy-profiles/src/rules.ts
