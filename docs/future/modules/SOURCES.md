# Source map and scope reconciliation

Snapshot date: 2026-11-19, America/Los_Angeles. Source commit: c977b5d6723f6822c3b5d86cd6b231712c53c395. Source documents and issue bodies were inspected directly; code presence is separate from runtime qualification.

## Authoritative inputs

| Source | Canonical coverage |
|---|---|
| [Privacy-first catalog](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/README.md) | F01–F18, preserving all 18 named products |
| [Architecture 5a–5l](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-architecture/README.md) | Alias map below; 5k stays spec 18 |
| [Issue #283](https://github.com/djshellshoxxx/GhostPay/issues/283) | Network privacy, selective disclosure, confidential settlement and research boundaries |
| [Issue #284](https://github.com/djshellshoxxx/GhostPay/issues/284) | P01–P18, F18 editable presets, FEE01 fees |
| [P19 owner addendum](https://github.com/djshellshoxxx/GhostPay/issues/284#issuecomment-7020857691) | Optional self-hosted fee gateway |
| [Issue #288](https://github.com/djshellshoxxx/GhostPay/issues/288) | T01, T02 and FEE01 paid-feature consent |
| [Issue #287](https://github.com/djshellshoxxx/GhostPay/issues/287) | Current v1.1 requirements, traceability only |

## Architecture aliases

| Original ID | Canonical module(s) |
|---|---|
| 5a | P18 |
| 5b | P05, P06 |
| 5c | P03, P06 |
| 5d | P02, P03, F15 |
| 5e | P08, F17 |
| 5f | P04, P11, F03 |
| 5g | P01 |
| 5h | P09, P10 |
| 5i | P06, P09, P10, F16 |
| 5j | P13, P14, P15, P16, P17 |
| 5k | existing-spec-18 |
| 5l | P18 |

## Existing release scope remains independent

5k / requirement 3q maps only to [spec 18](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/specs/18-stealth-keypair-export.md). Issue #287 remains v1.1 scope: address reuse→P08/F17; invoice minimization→P04/P11/F03; wallet disclosure→F03/F17/P09; retention→P05/F04. These future modules cover broader reusable capabilities and cannot delay those releases.

## Branch and implementation reconciliation

318 branches were inspected. [PR #99](https://github.com/djshellshoxxx/GhostPay/pull/99) supplied the product catalog and is merged. [PR #191](https://github.com/djshellshoxxx/GhostPay/pull/191) is closed, but its head is an ancestor of the pinned main. No individual future/<id>-<slug> branches existed in the inspected inventory. Existing catalog branches are preserved.

The six-feature post-launch roadmap and docs/remote specifications are supporting history, not six extra branches: they include already implemented helpers and unfinished prototypes. Reuse must inspect privacy-profiles, privacy-pipeline, hops, amount-blur, metadata-hardening, pool-*, confidential-*, external-pools*, merchant-*, ux-* and browser components. Presence is not qualification.

Active UI, recovery, transport and consolidation lanes retain ownership. This task owns new docs and additive claims only; it does not import their runtime changes.

## Open decisions

New rates, recipients, supported paid networks, version and enforcement design need owner selection. Confidential settlement, shielded proofs, bridges, artifact trust, audits and supported devices need separate protocol decisions and evidence. Optional services cannot become necessary for independent recovery.

## Publication-time concurrency update

A separate active F03 implementation appeared after the initial branch inventory: future/f03-private-payment-links at dd665344d6290c109d2292093e01903e4770adff, based on newer main 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5. It is preserved read-only. The F03 specification branch is future/f03-private-payment-links-spec; its baseline remains the inspected c977b5d6 snapshot. These specs are not an assertion that no newer implementation exists. Every implementation task must refresh the live branch comparison.
