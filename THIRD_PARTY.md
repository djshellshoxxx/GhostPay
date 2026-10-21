# Third-party register

Every third-party component GhostPay builds on, with exact version, licence, purpose, where it is used and a review note. Required by `SECURITY.md` ("No new runtime dependency without a `THIRD_PARTY.md` entry") and ADR-0004.

Status: **pre-audit**. "Review note" records what the project has actually checked, which for most transitive packages is only the licence field and `npm audit`. Nothing here is an endorsement or a security review of the upstream code.

How to keep this file true:

```bash
node docs/tools/third-party-table.mjs --write     # regenerate the tables from package-lock.json
node docs/tools/third-party-table.mjs --check     # fail if the tables are stale (suitable for CI; not wired in yet)
node docs/tools/third-party-table.mjs --verify    # compare lockfile licences/versions with node_modules (after npm ci)
```

Facts established when this file was written (2026-10-21): `npm audit` (full and `--omit=dev`) reported 0 vulnerabilities in audit 03; all `package.json` versions are exact pins; the lockfile has no git or tarball dependencies; the only install script in the lockfile is `fsevents` (macOS, optional) and CI installs with `npm ci --ignore-scripts`. The `--verify` run of this script found the installed licences and versions identical to the lockfile (see "Spot-check" below).

## 1. Known contradiction: ADR-0004 vs what viem installs

