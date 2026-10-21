# Extending GhostPay

Sources: `docs/MULTICHAIN_SPEC.md`, ADR-0001/0008/0011/0012/0014, `packages/chain-adapters/src/{adapter,config/*}.ts`,
`packages/btc-silent-payments/src/{adapter,adapter-types}.ts`, `packages/policy-scheme/`, `docs/operators/chain-enablement-checklist.md`.
Rule zero: **fail closed and allowlist**. A new chain, token, feed or scheme is disabled until evidence for every item of
the relevant checklist is linked in the pull request. Do not enable mainnets: ADR-0011 requires an independent audit.

## 1. Add an EVM chain (no new adapter code)

`createEvmAdapter` works for any EVM chain present in `CHAINS` with `enabled: true`; a new EVM chain is data, not code.

1. **Evidence first** (`docs/operators/chain-enablement-checklist.md` A-F): chain id, native symbol, block time and finality
   model from the network's own docs; `getLogsMaxRange` measured against two providers; the canonical ERC-5564 announcer
   present with a recorded runtime codehash (or a deterministic deployment verified); EVM version `cancun` confirmed by a
   deployment and the test flow on that chain's testnet.
2. `packages/chain-adapters/src/config/chains.ts`: add a `ChainConfig` row (`chainId`, `name`, `nativeSymbol`, `nativeDecimals:
   18`, `testnet`, `finalityDepth`, `getLogsMaxRange`, `blockTimeMs`) with **`enabled: false`**. Flip it only in the PR that
   links the evidence. The values are engineering defaults, not provider-verified numbers (`TODO-VERIFY.md`); say so.
3. Tokens (`config/tokens.ts`): add a `TokenConfig` only for an address verified from the issuer's official documentation
   (checksummed, `decimals`, `permit` = ERC-2612 yes/no; DAI-style permit and USDT-without-permit are `false`). Test the real
   token against the router on a fork or testnet; fee-on-transfer, rebasing and ERC-777-style tokens are unsupported by design.
4. Feeds (`quote.ts` `FEEDS`): add a `FeedConfig` only after verifying the address, decimals and heartbeat against the
   oracle provider's page; set `heartbeatSeconds`, and `sequencerUptimeFeed` on L2s. `FEEDS` is empty today, which is why
   fiat-priced invoices are unpayable (ADR-0012).
