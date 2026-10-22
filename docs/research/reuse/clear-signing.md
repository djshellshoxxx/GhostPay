# Reuse research: clear-signing (ERC-7730 / EIP-712 rendering / calldata decode)

Research date: 2026-10-21. Read-only research. No clone, no install, no code copied into the repo.
Verification legend: **V** = verified from raw file or GitHub page this session. **U** = unverified.

## Existing GhostPay code (check first)

- `packages/tx-review` (`@ghostpay/tx-review` 0.1.0, UNLICENSED, deps: `@ghostpay/chain-adapters`, `viem` 2.57.7). Already has `src/decode.ts` (calldata + typed-data decoder), `src/review.ts` (allowlist review, reason codes), `DEVIATIONS.md`, golden + property tests. Spec: `docs/remote/specs/tx-review.md`.
- No ERC-7730 descriptor parsing or registry-driven formatting exists in repo. Grep for `7730|clear.sign` hits only docs and build output.
- Implication: ERC-7730 layer is an add-on to `tx-review`, not a new package.

## Candidate repos

| # | Repo / URL | Licence (verified how) | Commit SHA (date) | Stars | Maintained | Worth reusing | Deps |
|---|---|---|---|---|---|---|---|
| 1 | https://github.com/ethereum/clear-signing-erc7730-registry | **CC0-1.0**. V: sidebar "CC0-1.0 license"; raw https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/LICENSE.md = "CC0 1.0 Universal". Note: root file is `LICENSE.md`, not `LICENSE`. | **2c2ddeb976d8e72fc4a42336cecbd49356a78a96** (2026-10-21T15:06:14Z, "ci: update the Rust test runner to the latest main (#3131)"). V via `commits/master.atom`. | 126 (V) | Yes: 519 commits on master, 3 commits today (V). Note: Ledger docs name `LedgerHQ/clear-signing-erc7730-registry`; the registry now sits under `ethereum/` org per Sourcify (U on canonical status). | `specs/erc7730-v2.schema.json` (current), `specs/erc7730-v2.0.0.schema.json`, `specs/erc7730-v2.1.0.schema.json`, `specs/erc7730-v1.schema.json`, `specs/erc7730-tests-v2.schema.json`, `specs/erc-7730.md`; `registry/` (descriptor JSONs, copyable as test fixtures under CC0); `index.calldata.json`, `index.eip712.json`; `specs/templates/`. Avoid `specs/erc7730-v3.0.0-next.schema.json` (README: "changes without notice, no descriptor should point at it"). | JSON Schema only. `package.json` exists at root (contents U, not read). |
| 2 | https://github.com/LedgerHQ/python-erc7730 | **Apache-2.0**. V: sidebar "Apache-2.0 license"; raw https://raw.githubusercontent.com/LedgerHQ/python-erc7730/main/LICENSE = "Apache License, Version 2.0". | U (commit SHA/date not shown on page; page shows 468 commits, 1 star) | 1 (V) | U: activity not confirmed beyond commit count. | Reference only for lint/format semantics and validation rules. Python, so not copyable into TS. Can be run in CI as a validator (Python >=3.12 per Ledger docs; PyPI `erc7730`). | Python >=3.12 (per Ledger docs, U for pyproject). |
| 3 | https://github.com/LedgerHQ/device-sdk-ts (signer at `packages/signer/signer-eth`) | **Apache-2.0** at repo level. V: sidebar "Apache-2.0 license". File-level SPDX in `signer-eth` not checked (U). | U (SHA/date not shown; 49 stars, 4,483 commits on develop) | 49 (V) | U | Reference for TS ERC-7730 context/metadata-fetch design. Signer only, not standalone. | `@ledgerhq/device-management-kit`, `@ledgerhq/device-signer-kit-ethereum` (npm names per Ledger docs, U for exact versions). Tied to Ledger hardware transport; not a generic renderer. |
| 4 | https://github.com/robdgs/erc-7730Humanizer | **Unverified**. README says "MIT License - see LICENSE file" (claim only). Sidebar shows no licence. LICENSE file fetch returned 404 (not verified). Treat as **unlicensed = reference only**. | U (SHA/date not shown) | 1 (V) | No: ETHGlobal Buenos Aires 2025 hackathon project (V from repo description). | Reference only: `erc7730-descriptors/`, `frontend/`, `hardhat/` folders for TS integration idea. Do not copy. | Next.js + Hardhat (V folder names only). |

Not verified / not usable as sources:
- Rust crate `clear_signing` (docs.rs, ERC-7730 v2, `format_calldata()`, `format_typed_data()`). Fetch failed (ENOTFOUND on docs.rs). Repo URL and licence U. Language is Rust, so reference only.
- npm `@ledgerhq/clear-signing-schemas` (named by Ledger docs, Node AJV route). Not fetched. U.
- Sourcify TypeScript SDK (demo at clear-signing.sourcify.dev). Repo URL, licence, SHA all U. Next step if a TS renderer is wanted.

GitHub API (`api.github.com`) returned 403 via WebFetch. All GitHub data above came from github.com HTML pages, atom feeds, and raw.githubusercontent.com.

