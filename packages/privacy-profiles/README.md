# @ghostpay/privacy-profiles

Pure TypeScript catalogue of every privacy option from the ten method specs (hygiene, amount-blur, hops, payer-hiding, shielded-pool, external-pools, confidential-tokens, network-privacy, metadata-hardening, btc-payjoin), plus presets, conflict and dependency rules, evaluation, honest label keys, serialisation, and the step and chain rule data from `docs/remote/privacy-specs/chaining.md`.

Testnet proof of concept only. No network, no I/O, no runtime dependencies, no imports of any method package. Spec: `docs/remote/privacy-specs/profiles.md` (section 18 for chaining).

## API

- `OPTION_CATALOGUE`, `OPTION_GROUPS`: 56 options (45 user-selectable, 11 operator, deployment or build scope that are shown as info only).
- `defaultSelection()`, `setOption()`, `acknowledge()`, `applyPreset()`, `evaluate()`, `explain()`, `honestLabel()`.
- `compatibilityMatrix()`, `chainMatrix()`; `node scripts/gen-matrix.mjs [--chain]` after `npm run build` prints them as Markdown.
- `serializeSelection()`, `sanitizeSelection()` (version 1, unknown fields dropped one by one).
- `RULES` (R-01..R-46), `CHAIN_RULES` (C-01..C-35), `STEP_CATALOGUE` (18 step kinds), `WARNING_KEYS`, `ACK_KEYS`, `ERROR_KEYS`.

All functions are total and deterministic. Output is keys and ids, never UI prose.

## Defaults and presets

Every option defaults to today's behaviour (default-off). `standard` changes only four zero-cost values (`invoice.encrypt`, `invoice.coarseTime`, `net.scanAlign`, `btc.ordering=bip69`). `enhanced`, `maximum` and `confidential-amount` pick the first value of an ordered list that the context allows and report each `Downgrade`. Presets never enable hops, never pick experimental, test-only, stub or watch values, never change the Bitcoin mode, and never give acknowledgements.

## Testnet guard

Any non-default value with a chain id outside 31337, 11155111, 84532 (or a Bitcoin network outside testnet, signet, regtest in `btc-*` actions) is blocking (`E_WRONG_CHAIN`, rule R-01). In the `settings` action a `null` chain id is allowed (no transaction is built).

## Does NOT protect

- Nothing on-chain or on the network. A valid selection is not a private one; every non-default value lists what it does not hide (`doesNotHide`) and carries `privacy.warn.noAnonymity`.
- Capabilities (`tor-browser-asserted`, manifests, relayer features, self-test results) are inputs asserted by the caller and are never verified here.
- A forked client can ignore every verdict.
- There is no score, level or ranking; strength classes are kinds of effect.

## Unverified

- Capability names for spike-gated items (`eip7702`, `erc4337-entrypoint`) depend on payer-hiding spike results (spec Q4).
- External standards cited by the spec (RFC 2119 / 8174) could not be fetched in the build sandbox.
- No UI wiring done; see `docs/remote/privacy-specs/wiring/privacy-profiles.md`.
- Coverage numbers and test counts are in the commit message and audit file; rerun `npx vitest run --coverage`.

## Tests

`npx vitest run --coverage` (about 40 s; the preset property tests dominate), `npm run typecheck`, `npm run lint`. Snapshots in `src/__snapshots__/` are the four fixed preset contexts of spec 12.5 and need owner review.
