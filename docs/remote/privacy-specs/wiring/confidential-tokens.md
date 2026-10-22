# Wiring: confidential amounts (CT-1) into the existing code

For swarm 4 (edits to existing packages and apps). Source of truth for behaviour: [`../confidential-tokens.md`](../confidential-tokens.md). Packages built: `packages/confidential-contracts` (Hardhat, mock-tested only) and `packages/confidential-amounts` (vitest, 99 % statements). Nothing below has been run in the app. Testnet only: Ethereum Sepolia (11155111) for CT-1, local 31337 for CT-M. Default stays **Public**; never auto-select (CT-PAY-1).

Prerequisites outside this lane: a Sepolia deployment of `GhostPayConfidentialRouter` and `GhostPayTestConfidentialToken` (constructor `(announcer, feeRecipient, [token])`, see contracts README) and a reviewed manifest entry. None exists; until it does the UI option must stay disabled ("no deployment manifest").

## 1. `packages/core-crypto/src/metadata.ts`

Today `parseMetadata` accepts only `0xa9059cbb` (ERC-20) and `0xeeeeeeee` (native) and returns a numeric `netAmount`. Add a third case, without touching the plaintext path:

```ts
// ParsedMetadata becomes a union
export type ParsedMetadata =
  | ({ kind: 'erc20' | 'native' } & /* existing fields */)
  | { kind: 'confidential'; viewTag: number; token: Address; amountHandle: Hex };

// in parseMetadata, after the length check (57 bytes) and before the plaintext selectors:
if (bytes[1] === 0x5b && bytes[2] === 0xeb && bytes[3] === 0xed && bytes[4] === 0x7e) {
  // reject the zero handle; token is bytes[5:25], handle is bytes[25:57]
  return { kind: 'confidential', viewTag: bytes[0] as number, token: getAddress(...), amountHandle: bytesToHex(bytes.slice(25, 57)) };
}
```

`@ghostpay/confidential-amounts` has the same codec (`parseConfidentialMetadata`) for callers that do not want to widen `ParsedMetadata`; core-crypto must not import it (dependency direction). Update `core-crypto` tests with the 57-byte vectors from `packages/confidential-amounts/src/metadata.test.ts`.

## 2. `apps/web/src/lib/scanClient.ts` (scanner)

