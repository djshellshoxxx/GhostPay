# @ghostpay/privacy-profiles

Pure TypeScript catalogue of every privacy option from the ten method specs (hygiene, amount-blur, hops, payer-hiding, shielded-pool, external-pools, confidential-tokens, network-privacy, metadata-hardening, btc-payjoin), plus presets, conflict and dependency rules, evaluation, honest label keys, versioned configuration with migration, consent review, immutable snapshots, truthful capability descriptions, and the step and chain rule data from `docs/remote/privacy-specs/chaining.md`. It configures, validates and describes; it never executes a transaction.

Testnet proof of concept only. No network, no I/O, no runtime dependencies, no imports of any method package. Spec: `docs/remote/privacy-specs/profiles.md` (section 18 for chaining).

## API

- `OPTION_CATALOGUE`, `OPTION_GROUPS`: 56 options (45 user-selectable, 11 operator, deployment or build scope that are shown as info only).
- `defaultSelection()`, `setOption()`, `acknowledge()`, `applyPreset()`, `evaluate()`, `explain()`, `honestLabel()`.
- `compatibilityMatrix()`, `chainMatrix()`; `node scripts/gen-matrix.mjs [--chain]` after `npm run build` prints them as Markdown.
- `serializeSelection()`, `sanitizeSelection()` (version 1, lenient: unknown fields dropped one by one).
- Stored configuration (version 2): `toConfig()`, `emptyConfig()`, `serializeConfig()`, `parseConfig()` (strict), `loadConfig()`, `CONFIG_VERSION`.
- Review and commit: `reviewConfig()` (consent requirements), `createSnapshot()`, `snapshotIsCurrent()`.
- Truthful descriptions: `describeConfig()`, `describePreset()`.
- Self-check of the data: `validateDefinitions()`, `findDependencyCycles()`.
- `RULES` (R-01..R-46), `CHAIN_RULES` (C-01..C-35), `STEP_CATALOGUE` (18 step kinds), `WARNING_KEYS`, `ACK_KEYS`, `ERROR_KEYS`, `CONFIG_ERROR_KEYS`.

All functions are total and deterministic: a wrong runtime type never throws, it blocks. Output is keys and ids, never UI prose. Static tables, guard lists and every returned selection, evaluation, config and snapshot are deeply frozen. No function modifies or freezes an object the caller passed in; the one place a caller's own object comes back is a rejected `setOption`, which returns the caller's selection unchanged. Only own properties of inputs are read, so a polluted `Object.prototype` cannot supply a value, an acknowledgement or a capability.

## Defaults and presets

Every option defaults to today's behaviour (default-off). `standard` changes only four zero-cost values (`invoice.encrypt`, `invoice.coarseTime`, `net.scanAlign`, `btc.ordering=bip69`). `enhanced`, `shielded`, `maximum` and `confidential-amount` pick the first value of an ordered list that the context allows and report each `Downgrade`. Presets never enable hops, never pick experimental, test-only, stub or watch values, never change the Bitcoin mode, and never give acknowledgements or consents. A preset result is a proposal: review it, then accept it.

`shielded` (issue 284, F18) is the pool track only: the same exit, amount-plan and pool-payment preferences as `maximum`, with no network hardening, hops, payer sponsors or amount splitting. The selected [D04/D05 policy](../../docs/handoffs/PR644_CONFIGURATION_DECISIONS_20261124.md) uses `buffer` as its sole automatic exit-gas preference. Because `buffer` is the catalogue default, it is omitted from `selection.values`; read `evaluation.effective['sweep.exitGas']` for the effective value. `maximum` retains its advanced order (`eip7702`, `permit-sponsored`, `buffer`) alongside its other preferences. Confidential amounts stay in `confidential-amount` because R-11 and R-13 block combining a confidential asset with a pool.

The advanced gas values remain available through explicit `setOption()` edits, which become `custom` and retain applicability, capability, warning, acknowledgement and party-consent checks. Such a proposal does not authorize signing a permit, installing a delegate or accepting a quote. Buffer funding may reveal funding relationships, and it does not remove `sweep.poolSubmit=relayer` or its consent requirements. Existing saved advanced gas settings survive import and migration; changing a preset's proposal does not rewrite saved values. Both Shielded and Maximum remain unqualified configuration proposals.

## Stored configuration, consent and snapshots

