# Independent privacy requirements and Wiki check — cycle 20261120T0115Z

Reviewer: `/root/final_independent_review`, a native ChatGPT worker separate from the coordinator and current implementation author. This was a read-only source/documentation review; it is not an external audit or runtime acceptance result.

## Scope and source pins

- Owner-authored, open issue: https://github.com/djshellshoxxx/GhostPay/issues/286, “Beta release requirement: five Privacy UX Hardening features”. The GitHub issue response reports `author_association: OWNER`, created and updated `2026-11-19T21:10:30Z`.
- Integration #278: `417f7c71daf8645e1432f2ec8f070110879b80bd`.
- Clipboard primitive #293: `6c648770f5647ca7993cc108ef9e5ede9b46b4c9`.
- The issue explicitly requires all five privacy UX features for 1.0 beta qualification. The broader privacy architecture 5a–5l remains deferred; these five requirements must not be dismissed with that broader future scope.

## Requirement dispositions

| Requirement | Source-backed disposition at the inspected heads |
|---|---|
| Global sensitive-data masking | Missing from the inspected Settings model/UI and global application controls. No global toggle implementing the required balance/address/invoice/payment masking was found. `Scan.tsx` uses a `privateMode` variable for encrypted checkpoint handling; it is not a global visual privacy mode. Screen-sharing/accessibility acceptance of a global mask is not established. |
| Configurable optional clipboard cleanup | Partial and isolated. #293 provides `recordClipboardCopy` and optional `CopyButton.autoClearAfterMs`; repository source search finds the prop supplied only in its component test, with no production caller opting in. Settings, persistence policy, translation and end-to-end integration remain unfinished. #278 does not contain that primitive. |
| Wallet/account switching and lock privacy | Existing partial safeguards, with the complete new acceptance requirement unverified. `AppShell.tsx` suspends session authority, locks the vault and clears scan selections on idle lock; `Pay.tsx` clears decrypted invoice state on lock/session changes; `wallet.ts` watches account/chain/disconnect events. These facts do not establish all-view privacy completion. |
| Private transaction history | Existing partial safeguards, with privacy-mode integration unfinished. `ReconciliationLedger.tsx` begins locked, requires explicit unlock and clears visible state on session changes. A global privacy-mode history policy and complete acceptance evidence are not supplied by these controls. |
| Privacy-safe exports and notifications | Partial safeguards; whole-surface qualification outstanding. Stealth exports have fixed address-free filenames; the application document title is `GhostPay`. These facts do not verify every export, error surface, notification, URL and log against the new requirement. |

These are bounded source-backed dispositions, not five freshly executed feature tests or a claim to have audited every application surface.

## Clipboard implementation and qualification boundary

At #293, `docs/handoffs/CLIPBOARD_PRIVACY_GUARD_20261120.md` correctly calls the primitive isolated and incomplete. It explicitly leaves Settings, storage policy, translation and end-to-end work unfinished. Its original execution status is historical and should remain source-pinned.

The separate independently reviewed test-only correction at `0561fc247350a5957a682bbab94a6eb0ccd4b5c8` resolves the original 23-pass/1-fail Vitest run and 18 lint diagnostics. The reviewer ran 24/24 committed tests and four-file typed lint with zero errors/warnings at that correction. This does not change the primitive runtime, add Settings integration or complete issue #286. The conditional pending-copy interleaving remains separately recorded and is not fixed by that correction.

## Exact source/blob evidence

Unless marked #293, paths below are from #278 `417f7c71daf8645e1432f2ec8f070110879b80bd`.