ADR-0004 says "`@noble/curves` 2.x, `@noble/hashes` 2.x, `@noble/ciphers` 2.x ... No other crypto library." The direct GhostPay code does follow that (`core-crypto`, `invoice-schema`, `chain-adapters`, `btc-silent-payments` and `web` depend on noble 2.4.0 exactly). But the pinned `viem` 2.57.7 depends on **`@noble/curves` 1.9.1 and `@noble/hashes` 1.8.0** (nested copies under `node_modules/viem/node_modules/`), `ox` 0.14.56 pulls `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0 and `@noble/ciphers` 1.3.0, and `@scure/bip32` 1.7.0 pulls `@noble/curves` 1.9.7. So the installed tree contains **two major versions of noble**, and whatever viem needs (transaction signing, keccak, address derivation in `viem/accounts`) runs on the 1.x copies.

Consequences, stated honestly:

- The sentence "no other crypto library" in ADR-0004 is not literally true for the dependency closure. It is true for code written in this repository.
- Which 1.x modules end up in `apps/web/dist` has **not been measured**. A bundle size/content check (for example listing the noble 1.x files in the build output) is an open item.
- Duplicated curve libraries enlarge the audited surface and can diverge in behaviour (for example point validation). GhostPay's own derivation uses 2.x only, and the vector tests (`test-vectors/scheme1.json`) cross-check it against ScopeLift's SDK, which uses `@noble/secp256k1` 2.3.0, so a 1.x/2.x disagreement on GhostPay's own paths would be visible, but viem's internal use is not covered by those tests.
- Options for the owner: (a) accept and amend ADR-0004 to say "own code uses noble 2.x; viem's pinned 1.x copies are accepted", (b) use npm `overrides` to force 2.x for viem (untested against viem 2.57.7; viem declares exact 1.x pins, so this could break), (c) wait for a viem release that moves to noble 2.x. No decision has been made; this file only records the situation.

## 2. Registers

<!-- BEGIN GENERATED: docs/tools/third-party-table.mjs -->

_Generated from `package-lock.json` (lockfileVersion 3, 257 third-party entries, 6 workspace packages) by `docs/tools/third-party-table.mjs`. Do not edit this block by hand; run `node docs/tools/third-party-table.mjs --write`._

Licence summary (entries): MIT 201, Apache-2.0 20, MPL-2.0 12, BSD-2-Clause 8, ISC 7, BSD-3-Clause 3, MIT-0 2, BlueOak-1.0.0 2, NOT DECLARED 1, CC0-1.0 1.

Root `package.json` declares no dependencies of its own (0 dependencies, 0 devDependencies).

### Workspace packages (first party)

| Package | Version | Licence | Path |
|---|---|---|---|
| `@ghostpay/relayer` | 0.1.0 | UNLICENSED | `apps/relayer` |
| `@ghostpay/web` | 0.1.0 | UNLICENSED | `apps/web` |
| `@ghostpay/btc-silent-payments` | 0.1.0 | UNLICENSED | `packages/btc-silent-payments` |
| `@ghostpay/chain-adapters` | 0.1.0 | UNLICENSED | `packages/chain-adapters` |
| `@ghostpay/core-crypto` | 0.1.0 | UNLICENSED | `packages/core-crypto` |
| `@ghostpay/invoice-schema` | 0.1.0 | UNLICENSED | `packages/invoice-schema` |

### Runtime closure (24 entries)

Reachable from a workspace package through `dependencies` (and optional dependencies). Not every entry is bundled into the browser app or loaded by the relayer: whether tree-shaking drops an entry has not been measured.

| Package | Version | Licence | Used by | Purpose | Review note |
|---|---|---|---|---|---|
| `@adraffy/ens-normalize` | 1.11.1 | MIT | chain-adapters, core-crypto, relayer, web; via viem | ENS name normalisation used by `ox`. | Transitive of viem. |
| `@noble/ciphers` (nested in `ox`) | 1.3.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/ciphers required by ox (different version from the top-level copy). | nested copy at `node_modules/ox/node_modules/@noble/ciphers` |
| `@noble/curves` | 2.4.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; direct: btc-silent-payments (runtime), chain-adapters (runtime), core-crypto (runtime), invoice-schema (runtime) | secp256k1 / ECDH / ECDSA / Schnorr primitives for stealth derivation, invoice signatures and BIP-352. | Direct dependency is 2.x per ADR-0004. Independently audited upstream; GhostPay code has not audited it. |
| `@noble/curves` (nested in `@scure/bip32`) | 1.9.7 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/curves required by @scure/bip32 (different version from the top-level copy). | nested copy at `node_modules/@scure/bip32/node_modules/@noble/curves` |
| `@noble/curves` (nested in `ox`) | 1.9.1 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/curves required by ox (different version from the top-level copy). | nested copy at `node_modules/ox/node_modules/@noble/curves` |
| `@noble/curves` (nested in `viem`) | 1.9.1 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/curves required by viem (different version from the top-level copy). | nested copy at `node_modules/viem/node_modules/@noble/curves` |
| `@noble/hashes` | 2.4.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; direct: web (runtime), btc-silent-payments (runtime), chain-adapters (runtime), core-crypto (runtime), invoice-schema (runtime) | keccak-256, SHA-256, HMAC, HKDF and scrypt (keystore). | Direct dependency is 2.x per ADR-0004. |
| `@noble/hashes` (nested in `@scure/bip32`) | 1.8.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/hashes required by @scure/bip32 (different version from the top-level copy). | nested copy at `node_modules/@scure/bip32/node_modules/@noble/hashes` |
| `@noble/hashes` (nested in `@scure/bip39`) | 1.8.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/hashes required by @scure/bip39 (different version from the top-level copy). | nested copy at `node_modules/@scure/bip39/node_modules/@noble/hashes` |
| `@noble/hashes` (nested in `ox`) | 1.8.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/hashes required by ox (different version from the top-level copy). | nested copy at `node_modules/ox/node_modules/@noble/hashes` |
| `@noble/hashes` (nested in `viem`) | 1.8.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Nested copy of @noble/hashes required by viem (different version from the top-level copy). | nested copy at `node_modules/viem/node_modules/@noble/hashes` |
| `@scure/base` | 1.2.6 | MIT | btc-silent-payments, chain-adapters, core-crypto, relayer, web; direct: btc-silent-payments (runtime) | Bech32m encoding for BIP-352 `sp1` addresses. | Same author as noble. Runtime of `btc-silent-payments`; that package is not used by the web app or relayer yet. |
| `@scure/bip32` | 1.7.0 | MIT | chain-adapters, core-crypto, relayer, web; direct: btc-silent-payments (dev) | BIP-32 derivation: dev dependency of `btc-silent-payments` (tests); also a runtime dependency of viem. | viem pins its own 1.7.0 -> noble 1.9.x chain. |
| `@scure/bip39` | 1.6.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Mnemonic support inside viem (`viem/accounts`). | Pulled in by viem; GhostPay does not call it. Bundled only if tree-shaking keeps it (not measured). |
| `abitype` | 1.2.3 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Type-level ABI helpers used by viem. | Transitive of viem. |
| `eventemitter3` | 5.0.1 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Event emitter used by `ox`. | Transitive of viem. |
| `isows` | 1.0.7 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Isomorphic WebSocket shim used by viem. | Transitive of viem. |
| `ox` | 0.14.56 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Low-level Ethereum utilities used by viem. | Transitive of viem. Carries its own `@noble/curves` 1.9.1, `@noble/hashes` 1.8.0 and `@noble/ciphers` 1.3.0. |
| `qrcode-generator` | 2.0.4 | MIT | web; direct: web (runtime) | Local QR-code generation for invoice links (no network). | Single-purpose, no dependencies. Output is rendered as SVG React elements. |
| `react` | 19.3.1 | MIT | web; direct: web (runtime) | UI library for `apps/web`. | Pinned exactly (ADR-0004: 19.x). |
| `react-dom` | 19.3.1 | MIT | web; direct: web (runtime) | DOM renderer for `apps/web`. | Contains inert `innerHTML` strings that `apps/web/scripts/scan-bundle.mjs` allows by exact fingerprint (see web DEVIATIONS item 21). |
| `scheduler` | 0.28.0 | MIT | web; via react-dom | React scheduler. | Transitive of react-dom. |
| `viem` | 2.57.7 | MIT | chain-adapters, core-crypto, relayer, web; direct: relayer (runtime), web (runtime), chain-adapters (runtime), core-crypto (runtime) | EVM client: ABI coding, EIP-712 hashing, transaction building, RPC transport. | Pinned exactly. Brings its own `@noble/*` 1.x copies (see ADR-0004 contradiction below). |
| `ws` | 8.21.0 | MIT | chain-adapters, core-crypto, relayer, web; via viem | Node WebSocket client used by `isows` on Node (relayer, tests). | Transitive of viem. Browsers use the native WebSocket. |

### Build, test and tooling (233 entries)

Reachable only through `devDependencies`. None of these is shipped in `apps/web/dist`; the relayer Dockerfile runs `npm prune --omit=dev` before copying `node_modules` (that image has not been built in the authoring sandbox).

| Package | Version | Licence | Used by | Note |
|---|---|---|---|---|
| `@asamuzakjp/css-color` | 7.1.7 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@asamuzakjp/dom-selector` | 10.0.4 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@babel/code-frame` | 7.29.7 | MIT | -; transitive | Transitive dependency. |
| `@babel/helper-string-parser` | 7.29.7 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@babel/parser` | 7.29.9 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@babel/runtime` | 7.29.10 | MIT | web; via @testing-library/react | Transitive dependency of @testing-library/react. |
| `@babel/types` | 7.29.8 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@bcoe/v8-coverage` | 1.0.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@bramus/specificity` | 2.4.3 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@cacheable/memory` | 2.2.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@cacheable/utils` | 2.5.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@csstools/color-helpers` | 6.1.2 | MIT-0 | web; via jsdom | Transitive dependency of jsdom. |
| `@csstools/css-calc` | 3.4.3 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@csstools/css-color-parser` | 4.2.6 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@csstools/css-parser-algorithms` | 4.0.2 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@csstools/css-syntax-patches-for-csstree` | 1.1.15 | MIT-0 | web; via jsdom | Transitive dependency of jsdom. |
| `@csstools/css-tokenizer` | 4.0.2 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@eslint-community/eslint-utils` | 4.10.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `@eslint-community/regexpp` | 4.12.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `@eslint/config-array` | 0.23.5 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@eslint/config-helpers` | 0.7.0 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@eslint/core` | 1.2.1 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@eslint/js` | 10.0.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; direct: btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `@eslint/object-schema` | 3.0.5 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@eslint/plugin-kit` | 0.7.3 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@exodus/bytes` | 1.16.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `@graphql-typed-document-node/core` | 3.2.0 | MIT | core-crypto; via @scopelift/stealth-address-sdk | Transitive dependency of @scopelift/stealth-address-sdk. |
| `@humanfs/core` | 0.19.2 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@humanfs/node` | 0.16.8 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@humanfs/types` | 0.15.0 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@humanwhocodes/module-importer` | 1.0.1 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@humanwhocodes/retry` | 0.4.3 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `@keyv/bigmap` | 1.3.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@keyv/serialize` | 1.1.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@noble/ciphers` | 2.4.0 | MIT | invoice-schema; direct: invoice-schema (dev) | Dev only; not in any shipped bundle. Production AES uses Web Crypto. |
| `@noble/secp256k1` | 2.3.0 | MIT | core-crypto; via @scopelift/stealth-address-sdk | Dev only. |
| `@oxc-project/types` | 0.154.0 | MIT | web; via vite | Transitive dependency of vite. |
| `@playwright/test` | 1.64.1 | Apache-2.0 | web; direct: web (dev) | Dev only. Downloads browsers outside npm (not part of the lockfile). |
| `@rolldown/binding-android-arm-eabi` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-android-arm64` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-darwin-arm64` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-darwin-x64` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-freebsd-x64` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-arm-gnueabihf` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-arm64-gnu` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-arm64-musl` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-ppc64-gnu` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-s390x-gnu` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-x64-gnu` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-linux-x64-musl` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-openharmony-arm64` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-win32-arm64-msvc` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/binding-win32-x64-msvc` | 1.2.14 | MIT | web; via vite | optional |
| `@rolldown/pluginutils` | 1.0.1 | MIT | web; via @vitejs/plugin-react, vite | Transitive dependency of @vitejs/plugin-react, vite. |
| `@scopelift/stealth-address-sdk` | 1.0.0-beta.5 | NOT DECLARED | core-crypto; direct: core-crypto (dev) | No `license` field in the lockfile entry; the installed package ships an MIT LICENSE file (Copyright 2024 ScopeLift). Not shipped. no licence declared: check manually |
| `@testing-library/dom` | 10.4.2 | MIT | -; transitive | Transitive dependency. |
| `@testing-library/react` | 16.3.3 | MIT | web; direct: web (dev) | Dev only. |
| `@testing-library/user-event` | 14.6.8 | MIT | web; direct: web (dev) | Dev only. |
| `@types/aria-query` | 5.0.4 | MIT | -; transitive | Transitive dependency. |
| `@types/chai` | 5.2.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `@types/deep-eql` | 4.0.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `@types/esrecurse` | 4.3.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@types/estree` | 1.0.9 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, eslint, vitest | Transitive dependency of @vitest/coverage-v8, eslint, vitest. |
| `@types/json-schema` | 7.0.15 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `@types/node` | 26.6.5 | MIT | relayer; direct: relayer (dev) | Dev only. Workspaces pin different majors (22 and 26). |
| `@types/node` | 22.20.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; direct: btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. Workspaces pin different majors (22 and 26). |
| `@types/react` | 19.3.0 | MIT | web; direct: web (dev) | Dev only. |
| `@types/react-dom` | 19.3.0 | MIT | web; direct: web (dev) | Dev only. |
| `@typescript-eslint/eslint-plugin` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/parser` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/project-service` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/scope-manager` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/tsconfig-utils` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/type-utils` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/types` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/typescript-estree` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/utils` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@typescript-eslint/visitor-keys` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `@vitejs/plugin-react` | 6.1.2 | MIT | web; direct: web (dev) | Dev only. |
| `@vitest/coverage-v8` | 5.0.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; direct: relayer (dev), web (dev), btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `@vitest/istanbul-lib-coverage` | 1.0.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@vitest/istanbul-lib-report` | 1.0.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `@vitest/mocker` | 5.0.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `@vitest/spy` | 5.0.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `acorn` | 8.19.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `acorn-jsx` | 5.3.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `ajv` | 6.15.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `ansi-regex` | 5.0.1 | MIT | -; transitive | Transitive dependency. |
| `ansi-styles` | 5.2.0 | MIT | -; transitive | Transitive dependency. |
| `aria-query` | 5.3.0 | Apache-2.0 | -; transitive | Transitive dependency. |
| `assertion-error` | 2.0.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `ast-v8-to-istanbul` | 1.0.7 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `balanced-match` | 4.0.4 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `bidi-js` | 1.1.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `brace-expansion` | 5.0.12 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `cacheable` | 2.5.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `chai` | 6.3.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `cross-spawn` | 7.0.6 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `css-tree` | 3.2.1 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `csstype` | 3.2.3 | MIT | web; via @types/react | Transitive dependency of @types/react. |
| `data-urls` | 8.0.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `debug` | 4.4.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `decimal.js` | 10.6.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `deep-is` | 0.1.4 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `dequal` | 2.0.3 | MIT | -; transitive | Transitive dependency. |
| `detect-libc` | 2.1.2 | Apache-2.0 | web; via vite | Transitive dependency of vite. |
| `dom-accessibility-api` | 0.5.16 | MIT | -; transitive | Transitive dependency. |
| `entities` | 8.1.0 | BSD-2-Clause | web; via jsdom | Transitive dependency of jsdom. |
| `es-module-lexer` | 2.3.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `escape-string-regexp` | 4.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `eslint` | 10.13.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; direct: btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `eslint-scope` | 9.1.2 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `eslint-visitor-keys` (nested in `@eslint-community/eslint-utils`) | 3.4.3 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | nested copy at `node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys` |
| `eslint-visitor-keys` | 5.0.1 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `espree` | 11.2.0 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `esquery` | 1.7.0 | BSD-3-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `esrecurse` | 4.3.0 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `estraverse` | 5.3.0 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `estree-walker` | 3.0.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `esutils` | 2.0.3 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `expect-type` | 1.4.0 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `fast-check` | 4.10.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer; direct: relayer (dev), btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `fast-deep-equal` | 3.1.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `fast-json-stable-stringify` | 2.1.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `fast-levenshtein` | 2.0.6 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `fdir` | 6.5.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via typescript-eslint, vite, vitest | Transitive dependency of typescript-eslint, vite, vitest. |
| `file-entry-cache` | 11.1.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `find-up` | 5.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `flat-cache` | 6.1.23 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `flatted` | 3.4.4 | ISC | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `fsevents` | 2.3.3 | MIT | web; transitive | Only lockfile entry with an install script; skipped by `npm ci --ignore-scripts` and absent on Linux. optional has install script |
| `glob-parent` | 6.0.2 | ISC | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `graphql` | 16.14.2 | MIT | -; transitive | Transitive dependency. |
| `graphql-request` | 7.4.0 | MIT | core-crypto; via @scopelift/stealth-address-sdk | Transitive dependency of @scopelift/stealth-address-sdk. |
| `hashery` | 1.5.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `hookified` | 1.15.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `hookified` (nested in `qified`) | 2.2.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | nested copy at `node_modules/qified/node_modules/hookified` |
| `html-encoding-sniffer` | 7.0.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `ignore` (nested in `@typescript-eslint/eslint-plugin`) | 7.0.13 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | nested copy at `node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore` |
| `ignore` | 5.3.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `imurmurhash` | 0.1.4 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `is-extglob` | 2.1.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `is-glob` | 4.0.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `is-potential-custom-element-name` | 1.0.1 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `isexe` | 2.0.0 | ISC | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `js-tokens` (nested in `@babel/code-frame`) | 4.0.0 | MIT | -; transitive | nested copy at `node_modules/@babel/code-frame/node_modules/js-tokens` |
| `js-tokens` | 10.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `jsdom` | 30.1.3 | MIT | web; direct: web (dev) | Dev only. |
| `json-schema-traverse` | 0.4.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `json-stable-stringify-without-jsonify` | 1.0.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `keyv` | 5.6.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `levn` | 0.4.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `lightningcss` | 1.33.0 | MPL-2.0 | web; via vite | MPL-2.0 (file-level copyleft). Build tool only; nothing is copied into shipped output. MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-android-arm64` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 | web; via vite | optional MPL-2.0 copyleft: confirm it stays build-time only |
| `locate-path` | 6.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `lru-cache` | 11.5.3 | BlueOak-1.0.0 | web; via jsdom | Transitive dependency of jsdom. |
| `lz-string` | 1.5.0 | MIT | -; transitive | Transitive dependency. |
| `magic-string` | 1.4.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `magicast` | 0.5.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `mdn-data` | 2.27.1 | CC0-1.0 | web; via jsdom | Transitive dependency of jsdom. |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `ms` | 2.1.3 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `nanoid` | 3.3.20 | MIT | web; via vite | Transitive dependency of vite. |
| `natural-compare` | 1.4.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint, typescript-eslint | Transitive dependency of eslint, typescript-eslint. |
| `obug` | 3.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `optionator` | 0.9.4 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `p-limit` | 3.1.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `p-locate` | 5.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `parse5` | 8.0.1 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `path-exists` | 4.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `path-key` | 3.1.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `picocolors` | 1.1.1 | ISC | web; via vite | Transitive dependency of vite. |
| `picomatch` | 4.0.7 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via typescript-eslint, vite, vitest | Transitive dependency of typescript-eslint, vite, vitest. |
| `playwright` | 1.64.1 | Apache-2.0 | web; via @playwright/test | Transitive dependency of @playwright/test. |
| `playwright-core` | 1.64.1 | Apache-2.0 | web; via @playwright/test | Transitive dependency of @playwright/test. |
| `postcss` | 8.5.31 | MIT | web; via vite | Transitive dependency of vite. |
| `prelude-ls` | 1.2.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `prettier` | 3.9.10 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; direct: btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. No `format:check` script exists yet (audit 01 O-02). |
| `pretty-format` | 27.5.1 | MIT | -; transitive | Transitive dependency. |
| `punycode` | 2.3.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, web; via eslint, jsdom | Transitive dependency of eslint, jsdom. |
| `pure-rand` | 8.4.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer; via fast-check | Transitive dependency of fast-check. |
| `qified` | 0.10.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `react-is` | 17.0.2 | MIT | -; transitive | Transitive dependency. |
| `require-from-string` | 2.0.2 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `rolldown` | 1.2.14 | MIT | web; via vite | Transitive dependency of vite. |
| `saxes` | 6.0.0 | ISC | web; via jsdom | Transitive dependency of jsdom. |
| `semver` | 7.8.5 | ISC | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `shebang-command` | 2.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `shebang-regex` | 3.0.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `source-map-js` | 1.2.2 | BSD-3-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, jsdom, vite | Transitive dependency of @vitest/coverage-v8, jsdom, vite. |
| `std-env` | 4.3.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8, vitest | Transitive dependency of @vitest/coverage-v8, vitest. |
| `tinybench` | 6.2.2 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `tinyexec` | 1.3.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `tinyglobby` | 0.2.17 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via typescript-eslint, vite, vitest | Transitive dependency of typescript-eslint, vite, vitest. |
| `tinyrainbow` | 3.2.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via @vitest/coverage-v8 | Transitive dependency of @vitest/coverage-v8. |
| `tldts` | 7.4.19 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `tldts-core` | 7.4.19 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `tough-cookie` | 6.0.2 | BSD-3-Clause | web; via jsdom | Transitive dependency of jsdom. |
| `tr46` | 7.0.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `ts-api-utils` | 2.5.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via typescript-eslint | Transitive dependency of typescript-eslint. |
| `type-check` | 0.4.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `typescript` | 5.9.3 | Apache-2.0 | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; direct: relayer (dev), web (dev), btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Build tool. The lockfile does not mark it `dev` because viem / ox / abitype list it as an optional peer dependency; it is never shipped. |
| `typescript-eslint` | 8.72.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; direct: btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `undici` | 8.12.3 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `undici-types` | 8.9.0 | MIT | relayer; via @types/node | Transitive dependency of @types/node. |
| `undici-types` | 6.21.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via @types/node | Transitive dependency of @types/node. |
| `uri-js` | 4.4.1 | BSD-2-Clause | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `vite` | 8.3.5 | MIT | web; direct: web (dev) | Build tool; output is scanned by `scan-bundle.mjs`. |
| `vitest` | 5.0.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; direct: relayer (dev), web (dev), btc-silent-payments (dev), chain-adapters (dev), core-crypto (dev), invoice-schema (dev) | Dev only. |
| `w3c-xmlserializer` | 6.0.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `webidl-conversions` | 8.0.1 | BSD-2-Clause | web; via jsdom | Transitive dependency of jsdom. |
| `whatwg-mimetype` | 5.0.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `whatwg-url` | 17.3.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `which` | 2.0.2 | ISC | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `why-is-node-running` | 3.2.1 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema, relayer, web; via vitest | Transitive dependency of vitest. |
| `word-wrap` | 1.2.5 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |
| `xml-name-validator` | 5.0.0 | Apache-2.0 | web; via jsdom | Transitive dependency of jsdom. |
| `xmlchars` | 2.2.0 | MIT | web; via jsdom | Transitive dependency of jsdom. |
| `yocto-queue` | 0.1.0 | MIT | btc-silent-payments, chain-adapters, core-crypto, invoice-schema; via eslint | Transitive dependency of eslint. |

<!-- END GENERATED -->

## 3. Vendored code (checked into the repository)

| Component | Version | Licence | Location | Purpose | Review note |
|---|---|---|---|---|---|
| OpenZeppelin Contracts | 5.6.1 (`lib/openzeppelin-contracts/package.json`) | MIT (`LICENSE-MIT`; the vendored tree also ships `LICENSE-APACHE`) | `packages/contracts/lib/openzeppelin-contracts` | `ReentrancyGuard`, `SafeERC20`, `ECDSA`, `EIP712`, `Clones`, `MerkleProof` used by the four production contracts | Vendored copy, no git submodule. Not modified by GhostPay (not independently diffed against the upstream tag; a diff against the 5.6.1 release is an open verification item). |
| forge-std | 1.17.0 (`lib/forge-std/package.json`) | MIT OR Apache-2.0 | `packages/contracts/lib/forge-std` | Foundry test utilities | Tests and scripts only; not deployed. |
| `ERC5564Announcer` reference contract | pragma changed to `^0.8.23`, whitespace by `forge fmt` | CC0-1.0 (SPDX header in file) | `packages/contracts/test/utils/ERC5564Announcer.sol` | Test-only stand-in for the canonical ERC-5564 announcer; used to check the `Announcement` event ABI | Origin: ScopeLift `stealth-address-erc-contracts` (CC0-1.0), authors of ERC-5564. Test only, never deployed by GhostPay scripts. |
| ERC-6538 registry reference | no vendored contract | n/a | n/a | The canonical registry address is a constant in `docs/CONTRACTS_SPEC.md`; the client ABI fragment is being added under `packages/chain-adapters` (in progress by another agent when this was written) | Reference text: EIP-6538 (CC0). No registry source is vendored; if one is added for tests it must carry the same attribution as the announcer above. |
| BIP-352 / BIP-350 / BIP-32 test vectors and reference text | bitcoin/bips master at commit `130b8e0fa7f30fa45532f080b87b8db27a79e46e` (downloaded 2026-10-21) | BSD-2-Clause (the `License:` header of each saved BIP file: bip-0352, bip-0350, bip-0032) | `packages/btc-silent-payments/test-vectors/` | Official test vectors for the Bitcoin tier | Unmodified downloads; SHA-256 sums are recorded in that folder's README. The Python reference files are never executed. |
| Scheme-1 test vectors | generated 2026-10-21 | Project-generated (private keys in the file are public test keys) | `test-vectors/scheme1.json` | Pins ADR-0001 derivation | Generated with the ScopeLift SDK; provenance in `test-vectors/README.md`. |

## 4. Reference-only projects (not shipped, not vendored)

| Project | Licence | How it is used | Constraint |
|---|---|---|---|
| ScopeLift `@scopelift/stealth-address-sdk` 1.0.0-beta.5 | MIT (LICENSE file in the package, Copyright 2024 ScopeLift; the lockfile entry carries no `license` field) | Dev dependency of `core-crypto`; produces and cross-checks scheme-1 test vectors (ADR-0001) | Dev only. A beta release. Never imported by production code. |
| Bitshala `silent-pay` (JS/TS BIP-352) | not checked here | Named in `docs/MULTICHAIN_SPEC.md` as a differential-test reference only | **Not installed and not used** (`packages/btc-silent-payments/DEVIATIONS.md`). Its authors describe it as experimental. Do not add it as a dependency without a register entry. |
| `bitcoin/bips` | see above | Source of test vectors | Data only. |
| ERC-5564 / ERC-6538 / EIP-2612 / EIP-712 / EIP-1167 / ERC-4337 text | CC0 | Specifications implemented or referenced | No code taken, except the CC0 announcer above. |

## 5. Not covered by this register

- Tools installed outside npm: Foundry 1.8.5 (forge, anvil, cast), solc 0.8.28, Slither 0.11.6 and solc-select 1.2.0 (installed by CI with pip), Playwright browsers, Node 22. Their licences are not tabulated here; CI pins their versions in `.github/workflows/ci.yml`.
- GitHub Actions used by CI (pinned by commit SHA with a version comment). The SHAs were not independently verified by this register.
- Operating-system and container base images (the relayer Dockerfile uses a distroless base; the image has not been built in the authoring sandbox).
- Fonts, icons and images: none are loaded from third parties (SECURITY.md rule; enforced by `apps/web/scripts/scan-bundle.mjs`).

## 6. Spot-check of licences

`node docs/tools/third-party-table.mjs --verify` (run 2026-10-21 after `npm ci --ignore-scripts`) compares every installed `package.json` licence and version with the lockfile: all matched. Two limits: the lockfile itself is the source of the licence strings (they come from the registry metadata, not from reading each licence text), and uninstalled optional platform packages (for example `fsevents`, the per-platform `lightningcss`/`rolldown` binaries) cannot be checked on Linux. The one package whose lockfile entry has no licence, `@scopelift/stealth-address-sdk`, was checked by reading its shipped `LICENSE` file (MIT).
