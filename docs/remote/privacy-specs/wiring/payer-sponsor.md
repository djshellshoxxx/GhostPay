# Wiring: payer-sponsor (payer modes PH-1 to PH-4)

Status: **instructions for swarm 4 (edits to existing code). Nothing here is applied.** Date 2026-10-21. Testnet only. Spec: [`../payer-hiding.md`](../payer-hiding.md). Review: [`../audit-payer-sponsor.md`](../audit-payer-sponsor.md). Packages: `packages/payer-sponsor` (TS), `packages/payer-hiding-contracts` (Foundry).

What these modes do and do not do (UI copy comes from `modeNotices(mode)`; do not paraphrase it): the payer address stays public; only the native-gas funding link is removed (PH-2/3/4); the payment tokens still have to reach the payer wallet from somewhere; the sponsor sees payer, stealth address, token, amount, network address and timing. No wording like "anonymous", "untraceable" or "mix" anywhere; no GhostPay fee on any of these steps.

## 0. Design constraint that shapes the UI

PH-2, PH-3 and PH-4 need a **key the app controls** (a derived one-time payer key from `derivePayerKey`): an EIP-7702 authorization and an ERC-4337 account owner signature cannot be produced through the standard injected-wallet `eth_signTypedData` / `personal_sign` surface, and a fresh payer must not be the user's main wallet. Flow for modes 2-4:

1. derive a one-time payer key (`withPayerKey(seed, invoiceId, index, fn)`; keep the key inside `fn`);
2. fund that payer with the **payment tokens only** from the user's wallet (an ordinary token transfer, visible on chain: this is the token-funding link, N2; the UI must say so before sending it); no native token is needed;
3. build and sign the order with the payer key (`buildRelayIntent` / `buildDelegatePayIntent` / `buildUserOperation`), send it to the sponsor, show the transaction hash.

PH-1 (`fresh-wallet`) does need native gas on the payer: use `planFunding` / `lintFunding` and say that the funding transfer is public.

## 1. Edits to existing code

| File | Edit |
|---|---|
| `apps/web/package.json` | add dependency `"@ghostpay/payer-sponsor": "0.1.0"`. Add `packages/payer-sponsor` to the `build:libs` script of the root `package.json` (`npm run build -w @ghostpay/payer-sponsor`) before `apps/web` typecheck, because workspaces resolve each other through `dist/`. |
| `apps/web/src/lib/settings.ts` | `Settings`: add `payerMode: PayerMode` (default `'direct'`, validate with `parsePayerMode` in `sanitizeSettings`, unknown value falls back to `'direct'`) and `sponsorUrl: string` (same validation as `checkRelayerUrl`: https only, no credentials, no query or fragment; default `''`). Mode other than `'direct'` and `'fresh-wallet'` is unavailable while `sponsorUrl` is empty. Add both keys to `DEFAULT_SETTINGS` and to the settings tests. |
| `apps/web/src/views/Settings.tsx` (settings view) | selector rendered from `PAYER_MODE_INFO` (label, effort, fingerprint) and, for the chosen mode, the lines of `modeNotices(mode)` **before** the user can enable it; a mode that `modeAvailability(mode, caps)` reports unavailable is shown disabled with the reason (`NO_7702`, `NO_RELAY`, `NO_ENTRYPOINT`, `NO_DELEGATE`). Selecting any non-direct mode needs an explicit confirmation (PH-GEN-5). |
| `apps/web/src/views/Pay.tsx` and `apps/web/src/lib/payExec.ts` | in `preparePayment` / `sendPayment` branch on `settings.payerMode`: `direct` unchanged; `fresh-wallet` creates the payer key, shows `planFunding` output and `lintFunding` warnings, then pays from the fresh wallet through the existing direct path with that wallet's own client; `permit-relay`, `eip7702-sponsored`, `erc4337-paymaster` use section 2. Show `modeNotices(mode)` in the review step above the sign button; the existing `decodePaymentCalldata` review must also render the router calldata the order commits to (`decodeAndCheckPayload` before signing). |
| `apps/web/src/lib/sponsorClient.ts` (new file in `apps/web`, owned by swarm 4) | thin `fetch` client for `POST {sponsorUrl}/v1/quote`, `/v1/submit`, `/v1/sponsor-userop` (JSON; bigints as decimal strings; the field names of `parseQuoteRequest`, `parseRelaySubmit`, `parseEip7702Submit`, `parseUserOpRequest` in `packages/payer-sponsor/src/sponsor/wire.ts`). No cookies, no credentials, `cache: 'no-store'`, route through the user's configured proxy/transport profile like the relayer client. |
| `apps/web` CSP (`index.html` / `_headers` per `docs/operators/mirror-hosting.md`) | add the sponsor origin to `connect-src` only when `sponsorUrl` is set. Never a wildcard. |
| `packages/chain-adapters/src/config/chains.ts` | add per-chain `supports7702: boolean` (probe result or allowlist; Ethereum Sepolia `true` per the go-ethereum chain spec, Base Sepolia **unverified**, local `true`), and optional `entryPoint` (v0.7 address `0x0000000071727De22E5E9d8BAf0edAc6f37da032` is verified; see `packages/payer-hiding-contracts/DEVIATIONS.md`). |
| `packages/chain-adapters/src/deployments.ts`, `docs/DEPLOYMENT_MANIFEST.md`, `deployments/` schema | optional entries `payerHiding: { relay, delegate, accountFactory, paymaster, entryPoint, entryPointCodeHash, supports7702 }` per chain with code hashes read back from the chain; `parseManifest` of `@ghostpay/payer-sponsor` is the strict validator of exactly this shape (use it or mirror it; unknown keys are rejected). The EntryPoint must be verified against `entryPointCodeHash` with `verifyEntryPoint` before any PH-4 use (PH-4-REQ-2). |
| `docs/adr/ADR-LOG.md` | new ADR: payer-side sponsorship with ERC-4337 (PH-4) partly supersedes ADR-0009 "Sponsorship without ERC-4337 for MVP"; record the sponsor-trust and fingerprint trade-offs (N3, N4) and the persistent EIP-7702 delegation (spec Q6). |
| `docs/user/privacy-limits.md` | add N1 and N2 and the observer table of spec section 8. State that the payer address is always public. |
| `THIRD_PARTY.md` | rows from `docs/remote/third-party-additions.md` (EntryPoint test-only source, GPL-3.0 headers: OWNER DECISION). |
| `.github/workflows/ci.yml` (owner of CI) | new job `payer-hiding-contracts`: `cd packages/payer-hiding-contracts && ./scripts/fetch-entrypoint.sh && sed -i ... && forge build && forge fmt --check && forge test && bash scripts/check-natspec.sh`; Slither command in the audit doc; add `packages/payer-sponsor` to the `rest` matrix of `ts-test` and run its anvil e2e with `REQUIRE_ANVIL=1` after the forge build. |