| Path | Blob |
|---|---|
| `apps/web/src/lib/clipboardPrivacy.ts` (#293) | `5e55f2ca693ef3112e8d12409572b29d96ef86a8` |
| `apps/web/src/components/Common.tsx` (#293) | `6d83d05d31ce3812f3ac9faebdea994a491bf188` |
| `apps/web/src/lib/settings.ts` (same at both heads) | `5d73dc4b122d8d418f3f912d3b7008d1a11ef4d4` |
| `apps/web/src/views/Settings.tsx` (same at both heads) | `fb144d734ef2e05825735e01aaeb3243d43085f7` |
| `docs/handoffs/CLIPBOARD_PRIVACY_GUARD_20261120.md` (#293) | `8bae5acd6455b988647c8b6ec94b9333435d4636` |
| `apps/web/src/AppShell.tsx` | `8e2006a8309403f336efda82c1cc6eb6699f04c4` |
| `apps/web/src/components/ReconciliationLedger.tsx` | `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67` |
| `apps/web/src/lib/wallet.ts` | `fb1d864f3223ce007e35d81c19a308df88657121` |
| `apps/web/src/views/Pay.tsx` | `c44a7789d5c0a7c9952944c11e5dfcbdd00ba099` |
| `packages/ux-vault/src/stealth-export-portable.ts` | `c677180b208bae95573fc4f14ab8ce06d8099cb9` |
| `apps/web/index.html` | `15804d1deb7013314f68d359e4ef9ab04dbbbc1e` |

Key inspected locations: Settings fields/defaults at `settings.ts:6–28`; idle lock at `AppShell.tsx:238–268`; payment lock/session invalidation at `Pay.tsx:438–458`; wallet events at `wallet.ts:318–333`; ledger reset/subscription at `ReconciliationLedger.tsx:223–256` and explicit unlock at `373–379`; fixed filename constants at `stealth-export-portable.ts:180–187`; document title at `index.html:15`.

## Historical completeness language

`docs/engineering-handoffs/continuous-20261119/generation-3-completeness/ASSESSMENT.md`, blob `63ad646a27158105e30d55a550e3e15afc8bf89a`, maps nine maintained feature families at its explicitly pinned source `a1386906c264e2353e39ff8143083b0bbf107395`.

Preserve that historical assessment. Its bounded source-presence finding does not establish completion of the five additional #286 requirements. The current checkpoint should say so explicitly. The original assessment already distinguishes source presence and focused tests from release qualification.

## Wiki navigation and ownership

At both inspected heads, Wiki Home and Sidebar prominently retain User Guide and Developer Guide links. A read-only check extracted relative Markdown links, resolved each relative to its source document and checked the exact Git tree: **11 Home links and 7 Sidebar links, 18 total, all targets present**. Both guides exist.

| Path | Blob |
|---|---|
| `docs/wiki/Home.md` | `7a6f8ac545d8c941319b597f1298b4e5d2406a77` |
| `docs/wiki/_Sidebar.md` | `5f0fc56cc8536445487ddff97b7e91875b0b9880` |
| `docs/wiki/User-Guide.md` | `649702598b7af8b0bc14ee099a14bcfaf3f44894` |
| `docs/wiki/Developer-Guide.md` | `fd1f48db95686bcb85e49de3a3905b5220bff739` |

Home's narrative still includes dated November 15–16 checkpoints and must not be used as current integration evidence. This check did not publish or independently inspect a live Wiki. Repository Home itself states that the Wiki is source-only/unpublished.

Existing documentation recovery drafts were refreshed and remain open/draft:

- #259: https://github.com/djshellshoxxx/GhostPay/pull/259 — `4ff80733a3b36019e2f12fc21a8448e7666b6049`, branch `integration/ghostpay-docs-recovery-20261119`.
- #273: https://github.com/djshellshoxxx/GhostPay/pull/273 — `042b2ce3c79fefb8cbc729fc167894fbeed2c456`, branch `codex/ghostpay-consolidation-records-20261119`.

## Limits and handoff

No tracked source, documentation, branch or live Wiki edit was made by this reviewer. No fresh behavior tests were executed during this documentation phase. The report was later persisted to scratch at the coordinator's request for inclusion in canonical checkpoint evidence. Current owners remain authoritative for their active lanes; this review assigns no competing ownership and provides no release or merge approval.