## Recommendation

**Decision: adapt** (copy the CC0 spec and descriptor data; write the TS renderer in-house; reference Ledger code).

Why: No permissive TypeScript ERC-7730 renderer was verified. The registry is CC0 and active, so its schemas and descriptors can be copied directly. Rendering logic is short on top of `viem` (already a dependency of `tx-review`). Ledger's libraries are Apache-2.0 but Python or hardware-coupled.

### Files to copy (CC0, pin SHA 2c2ddeb976d8e72fc4a42336cecbd49356a78a96)

- `specs/erc7730-v2.schema.json` (+ `erc7730-v2.0.0`, `erc7730-v2.1.0` if pinning versions)
- `specs/erc7730-tests-v2.schema.json`
- Selected `registry/**/*.json` descriptors for chains and contracts GhostPay touches (Permit2, ERC-20 approve, GhostPay router, sweep relayer). Pick by hand. Do not vendor the whole registry.

### Integration plan

1. **Target path:** `packages/tx-review/src/erc7730/` (new folder). Vendored data: `packages/tx-review/vendor/erc7730/` with `VENDOR.md` recording repo, SHA, CC0 licence file copy, and copy date.
2. **API shape (proposed):**
   - `loadDescriptor(json: unknown): Erc7730Descriptor` (schema-validated)
   - `formatCalldata(descriptor, { to, chainId, data, value }): ClearSignDisplay` where `ClearSignDisplay = { intent: string; fields: { label: string; value: string; format: string }[]; warnings: string[] }`
   - `formatTypedData(descriptor, typedData): ClearSignDisplay`
   - Functions use `viem` `decodeFunctionData` and `hashTypedData` helpers. Unknown selectors or fields return `warnings` and never throw into the review path.
   - Hook into existing `review.ts` as an extra reason-code input: a missing or failed descriptor maps to an existing "unknown intent" code.
3. **Schema validation:** add `ajv` (MIT, U version) only if JSON Schema validation is wanted at runtime. Otherwise validate in CI only.
4. **Tests (vitest, same as tx-review):**
   - Golden: decode known calldata from registry test fixtures; compare `ClearSignDisplay` to expected output.
   - Schema: every vendored descriptor validates against vendored `erc7730-v2.schema.json`.
   - Property (fast-check, already dev dep): formatter never throws on random calldata; unknown selectors yield warnings.
   - Update `DEVIATIONS.md` to record that display is descriptor-driven, not allowlist-only.
5. **Re-sync:** script pinned to SHA; a PR bump is manual. Do not track `master`.

## Risks

- **Supply chain:** Registry is data (JSON), low code risk. Vendoring avoids runtime dependency on GitHub or Sourcify. Ledger Python validator and DMK add supply-chain surface; keep them out of runtime.
- **Abandonment:** Registry is active (3 commits 2026-10-21). Ledger python repo has 1 star; a fork is a fallback. Ledger libs are not safe to depend on blindly.
- **Governance drift:** Sources disagree on canonical org (`LedgerHQ/` vs `ethereum/`). Pin SHA and record which org was used. Sourcify says the Ethereum Foundation is now initial host (U on current status).
- **Spec version:** Ledger says tools target v1 and v2 is draft; this research found v2 schemas in the registry, plus `-next` v3 which must be avoided. Confirm the v2 schema is the one wallets use before shipping.
- **Licence traps:** 
  - CC0 registry is safe.
  - Apache-2.0 Ledger code requires NOTICE retention if copied; reference only.
  - robdgs/erc-7730Humanizer licence unverified; do not copy.
  - Rust `clear_signing` licence unknown; do not copy.
  - Repo `tx-review` is `UNLICENSED`; vendored CC0 data is compatible, Apache code would need NOTICE.
- **Verification gaps:** registry SHA verified via atom feed; LICENSE.md verified raw. Python `pyproject.toml`, `package.json`, Ledger `signer-eth` file headers, and Sourcify SDK are unverified.

## Sources (fetched this session)

- https://github.com/ethereum/clear-signing-erc7730-registry (sidebar licence, stars, folders)
- https://github.com/ethereum/clear-signing-erc7730-registry/commits/master.atom (SHA 2c2ddeb976d8e72fc4a42336cecbd49356a78a96)
- https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/LICENSE.md (CC0 1.0 Universal)
- https://github.com/ethereum/clear-signing-erc7730-registry/tree/master/specs (schema file list)
- https://github.com/LedgerHQ/python-erc7730 (sidebar Apache-2.0, 1 star)
- https://raw.githubusercontent.com/LedgerHQ/python-erc7730/main/LICENSE (Apache License 2.0)
- https://github.com/LedgerHQ/device-sdk-ts (Apache-2.0 sidebar, 49 stars)
- https://github.com/robdgs/erc-7730Humanizer (1 star, no sidebar licence)
- https://developers.ledger.com/docs/clear-signing/overview.md and related Ledger pages (search snippets only)
- https://docs.sourcify.dev/blog/clear-signing-launch/ (search snippet only)
