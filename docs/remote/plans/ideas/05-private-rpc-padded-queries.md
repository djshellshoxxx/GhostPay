# Plan: idea 05 (A6) private RPC mode with padded fixed-window queries

Spec: [docs/specs/ideas/05-private-rpc-padded-queries.md](../../../specs/ideas/05-private-rpc-padded-queries.md). Supersedes the stage-1 details of spec 10 (corrections listed in spec section 12). Owners: CA = chain-adapters, WEB = apps/web, DOC. Estimates are single-engineer days, unverified guesses.

## Order and slices
| # | Slice | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 0 | ADR: second entry page + CSP split, endpoint kinds, "asserted vs verified" labelling | docs/adr/ (next free number) | DOC | 0.5 | merged before slices 4-5 |
| 1 | Endpoint kinds and validation | packages/chain-adapters/src/rpc.ts (edit), src/transport.ts, tests | CA | 1 | url tables green |
| 2 | `policyTransport` + method allowlist + audit hook; central `services.rpc(chainId)` factory; lint/test forbidding stray `fetch`/`WebSocket` | chain-adapters/src/transport.ts, apps/web/src/lib/services.ts + defaultServices.ts (edit), scripts or test for grep | CA, WEB | 1.5 | factory used by scan/sweep/pay/readback |
| 3 | Window planner + `fetchAnnouncements({windowPolicy})`, contiguous-prefix cursor, finalized-only checkpoint, start blur, cover windows (off), shuffled order, injected sleep/random | chain-adapters/src/windows.ts, logs.ts (edit), tests | CA | 2 | property tests, no-policy path unchanged |
| 4 | Settings model (additive in `ghostpay.settings.v1`), Settings UI, preset, status line, fallback modal | apps/web/src/lib/settings.ts (edit), views/Settings.tsx, components/PrivacyStatus.tsx, views/Scan.tsx + Sweep.tsx (edit) | WEB | 1.5 | component tests |
| 5 | Strict private page: Vite multi-page entry, meta CSP, onion allowance in `checkRelayerUrl` for that build only, release/SRI verification covers it | apps/web/private/index.html, vite config (edit), public/_headers (edit), scripts/scan-bundle.mjs (edit, path UNVERIFIED) | WEB | 1.5 | Playwright CSP block test |
| 6 | Wire `requestWithFallbackCheck` / `secondary` into scanner (gap 7) with the same policy | web scanClient.ts (edit) | WEB | 0.5 | disagreement test |
| 7 | Egress tests: outgoing-body schema test, Playwright allowlist, malicious endpoint fixtures | chain-adapters tests, apps/web e2e | CA, WEB | 1 | green |
| 8 | Docs + manual compatibility matrix | docs/user/private-rpc.md, docs/operators/local-scanner-and-rpc.md (edit: remove "no Tor mode" statement only once true), docs/reviews/ matrix, SPEC_REVIEW C5 check | DOC | 1 | review |
| 9 (optional) | Reference forwarder | tools/private-rpc-proxy/ | WEB | 1-2 | loopback/origin-pin tests |
Total 6-8 d (+1-2 for slice 9). Slices 1-3 are independent of UI and can ship behind the default-off `windowPolicy`.

## Task notes
- Grid defaults: W = min(1000, chain.getLogsMaxRange); never auto-change W (would break the shared grid).
- Checkpoint compatibility: direct-mode cursors re-align downward on first private run; dedupe by `blockHash:logIndex`.
- Tor defaults only when mode is not Direct: timeout 45 s, retries 3, parallel 1.
- The private page must not import code paths that call clearnet endpoints (price feeds from spec 03, relayer); hide those features there rather than letting them fail on CSP.
- Do not add any wording "anonymous", "untraceable", "hidden from the provider" without the qualifier; add a grep check to the docs lint.
- Coordinate with plan for spec 02 (scanner robustness) and spec 01: introduce the factory first to avoid merge conflicts.

## Risks and mitigations
- Users believe it is anonymity: status line, table, browser-limits section, Paranoid preset still labelled "not anonymity".
- Browser limits differ from the spec's UNVERIFIED claims (CSP wildcard, mixed content on onion, Chrome PNA): manual matrix before docs claim support; fallback guidance (open the app from an onion/IPFS/local copy).
- Hole-skipping cursor bug loses payments: property tests, contiguous-prefix rule, independent review of slice 3.
- Provider blocks Tor exits: fail closed with specific message; document own-node route.
- Scope creep into operator services: rejected list in the spec; reviewers check no GhostPay-operated endpoint appears in code or docs.

## Gates
G-A6a (after 1-3): window/cursor properties and outgoing-body audit green; existing logs/rpc tests untouched. G-A6b (after 4-7): Playwright egress allowlist and strict-CSP block green. G-A6c (after 8): manual matrix recorded, docs claims checked against the spec's disclosure table, self-review in `docs/reviews/`.

## Open decisions for the owner
ADR on the second entry page; hosting of the app via onion/IPFS (ADR-0015, owner-gated); whether to ship the reference forwarder; default preset; whether the private page ships in the first release or only the in-app modes.