5. Contracts: if it is a built-in testnet for the deploy scripts, add its id to the list in `script/DeployBase.s.sol`
   (`_chainAllowed`); mainnets use `ALLOWED_CHAIN_IDS` and need the audit. Deploy with `Deploy.s.sol` ([release-and-repro.md](release-and-repro.md#6-deploying-contracts)).
6. Manifest: write and validate `deployments/<chainId>.json`; run `verifyManifest` against two providers; the web app serves
   it from `apps/web/public/deployments/` today (runtime fetch; compile-in is designed, not built).
7. Relayer: add a `chains[]` entry (`rpcUrlEnv`, token list with `usdStable: true`, **measured** `gasUnits`, caps, budget);
   a non-testnet chain also needs `ALLOW_MAINNET=1` and a valid manifest in `DEPLOYMENTS_DIR`.
8. Tests: update `packages/chain-adapters/src/config.test.ts` and fixtures, run `npm test` and `npm run build -w @ghostpay/web`
   (bundle scan). Update the user docs (`docs/user/fees.md`, troubleshooting), the supported-chain matrix and the rollback
   note (disable by removing the manifest or `enabled: false` in the next release; old builds keep working with the old manifest).

## 2. Add a non-EVM chain adapter

Today the shared `ChainAdapter` in `packages/chain-adapters/src/adapter.ts` is EVM-shaped: `PaymentRequest` requires `router`
and `feeRecipient` addresses and a `build()` returning an EVM `BuiltPayment`, `DetectedPayment` carries an EVM announcement,
and `ValidatedInvoice` is the EVM `Invoice` with a numeric `chainId`. The Bitcoin package therefore **copies** the interface
(`adapter-types.ts`, member names identical, enforced by `adapter-types.test.ts`, which parses the real file) and
generalises it as `ChainAdapterShape<Invoice, Request, Detected>`. The follow-up recorded in
`packages/btc-silent-payments/DEVIATIONS.md` is to make the shared interface generic or a discriminated union on `family`.
Until then a new family should follow the Bitcoin pattern. Steps:

1. **ADR and spec first.** Write the chain's section in MULTICHAIN_SPEC (address format, scanning model, fee capability,
   finality) and an ADR if it changes a decision. Decide honestly which fees are enforceable: with no contract of ours on the
   payment path, `checkout`, `gasSponsorship` and `flatSecurity` are `not_enforceable` and `feeAmount` is `0n`.
2. **New package** `packages/<name>` (`@ghostpay/<name>`, `private`, `0.1.0`, `"type": "module"`, `main`/`types` at `dist/`),
   copying `package.json`, `tsconfig.json` (extends `tsconfig.base.json`), `tsconfig.build.json`, `vitest.config.ts` (thresholds
   95/90/95/95) from a sibling. Workspaces glob `packages/*`, so run `npm install --package-lock-only` to update the lockfile and
   pin every dependency to an exact version. Add a `THIRD_PARTY.md` entry for each runtime dependency
   (`node docs/tools/third-party-table.mjs --write`). Add the package to `build:libs` only if other workspaces import it.
3. **Types, errors, secrets**: one error class with a stable code union and fixed messages; use a redacting `SecretScalar` (copy
   the pattern, do not share brands across packages without converting at the boundary); `zeroize` after use; CSPRNG with
   rejection sampling and an injectable `rng`.
4. **Inject all I/O.** The Bitcoin package reads blocks through a `TweakSource` interface and the scan secret never reaches it
   (tests assert the source and `fetch` only see heights). Do the same: the adapter takes a `source`/`client` in its deps, never
   a global `fetch`, and keys stay in-process.
5. **Fail closed on identity**: an invoice or address for another network/chain is rejected (`CHAIN_MISMATCH`), never silently
   converted; validate every external value; treat chain data as hostile (skip and count, do not throw, in scanners).
6. **Vectors and differential tests** from an independent source (official vectors for the standard, a second implementation for
   the maths); expected values must not come from the code under test. Add property tests for amount and encoding functions.
7. **Wire-up** (not done for any non-EVM family yet): the web app and relayer import only `chain-adapters`; integrating a new family
   needs the interface unification above, UI work, and an ADR-0011-style enablement checklist.
8. **Docs**: package `README.md` (modules, usage, security notes), `DEVIATIONS.md` (every difference from the spec/standard, every
   unverified item), root README package map.

A minimal skeleton that type-checks under the repository's strict `tsconfig.base.json` (compiled in a scratch directory with
`tsc --noEmit`; it implements nothing chain-specific, `parseRecipient` just reports `UNSUPPORTED`):

