# @ghostpay/confidential-amounts

Client side of the "Hide amount" option: a backend-neutral `ConfidentialBackend` interface, the CT-1 Zama fhEVM backend (ERC-7984), the CT-M cleartext test double, the announcement-metadata codec, a decrypt scheduler, a pinned testnet manifest and the UI copy. Spec: [`docs/remote/privacy-specs/confidential-tokens.md`](../../docs/remote/privacy-specs/confidential-tokens.md) (section 6.5). Contracts: [`@ghostpay/confidential-contracts`](../confidential-contracts). **Testnet only; not wired into any app; nothing here has run against Sepolia, a real RPC or the Zama relayer.**

| Piece | File | Status |
|---|---|---|
| `ConfidentialBackend`, `CtPayParams`, `StealthSigner` | `src/types.ts` | tested |
| Chain guard (`assertCtChain`): mainnets refused, Base Sepolia refused for CT-1, CT-M local only | `src/manifest.ts` | tested |
| Pinned manifest (Sepolia + local), code-hash verifier | `src/manifest.ts`, `manifest/confidential.testnet.json` | addresses checked against `@fhevm/solidity` 0.11.1 and `@zama-fhe/sdk` 3.7.0; **code hashes not pinned** |
| Calldata builders (`payConfidential`, `setOperator` with the 900 s window, `confidentialTransfer`, `unwrap`, `finalizeUnwrap`) | `src/calldata.ts` | tested; ABI cross-checked against the compiled contracts |
| Metadata codec (57 bytes, `0x5bebed7e`) | `src/metadata.ts` | tested incl. property tests |
| CT-M: `CleartextLedger` + `CleartextBackend` (in-memory twin of router and wrapper) | `src/backends/ledger.ts`, `cleartext.ts` | tested end to end |
| CT-1: `ZamaBackend` over a `ZamaSdkPort` | `src/backends/zama.ts` | tested with a fake port |
| CT-1 SDK glue `createZamaSdkPort` (lazy `import('@zama-fhe/sdk')`, memory storage, telemetry off) | `src/backends/zama-sdk.ts` | type-checked against the 3.7.0 declarations, loader smoke-tested; **never run against a relayer [UNVERIFIED]** |
| `DecryptScheduler` (random gaps, one owner per job, per-job transport hook) | `src/decrypt.ts` | tested |
| `classifyPayment`, `wrapWarnings`, copy keys and forbidden-wording check | `src/payment.ts`, `src/copy.ts` | tested |
| CT-2 Fhenix / CT-3 Inco | not built | `getBackend` throws `BACKEND_UNAVAILABLE` (spike-gated) |

## Use

```ts
import { getBackend, CleartextLedger, assertCtChain, parseConfidentialMetadata } from '@ghostpay/confidential-amounts';

const ledger = new CleartextLedger();               // CT-M, local development only: NO privacy
const backend = await getBackend('ctm-cleartext', { ledger });
```

Backends are never auto-selected (CT-PAY-1). The CT-1 backend needs a `ZamaSdkPort`; `createZamaSdkPort({ rpcUrls, runtime })` builds the default one. `@zama-fhe/sdk` is an optional dependency loaded only inside that function (CT-SUP-1; a test scans the sources for static imports).

Plaintext amounts never leave the process: `encryptAmount` hands them to the local SDK encryptor only. User decryption sends the stealth address, the handle and your network address to the hosted relayer, one stealth address per request.

```bash
npm run typecheck && npm run lint && npm test   # from this directory; vitest with coverage thresholds 95/90/95/95
```

Deviations and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Integration steps: [`docs/remote/privacy-specs/wiring/confidential-tokens.md`](../../docs/remote/privacy-specs/wiring/confidential-tokens.md).