- A `confidential` match must never produce an amount or a "paid" state. Route it to a new state `pending-decrypt` carrying `{ stealth, token, amountHandle, txHash, blockNumber }` (R-5: a silent zero transfer or spam announcement looks identical before decryption).
- Decryption: one `DecryptScheduler` per session; per match `scheduler.enqueue({ owner: stealth, run: () => backend.userDecrypt({ chainId, contract: token, handle, signer }) })`, then `classifyPayment(invoiceNet, value)` -> `confirmed | underpaid | failed_insufficient_balance` (CT-PAY-6). Show "unconfirmed" until then, on both seller and payer screens.
- `contract` for `userDecrypt` is the **token** address (the handle is the token's `ConfidentialTransfer` handle).
- `StealthSigner` adapter over `@ghostpay/secret-box` (CT-DEC-4), in the web app:

```ts
const signer: StealthSigner = {
  address: stealthAddress,
  withKey: (fn) => withScopeAsync(async (scope) => {
    const key = scope.box(deriveStealthPrivateKey(/* from the seller's scanned secret */), 'stealth-key');
    return key.useAsync((bytes) => fn(bytesToHex(bytes)));   // bytes are wiped when the scope closes
  }),
};
```
  (`bytesToHex` makes a hex string that JS cannot wipe: this is a known limit of passing a key to viem; keep it inside the one SDK session and drop references.)
- Do **not** batch handles of different stealth owners in one request and never use delegated decryption to a long-term key (CT-DEC-1, CT-DEC-3).
- The scheduler's default gap is 30-300 s, so "Reveal amount" is slow by design; show progress. Route relayer traffic through the Tor/transport layer of `network-privacy.md` per job (the Zama SDK has no per-request transport hook, see package DEVIATIONS 5).

## 3. `apps/web/src/views/Pay.tsx` and the invoice-creation view

Add the "Amount visibility" selector in the Options fieldset next to the delay checkbox (spec section 4). Enabled only when `chainId === 11155111`, a confidential router and token are in the deployment manifest, and the invoice advertises `amountVisibility: 'ct1'`. Flow (all transactions go through `packages/tx-review` before signing):

1. Before first use: show every key of `NOT_PROTECTED_KEYS` through `CT_COPY` plus `CT_TRUST_ZAMA` and `CT_TESTNET_ONLY`, acknowledgement required (CT-UX-1).
2. If the confidential balance is too low: `wrapWarnings(wrapAmount, gross)` -> show `CT_WRAP_PUBLIC` (+ `CT_WRAP_EQUALS_GROSS` / `CT_WRAP_NOT_ROUND`), exact plaintext amount shown (CT-UX-2). The wrap is a normal `underlying.approve` + `token.wrap(to, amount)` tx (ABI: `TOKEN_ABI` has `wrap`).
3. `backend.buildSetOperator({ chainId, token, operator: router, until: now + 900, nowSec: now })`; show the expiry in the review (CT-PAY-2).
4. `backend.buildPayCalldata({ chainId, router, token, stealth, gross, deadline, bufferWei, ephemeralPubKey, viewTag, payer })` -> `{ to, data, value }`; send as the payer. Value is the ETH gas buffer (`maxBufferWei` is set equal to it).
5. Receipt text: "Sent (amount hidden). Seller confirms receipt by decrypting." Never display the gross as confirmed received.
6. Wrap/unwrap are public amounts; the seller's "Unwrap to ERC-20" shows `CT_UNWRAP_PUBLIC` and the exact amount (`buildUnwrap`, then `finalizeUnwrap` which fetches the public decryption proof).

Use only the allowed claim wording (CT-UX-3); `findForbiddenWording` is a lint helper for the copy test (T10).

## 4. Sweep of a confidential balance

`GhostPaySweepRelayer` cannot move ERC-7984 (no permit). Seller flow: the stealth EOA itself sends `confidentialTransfer(destination, balanceHandle)` (`buildConfidentialTransfer`, balance handle from `token.confidentialBalanceOf(stealth)`), paying gas from the payer's ETH buffer; destination should be a fresh address (hygiene spec). Open question Q3 (gasless meta-transaction) stays open.

## 5. `packages/chain-adapters` deployments

`DeploymentManifest` (`deployments.ts`) and the manifest schema need optional fields: `confidentialRouter?: Address`, `confidentialTokens?: Address[]`, plus their `deployTx`/`bytecodeHashes` entries; `validateManifest` must keep `router`, `announcer`, `feeRecipient` distinct from them. The CT-1 protocol addresses stay in `packages/confidential-amounts/manifest/confidential.testnet.json` and are verified with `verifyManifestOnChain(chainId, getCode, { requirePinned: true })` before first use (CT-PAY-4). **Pin the code hashes first** (they are `null` today) after the first reviewed Sepolia deployment.

## 6. `packages/invoice-schema`

Optional field `amountVisibility: 'public' | 'ct1' | 'ct2' | 'ct3'` (default `public`). Spec Q4: capability is advertised in the invoice, scheme 1 of the meta-address is unchanged. The strict parser must reject unknown values.

## 7. `packages/tx-review`

Add decoders for `payConfidential` (show token, stealth, deadline, buffer; amount shown as "encrypted"), `setOperator(router, until)` (highlight expiry), `confidentialTransfer(address,bytes32)`, `unwrap`, `finalizeUnwrap`. Use `ROUTER_ABI` / `TOKEN_ABI` from `@ghostpay/confidential-amounts` (or copy them; the ABI is cross-checked against the compiled contracts).

## 8. Bundle and CSP (`apps/web`)

- `@zama-fhe/sdk` and `@ghostpay/confidential-amounts` must be loaded with dynamic `import()` only (CT-SUP-1). Add test T8: `scripts/scan-bundle.mjs` must find no `@zama-fhe` string in the core entry chunk. The package's own test already checks its sources have no static import.
- CSP `connect-src` must add the relayer origin `https://relayer.testnet.zama.org` and the chosen RPC. Whether the TFHE/ZK WASM needs `wasm-unsafe-eval` (and a worker, the SDK ships `encrypt.worker.js`) is [UNVERIFIED]; check against `apps/web/public/_headers`. Bundle size of the SDK (public key ~50 MB fetched at init per the SDK docs) must stay lazy.
- Privacy notice: the SDK's `x-zama-sdk-*` usage headers are disabled by the glue (`telemetry: false`); the relayer still sees stealth address, handle, IP and time (spec 2.5). State it in `docs/user/privacy-limits.md`.

## 9. Docs

- `docs/user/privacy-limits.md`: add the nine NOT-protected items (`CT_COPY` keys `CT_NP_*`).
- `docs/remote/anonymization-research.md` 5.6: mark superseded for Sepolia (spec section 3).
- `THIRD_PARTY.md`: rows are in `docs/remote/third-party-additions.md` (Zama BSD-3-Clause-Clear needs a Zama patent licence for commercial use; legal deferred by the owner).

## 10. CI

- `packages/confidential-amounts`: standard TS job (`typecheck`, `lint`, `test`); it imports the optional `@zama-fhe/sdk` in tests (installed with the workspace).
- `packages/confidential-contracts`: `npm test` downloads solc 0.8.28 and runs ~6 min at 1000 fuzz runs; use `npm run test:quick` for PRs. The `build` script is deliberately named `compile` so a root `npm run build` does not need a compiler. `npm run lint:sol` needs forge. Slither: see the audit doc for the direct-solc command (Hardhat build breaks source maps).
- A root `npm test` runs both packages (`--if-present`); the contracts one needs network access for solc in CI.

## 11. Deploy runbook additions

`scripts/deploy.ts` prints the addresses and refuses other chains. Checklist before pointing the app at a deployment: announcer address (the same ERC-5564 announcer as the plaintext router), a throw-away fee recipient (testnet), token list, then pin runtime code hashes of the router, token and all Zama protocol addresses into the manifest, and re-run the Sepolia smoke (T9), including `finalizeUnwrap` and user-decrypt latency (spike S-2). Compile for deployment **without** relying on the mock plugin's rewritten `ZamaConfig` (contracts `DEVIATIONS.md` item 4).