## 2. Per-mode flow in the app

Common: `assertTestnet(chainId)` is called inside every library function; the app still refuses disabled chains first (`requireEnabledChain`). `routerTarget` is `{ kind: 'ghostpay', address }` (or `{ kind: 'policy', address, policy }`) with the router address **from the verified deployment manifest**, never from the invoice or the sponsor. Compute `net = gross - routerFee(gross)` and `metadata = buildErc20Metadata(viewTag, token, net)` from the existing stealth derivation (`@ghostpay/core-crypto`), then `pay = { token, stealth, gross, minNet: net, deadline, ephemeralPubKey, metadata }`.

1. `quote = POST /v1/quote { mode, chainId, token, gross }`. Show `sponsorFee` (tokens, rounded up by the sponsor) and the sponsor-trust notice.
2. **PH-2 `permit-relay`**: `buildRelayIntent({ chainId, relay, payer, router, pay, sponsorFee, sponsorFeeTo, deadline, nonce: randomNonce() })`; payer key signs `typedData` (`signTypedData`); sign an ERC-2612 permit with `buildPermitTypedData` (token name/version from the token, value `gross + sponsorFee`, spender = relay) and `toRelayPermit`, or `NO_PERMIT` if the payer approved the relay beforehand; `POST /v1/submit { mode: 'permit-relay', quoteId, chainId, router, intent, routerCalldata, sig, permit }`.
3. **PH-3 `eip7702-sponsored`**: read the payer's account nonce (`eth_getTransactionCount`), `buildDelegatePayIntent({ ..., delegate, manifest, payerAccountNonce })`; payer key signs `typedData` and the authorization (`signAuthorization(authorization)`); `POST /v1/submit { mode: 'eip7702-sponsored', quoteId, chainId, payer, router, intent, routerCalldata, sig, authorization }`. After the payment offer "clean up": `buildClearingAuthorization` signed by the payer, to be included by the sponsor in a later sponsored transaction (the delegation `0xef0100 || delegate` stays on the payer address otherwise; fingerprint N4). A fresh payer is one-shot: default is to abandon it.
4. **PH-4 `erc4337-paymaster`**: `sender = factory.getAddress(owner, saltNonce)` (`encodeFactoryGetAddress` + `eth_call`), `initCode = buildInitCode(factory, owner, saltNonce)`, nonce 0, `calls = buildPayerCalls({ token, router, routerCalldata, gross, sponsorFee, sponsorFeeTo })`, `buildUserOperation(...)`; step 1 `POST /v1/sponsor-userop { quoteId, chainId, router, routerCalldata, owner, saltNonce, sponsorFee, userOp }` returns `paymasterAndData`; put it into the operation, owner key signs `getUserOpHashV07(op, entryPoint, chainId)`; step 2 `POST /v1/submit { mode: 'erc4337-paymaster', ...same fields with the signed userOp }`. The EntryPoint must have been verified (`verifyEntryPoint`).
5. Show the returned `txHash`; the local receipt export (`buildReceipt`) must state that the sponsor saw the order.

## 3. What the UI must show before signing (spec section 5)

`modeNotices(mode)` gives: who pays gas, who sees payer and network address, the token-funding line (non-direct), the sponsor-trust line (sponsored modes) and `The payer address is still public.`. Add: the sponsor fee in tokens, the router address with its manifest label, the stealth address, and the decoded router call (reuse the `tx-review` package decoder when wired). `PAYER_MODE_INFO[mode].hidesFromObservers` must never be rendered as "hides the payer".

## 4. Sponsor deployment (operator, separate from the relayer)

Construct `SponsorService` (see `packages/payer-sponsor/src/e2e.anvil.test.ts` for a complete wiring with viem clients, `SecretBox` paymaster signer and relayer-guard components) behind `createHttpHandler`/`startHttpServer`. Rules from the spec: separate deployment and separate hot key from `apps/relayer` (the same operator would otherwise see both ends), testnet hot key only (`assertKeyNotFundedOnMainnet`), trusted proxies configured explicitly, logs only the allowlisted fields, no analytics. There is no process entry point in this package; deployment of the contracts: `packages/payer-hiding-contracts/script/DeployPayerHiding.s.sol` (dry-run on anvil verified; not broadcast anywhere else).

## 5. Open before wiring

- Verify EIP-7702 and an ERC-4337 bundler on a real testnet (everything here ran on local anvil only).
- Decide who runs the sponsor and the price source (spec Q4); legal questions are deferred by the owner (spec Q7), not analysed here.
- Router typed-data phishing (audit finding C-02): the wallet UI must show the router address against the manifest.