1. `applyPreset()` or `setOption()` gives a selection (these return a `Selection` and do not carry consents; re-attach them with `toConfig(selection, consents)`). `toConfig` makes the stored form (version 2: `v`, `preset`, `values`, `acks`, `consents`).
2. `parseConfig(text)` is strict and all-or-nothing: it reports every problem with a code, a `privacy.err.config.*` key and a JSON-pointer path (unknown fields, options, values, acknowledgements, consents, duplicates, wrong types, a missing or newer version, text over 64 KiB, lists over 64 entries). Version 1 blobs (`serializeSelection`) migrate by adding an empty consent list: a migration never invents consent or acknowledgement. A newer version is refused, not guessed. `loadConfig()` returns the empty config plus the errors instead of a partial salvage.
3. `reviewConfig(config, context)` first normalises the input with the strict rules of the stored format (own properties only, every problem in `configErrors`), then evaluates that normalised configuration, so what is evaluated is exactly what is stored. It lists every consent needed: `party:<trust party>` for each party an effective value relies on, and `experimental:<option>=<value>` for each experimental value. Only values that take effect for the action count; selected options that do not apply to the action are listed in `outOfScope` and stay in the config (rules read the full selection).
4. `createSnapshot(config, context)` succeeds only when the configuration is valid, has no blocking issue (acknowledgements included) and every required consent is recorded; otherwise it returns `privacy.err.snapshot.invalidConfig`, `.blocked` and/or `.consentMissing`. The snapshot keeps only the acknowledgements and consents the configuration needs, keeps the preset label only when the values are exactly what that preset resolves to in this context (otherwise `custom`), and is a deep, frozen copy (capabilities as a sorted array) so later edits to the caller's objects cannot change it. `snapshotIsCurrent()` is false as soon as the configuration, label, required consents, action, chain, environment, asset or capabilities differ, or the input would be refused, so a changed context invalidates a pending review. Capability sets must contain only known capability names; anything else is an invalid context.

A snapshot is an in-memory result, not a credential: store the config and call `createSnapshot` again rather than trusting a stored snapshot. This package has no paid feature, provider call or network request, and nothing here can grant fee, quote or provider consent.

## What a description claims

`describeConfig()` and `describePreset()` say `qualification: 'unqualified'` and `verified: false` always: capabilities are caller assertions and qualification needs exact-context end-to-end evidence this package cannot hold. The best status a value can get is `asserted` (capabilities asserted by the caller, mature enough to offer, supported in this context, nothing blocks it). `asserted` is not `ready`: a description also lists `requiredAcks`, `missingAcks`, `requiredConsents` and `missingConsents`, and `ready` is true only when nothing is missing. Capabilities reported as `missing` come from the value, from its network self-test, and from the `requires` rule that fired, read from the rule's own data. Experimental, test-only, stub and watch values can never be `asserted`; a value with a missing capability, an unsupported chain, environment or asset, or a conflict says so, and `describePreset()` lists what the preset wanted but could not apply (`notApplied`).

## Input handling

`evaluate()` and every function that takes a selection or context repair malformed input to its most restrictive form and add a blocking `E_INVALID_SELECTION` or `E_INVALID_CONTEXT`: an unknown action, environment or asset, a chain id that is not an integer or `null`, capabilities that are not a `Set`, a non-array `acks` (a string would otherwise match acknowledgement keys by substring). Chain support is a separate, rule-level check (R-01): a non-default value on a chain outside 31337, 11155111 and 84532 blocks, and a value that lists chains or assets blocks elsewhere.

## Testnet guard

Any non-default value with a chain id outside 31337, 11155111, 84532 (or a Bitcoin network outside testnet, signet, regtest in `btc-*` actions) is blocking (`E_WRONG_CHAIN`, rule R-01). In the `settings` action a `null` chain id is allowed (no transaction is built).

## Does NOT protect

- Nothing on-chain or on the network. A valid selection is not a private one; every non-default value lists what it does not hide (`doesNotHide`) and carries `privacy.warn.noAnonymity`.
- Capabilities (`tor-browser-asserted`, manifests, relayer features, self-test results) are inputs asserted by the caller and are never verified here.
- A forked client can ignore every verdict.
- There is no score, level or ranking; strength classes are kinds of effect.
- A consent or acknowledgement is a record that the user was told; it does not make a party trustworthy or a value effective.
- `shielded` and `maximum` are names of bundles of options, not levels of protection; both are described as `unqualified`.

## Unverified

- Capability names for spike-gated items (`eip7702`, `erc4337-entrypoint`) depend on payer-hiding spike results (spec Q4).
- External standards cited by the spec (RFC 2119 / 8174) could not be fetched in the build sandbox.
- No UI wiring done; see `docs/remote/privacy-specs/wiring/privacy-profiles.md`.
- Nothing in the repository imports this package yet, and `@ghostpay/privacy-pipeline` keeps its own copy of the rules (its README names the drift risk). Running its PL-7 check against `RULES` is an integration step, not done here.
- Coverage numbers and test counts: see COMPLETION.md; rerun `npx vitest run --coverage`.

## Tests

`npx vitest run --coverage` (about 30 s; the preset property tests dominate), `npm run typecheck`, `npm run lint`, `npm run build`. Snapshots in `src/__snapshots__/` are the fixed preset contexts of spec 12.5 (now five presets) and need owner review. `COMPLETION.md` has the requirement checklist, the mutation checks and the latest results.