```ts
// packages/<name>/src/adapter.ts
export type ChainFamily = 'evm' | 'bitcoin' | 'solana';
export type FeeStatus = 'enforced' | 'not_enforceable' | 'not_deployed';
export interface FeeCapability { readonly checkout: FeeStatus; readonly checkoutBps?: number; readonly gasSponsorship: FeeStatus; readonly flatSecurity: FeeStatus }
export interface ScanRange { readonly fromBlock: bigint; readonly toBlock?: bigint }
export interface RequestOptions { readonly quotedTokenAmount?: bigint }

declare const secretBrand: unique symbol;
declare const pointBrand: unique symbol;
export type SecretScalar = Uint8Array & { readonly [secretBrand]: 'SecretScalar' };
export type CompressedPoint = Uint8Array & { readonly [pointBrand]: 'CompressedPoint' };
export interface RecipientAddress { readonly family: ChainFamily; readonly canonical: string; readonly spendingPublicKey: CompressedPoint; readonly viewingPublicKey: CompressedPoint }
export interface ViewCapability { readonly viewingSecret: SecretScalar; readonly spendingPublicKey: CompressedPoint }

export interface ChainAdapterShape<Invoice, Request, Detected> {
  readonly family: ChainFamily;
  readonly chainId: string;
  parseRecipient(input: string): RecipientAddress;
  buildPaymentRequest(inv: Invoice, opts?: RequestOptions): Request;
  scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncIterable<Detected>;
  readonly fees: FeeCapability;
}

export type XyzErrorCode = 'INVALID_INPUT' | 'CHAIN_MISMATCH' | 'UNSUPPORTED';
export class XyzError extends Error {
  public constructor(public readonly code: XyzErrorCode) { super(code); this.name = 'XyzError'; }   // fixed message
}
function fail(code: XyzErrorCode): never { throw new XyzError(code); }

export interface XyzInvoice { readonly chainId: string; readonly address: string; readonly amount: bigint }
export interface XyzRequest { readonly family: ChainFamily; readonly chainId: string; readonly asset: string;
  readonly grossAmount: bigint; readonly netAmount: bigint; readonly feeAmount: bigint; readonly uri: string }
export interface XyzDetected { readonly family: ChainFamily; readonly height: bigint; readonly amount?: bigint; readonly verified: boolean }
export interface XyzSource { tip(signal?: AbortSignal): Promise<number>; blockOutputs(height: number, signal?: AbortSignal): Promise<readonly { amount: bigint }[]> }
export interface XyzAdapterDeps { readonly network: 'mainnet' | 'testnet'; readonly source?: XyzSource }
export type XyzAdapter = ChainAdapterShape<XyzInvoice, XyzRequest, XyzDetected>;

export function createXyzAdapter(deps: XyzAdapterDeps): XyzAdapter {
  const chainId = deps.network === 'mainnet' ? 'xyz-mainnet' : 'xyz-testnet';
  return {
    family: 'solana',
    chainId,
    fees: { checkout: 'not_enforceable', gasSponsorship: 'not_enforceable', flatSecurity: 'not_enforceable' },
    parseRecipient(_input: string): RecipientAddress { return fail('UNSUPPORTED'); },
    buildPaymentRequest(inv: XyzInvoice, opts: RequestOptions = {}): XyzRequest {
      if (inv.chainId !== chainId) return fail('CHAIN_MISMATCH');
      const amount = inv.amount > 0n ? inv.amount : opts.quotedTokenAmount;
      if (amount === undefined || amount <= 0n) return fail('INVALID_INPUT');
      return { family: 'solana', chainId, asset: 'native', grossAmount: amount, netAmount: amount, feeAmount: 0n,
               uri: `xyz:${inv.address}?amount=${amount.toString()}` };
    },
    async *scan(range: ScanRange, keys: ViewCapability, signal: AbortSignal): AsyncGenerator<XyzDetected> {
      const source = deps.source ?? fail('UNSUPPORTED');
      void keys;   // match with the keys HERE; the source only ever sees heights
      const last = range.toBlock !== undefined ? Number(range.toBlock) : await source.tip(signal);
      for (let h = Number(range.fromBlock); h <= last; h++) {
        if (signal.aborted) return;
        for (const o of await source.blockOutputs(h, signal)) yield { family: 'solana', height: BigInt(h), amount: o.amount, verified: false };
      }
    },
  };
}
```

## 3. Add a stealth scheme (a new ERC-5564 scheme id)

Model: how scheme `0x47500002` was added across `packages/contracts` and `packages/policy-scheme`. Scheme ids in use: `1`
(secp256k1 with view tags, ADR-0001) and `0x47500002` ("GP" + 2, experimental). **Any change of the scheme-1 hash or
derivation needs a new scheme id**, never an in-place edit.

1. **ADR** (what the scheme is, derivation, announcement shape, metadata, fee, recovery story, what stays public) and the
   public-contract section in `docs/CONTRACTS_SPEC.md` **before** code. State the known leaks (the first deployed account links
   a seller; the scheme id shrinks the anonymity set).
2. **Contracts**: the standard announcer accepts any `schemeId`; GhostPay routers announce a constant. Add a router variant with
   its own `SCHEME_ID` (as `GhostPayPolicyRouter`) rather than a `schemeId` argument, keep the 57-byte metadata layout and
   the checks of `GhostPayRouter`, bind the paid address to an immutable factory/implementation, and keep error names
   identical where semantics match (a test pins identical selectors). Add unit, fuzz, invariant, mock-token and Echidna
   coverage, a deploy script with read-backs, and a `DEVIATIONS.md` section.
3. **TypeScript package** (copy the layout of `packages/policy-scheme/src`): `types.ts` (constants, strict parsers), a policy/
   address module, `meta.ts` (a **distinct meta-address prefix**, e.g. `st:eth:gp2:0x`, so a scheme-1 wallet can never parse it as a
   plain meta-address), `derive.ts` (sender derivation reusing `@ghostpay/core-crypto` for the scheme-1 maths; scanner returning
   `{ matches: false }` for any malformed chain data and checking the scheme id first), `eip712.ts`, `calldata.ts`, `router.ts`
   (builder **and** a decoder that re-checks the binding), generated `abi/*.ts`, `errors.ts`, `index.ts`. Add to the root README
   package map; add a `build` entry where other packages need it.
4. **Vectors from an independent generator** (`test-vectors/generate-<scheme>.mjs`: SDK + viem + a re-implemented algorithm; it
   must never import the package under test), property tests, and an **anvil cross-check** against the compiled contracts that
   honours `REQUIRE_ANVIL=1` ([testing.md](testing.md)).
5. **Scanner/log layer**: `fetchAnnouncements` already takes `schemeId` (default `1n`) and `validateAnnouncementLog` checks the
   scheme topic; pass the new id. The invoice schema has the literal `schemeId: 1` (ADR-0010); supporting another scheme in
   invoices is a schema/version decision with its own ADR, not a quiet edit.
6. **Manifest**: extend `deployments/schema.json` and `validateManifest` additively (optional fields with
   `dependentRequired`); a test keeps the validator's key set in sync with the schema. Pin factory, implementation and router
   per chain; account addresses depend on all of them.
7. **Gating**: keep it out of the app and relayer until the ADR's conditions (recovery design, audit, UI) are met, and say
   "experimental" in every doc.

## 4. Change a contract's public ABI

Checklist (the policy-router `PolicyRef` -> `salt` change, DEVIATIONS R10, is the worked example): update
`docs/CONTRACTS_SPEC.md`; change the Solidity and the NatSpec; update/extend unit, fuzz, invariant and Echidna tests and
`.gas-snapshot`; add a `DEVIATIONS.md` item; regenerate TypeScript ABIs (`npm run gen-abi -w @ghostpay/chain-adapters` and/or
`-w @ghostpay/policy-scheme`); update the TypeScript builders/decoders, vectors and the anvil tests; update
[contracts-reference.md](contracts-reference.md) and [byte-layouts.md](byte-layouts.md) (selectors, sizes); note it in the
manifest/migration story (a new ABI is a new deployment and a new manifest, because contracts are immutable).

## 5. Add a relayer policy or price source

Implement `PolicyGate` (`apps/relayer/src/policy.ts`) for sanctions/abuse screening and pass it as `RuntimeDeps.policy`
(`allow: false` -> `policy_denied` 403, a thrown check -> `policy_unavailable` 503); the gate sees only
`chainId, token, owner, destination, amount` and runs in-process. Implement `GasPriceSource` / `TokenPriceSource`
(`pricing.ts`) to replace operator constants with an oracle; the token must stay a USD stable until a verified oracle exists
(ADR-0012). Every new rejection needs a stable error class thrown as `new RelayerError(status, 'class')` (`errors.ts`), a test in
`api.test.ts`, and an entry in `apps/relayer/README.md`. Never add fields to logs beyond the allowed set.

## 6. Add a web feature

New view under `apps/web/src/views`, logic in `src/lib` behind the injectable `Services` object, tests with the mocks in
`src/test`, a Playwright case only if a real browser is needed. Rules: no new origins (extend `ALLOWED_URLS` in
`scan-bundle.mjs` only with a stated reason), no storage of key material, user-facing strings must not overstate guarantees,
update `apps/web/DEVIATIONS.md`, and add a short feature review under `docs/reviews/` (Phase B).
