# Privacy spec: Confidential (encrypted) amounts on EVM (`@ghostpay/confidential-amounts`)

Status: spec only, 2026-10-21. Branch `claude/remote-extensions-1`. Testnet PoC only. Effort: **L** overall (CT-1 contracts M, CT-1 client M, CT-2/CT-3 adapters M each after spike). Revises `docs/remote/anonymization-research.md` 5.6 ("no native confidential amounts on EVM ... Recommendation: no"): that statement is outdated for Ethereum Sepolia/mainnet as of 2026-10 (section 3, [P]).

Legal: deferred by the owner. Noted once, not a blocker: Zama's code is BSD-3-Clause-Clear and its README says commercial use needs a separate Zama patent licence; Inco Lightning is BUSL-1.1 (section 3). Neither affects a testnet PoC build.

Evidence tags: [R] read in this repo; [P] primary source read this session (GitHub raw source, npm registry tarball, ERC text), retrieved 2026-10-21; [S] secondary (search snippet, blog); [U] unverified or derived. Docs sites (`docs.zama.org`, `docs.openzeppelin.com`, `eips.ethereum.org`) failed DNS in this sandbox; the same facts were taken from the GitHub/npm sources instead. No standard is invented; GhostPay-specific encodings are labelled "GhostPay convention".

## 1. Goal

Offer the user an opt-in **"Hide amount"** option: the invoice amount, the fee and the seller's received balance are encrypted on-chain, while the existing stealth-address flow keeps hiding *who* the seller is. One backend is built end-to-end (CT-1, Zama fhEVM + ERC-7984 on Ethereum Sepolia); other valid backends sit behind the same interface and are selectable once their spike passes.

| ID | Backend | Chain(s) (testnet) | Trust model | PoC scope |
|---|---|---|---|---|
| CT-0 | Off (plain ERC-20, current router) | Sepolia, Base Sepolia | none | unchanged |
| CT-1 | Zama fhEVM coprocessor + OpenZeppelin ERC-7984 | Ethereum Sepolia (11155111) | threshold KMS + coprocessors (Zama protocol) | **build** |
| CT-M | Cleartext mock of CT-1 | local hardhat (31337) | none (no privacy) | **build** (CI + dev only, never shown in production UI) |
| CT-2 | Fhenix CoFHE coprocessor | Sepolia, Arbitrum Sepolia, Base Sepolia | Fhenix FHE coprocessor network | spike, then adapter |
| CT-3 | Inco Lightning | Base Sepolia (84532) | TEE attestation (Inco) | spike, then adapter |
| CT-4 | Aztec (private L2) | Aztec network | own L2, ZK client proofs | watch only |
| CT-5 | Shielded-pool amounts (Privacy Pools, Railgun) | per `external-pools.md` | ZK pool | covered by `external-pools.md`, cross-link only |
| CT-6 | Confidential EVM chain (TEE), e.g. Oasis Sapphire | own chain | TEE | watch only |

Non-goals: own ZK range-proof token or own pool (research 5.4/5.6 still holds: no), bridging, mainnet, hiding payer or timing, any change to `GhostPayRouter`/`GhostPaySweepRelayer`.

## 2. Threat addressed, and what it does NOT protect

Addressed (research ids [R]):

| ID | Leak | Effect with CT-1 |
|---|---|---|
| L1 (amount part) | gross/net amount public | `ConfidentialTransfer(from,to,euint64 amount)` carries a 32-byte **handle**, not a value [P: IERC7984.sol] |
| L11 | `net` in announcement metadata; gross from `FeeCollected` | metadata carries the net **handle**; no plaintext fee event |
| amount-uniqueness heuristic | invoice-specific amounts match across hops | amounts invisible between wrap and unwrap, so amount matching only works at wrap/unwrap boundaries |
| PA5 amount field | sweep relayer sees amount | CT sweep is a self-sent `confidentialTransfer` (no relayer, see 6.6) |

NOT protected (normative, must appear in UI copy and `docs/user/privacy-limits.md`):

1. **Edges stay public.** `from`, `to`, token, router use, block time and the ERC-5564 announcement are public. Payer -> stealth link is unchanged (D1, L3). This hides *how much*, not *who* or *when*.
2. **Wrap and unwrap are public amounts.** `ERC7984ERC20Wrapper.wrap` emits `Wrap(to, underlyingAmount, ...)` in plaintext and pulls a plaintext ERC-20 transfer; `finalizeUnwrap` emits `UnwrapFinalized(..., uint64 cleartext)` and pays plaintext ERC-20 [P: ERC7984ERC20Wrapper.sol]. A payer who wraps exactly the invoice amount right before paying leaks it. Mitigation is behavioural (CT-UX-4).
3. **Decryptors.** On every transfer the token ACL-allows the handle to `from` and `to` [P: ERC7984.sol `_update`]. The payer, the stealth owner and (in a naive router) the **fee recipient** can decrypt their handles; fee x 400 ~ gross. Section 6.3 avoids per-payment fee decryption by aggregation; residual leak is stated in R-4.
4. **Trust in the FHE operator.** CT-1 confidentiality rests on Zama's KMS/coprocessor set; collusion above its threshold decrypts everything. Threshold parameters were not verified [U]. CT-3 rests on TEE integrity; CT-2 on Fhenix's network [U].
5. **Decryption-request metadata.** User decryption goes through a relayer (`https://relayer.testnet.zama.org` for Sepolia [P: relayer-sdk 0.4.5 config]) with an EIP-712 signature by the handle owner. The relayer learns the stealth address, the handle, IP and timing; one request covering several stealth addresses **links them** (CT-DEC-2).
6. **ACL state is on-chain.** Who is allowed on which handle is stored in the ACL contract (`0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D` on Sepolia [P]); whether it emits per-allow events was not verified [U]. Assume allow-lists are public.
7. **Zero-transfer ambiguity.** ERC-7984 (OZ) transfers `min(amount, balance-ok ? amount : 0)` without reverting (`FHE.select(success, amount, 0)` [P]). A payment can silently be 0; only the seller's decryption proves receipt (CT-PAY-6).
8. **Gas funding of the stealth address** links as today (L9, research 4.4): the payer's ETH buffer, or a top-up.
9. **Supply/denomination leaks.** `inferredTotalSupply()` is plaintext (wrapper's underlying balance) [P]; with few users the delta per block reveals wrap amounts anyway.

## 3. What is real and deployable in 2026 (verified)

| Item | Fact | Tag / source |
|---|---|---|
| ERC-7984 | "Confidential Fungible Token", **Status: Draft**, Standards Track ERC, created 2025-07-03, requires 165; amounts are `bytes32` "confidential pointers"; ERC-165 id `0x4958f2a4`; technology-agnostic (FHE, ZK, enclaves) | [P] ethereum/ERCs `ERCS/erc-7984.md` |
| OZ Confidential Contracts | `@openzeppelin/confidential-contracts` **0.5.3** (npm latest, 2026-08-10), MIT; peer `@fhevm/solidity 0.11.1`; repo devDeps use `@fhevm/solidity ^0.13.3`, `@fhevm/hardhat-plugin 0.13.0-1` (mismatch, see R-6); `IERC7984` is labelled "Draft interface ... utilizing the Zama FHE library", last updated v0.3.0 | [P] npm registry; GitHub master `contracts/package.json`, `package.json`, `IERC7984.sol` |
| OZ audit | "Zama confidential contracts 0.3.0 release audit", OpenZeppelin, 2026-03-18 | [S] search result only; report not read |
| `IERC7984` in OZ | `confidentialTransfer(address,externalEuint64,bytes)`, `confidentialTransfer(address,euint64)`, `...From` variants, `...AndCall` variants, `setOperator(address,uint48 until)`, `isOperator`, `confidentialBalanceOf`, `confidentialTotalSupply`; events `ConfidentialTransfer(address indexed,address indexed,euint64 indexed)`, `OperatorSet`, `AmountDisclosed(euint64 indexed,uint64)` | [P] `IERC7984.sol` |
| Wrapper | `ERC7984ERC20Wrapper`: `wrap(to, amount)` (rounds down to `rate()`, decimals capped, uint64 amounts); `unwrap(...)` burns and `FHE.makePubliclyDecryptable`, then async `finalizeUnwrap(id, uint64 cleartext, bytes decryptionProof)` checked by `FHE.checkSignatures` | [P] `ERC7984ERC20Wrapper.sol` |
| fhEVM Solidity lib | `@fhevm/solidity` **0.13.4** (2026-10-07), BSD-3-Clause-Clear; `ZamaConfig` routes: Ethereum 1, Polygon 137, **Sepolia 11155111**, Polygon Amoy 80002, local 31337; reverts `ZamaProtocolUnsupported` elsewhere. **Base Sepolia not supported.** `FHE.div(euint64, uint64)`, `FHE.sub`, `FHE.select` exist | [P] npm tarball `config/ZamaConfig.sol`, `lib/FHE.sol` |
| Sepolia addresses (CT-1 manifest) | ACL `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D`, Coprocessor `0x92C920834Ec8941d2C77D188936E1f7A6f49c127`, KMSVerifier `0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A`, InputVerifier `0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0`, gatewayChainId `10901`, wrappers registry `0x2f0750Bbb0A246059d80e94c454586a7F27a128e` | [P] `ZamaConfig.sol`; `@zama-fhe/sdk` 3.7.0 `chains` preset |
| Ethereum mainnet | Zama config for chain 1 exists (ACL `0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6`), relayer `https://relayer.mainnet.zama.org` needs an API key | [P] same; SDK `guides/authentication.md` |
| Client SDK | `@zama-fhe/relayer-sdk` 0.4.5 is **deprecated** in its README; successor `@zama-fhe/sdk` **3.7.0** (2026-10-19), BSD-3-Clause-Clear, deps `viem >=2`, `@fhevm/sdk 0.13.2`; has `Token` (ERC-7984 ops) and `WrappedToken` (shield/unshield), browser `web()`, Node `node()` and **`cleartext()`** relayers; Sepolia relayer needs **no API key** | [P] npm tarballs, `zama-ai/sdk` docs `authentication.md` |
| Zama licence | "free to use ... only for development, research, prototyping, and experimentation"; commercial use needs Zama patent licence | [P] `zama-ai/fhevm` README |
| Fhenix CoFHE | `@cofhe/sdk` 1.0.1 (2026-10-19, MIT) chain configs: 11155111, 421614, **84532**, 42161, 31337, 420105; endpoints `https://testnet-cofhe.fhenix.zone`; `@fhenixprotocol/cofhe-contracts` 1.0.2 `FHE.sol` BSD-3-Clause-Clear. No ERC-7984 / FHERC20 contract found in that package | [P] npm tarballs; token standard on Fhenix [U] |
| Inco Lightning | `@inco/lightning` 1.1.0 (2026-10-02), Solidity `BUSL-1.1`, types `euint256` etc., `InvalidTEEAttestation` error (TEE-based); manifest lists Base 8453 and Base Sepolia 84532; claimed Trail of Bits audit and Base mainnet | [P] npm tarball; audit/mainnet [S] inco.org blog |
| Aztec | `@aztec/aztec.js` 5.2.1 latest (2026-10-07); docs call the network a live "Alpha" mainnet where critical bugs are expected; critical-vulnerability disclosures March 2026 | [P] npm; rest [S] docs.aztec.network/aztec.network blog via search |
| Oasis Sapphire | `@oasisprotocol/sapphire-paratime` 2.3.0 (2025-12-05, Apache-2.0) | [P] npm; feature claims not checked [U] |
| ZK-based ERC-7984 implementation | none found | [U] |

Conclusion: CT-1 is the only option where a draft ERC, an audited-claim library, a maintained client SDK and a no-key testnet coincide on a GhostPay chain (Sepolia). CT-2/CT-3 are real coprocessors with Base Sepolia support but without a verified ERC-7984 token implementation; they need a spike.

## 4. User-visible option

Pay view "Options" fieldset (`apps/web/src/views/Pay.tsx`, near existing delay checkbox [R]) and invoice creation. New selector **"Amount visibility"**, default **Public**:

| Choice | Shown when | Copy (keys in `CTCopy`) |
|---|---|---|
| Public (current) | always | — |
| Hidden: Zama (Sepolia) | invoice chain = 11155111 and seller meta-address advertises CT-1 support (6.5) | `CT_HIDES_AMOUNT_ONLY`, `CT_WRAP_PUBLIC`, `CT_TRUST_ZAMA`, `CT_TESTNET_ONLY` |
| Hidden: Fhenix / Inco | after spike passes and backend flag enabled | `CT_TRUST_FHENIX` / `CT_TRUST_INCO_TEE` |
| Aztec / Sapphire | disabled, "different chain, not available" | `CT_OTHER_CHAIN` |

Payer flow (CT-1): (1) shows public cERC-20 wrap step if confidential balance is insufficient, with warning `CT_WRAP_PUBLIC` and suggestion to wrap a round sum earlier (links `amount-blurring.md` AB-DENOM); (2) `setOperator(router, now+15 min)`; (3) encrypt gross locally, call `payConfidential`; (4) receipt shows "Sent (amount hidden). Seller confirms receipt by decrypting." Seller flow: scanner flags confidential payments as `pending-decrypt`; "Reveal amount" decrypts per stealth address (CT-DEC-*); "Move" = confidential transfer to a fresh destination, or "Unwrap to ERC-20" with warning `CT_UNWRAP_PUBLIC`.

## 5. Architecture

```
payer browser                       chain (Sepolia)                         seller browser
 encrypt(gross) --zkPoK--> GhostPayConfidentialRouter.payConfidential --> ERC-5564 announce(meta: tag|sel|token|netHandle)
   (@zama-fhe/sdk)            |  token.confidentialTransferFrom(payer,router,gross)
                              |  fee = div(transferred,400); net = transferred - fee
                              |  token.confidentialTransfer(stealth, net)       scanner -> stealth key -> user-decrypt(netHandle)
                              |  fees stay in router; flushFees() per epoch        via relayer (one stealth per request)
                              v
                    ERC7984ERC20Wrapper (test token gcUSD over MockERC20)  <-- wrap/unwrap (public amounts)
```

### 5.1 New packages (the build)

| Dir | npm name | Owns | Deps (exact pins) |
|---|---|---|---|
| `packages/confidential-contracts/` | `@ghostpay/confidential-contracts` | `GhostPayConfidentialRouter.sol`, `GhostPayTestConfidentialToken.sol` (OZ `ERC7984ERC20Wrapper` over a mintable test ERC-20, testnet only), mocks, Hardhat tests, deploy script, ABI export JSON | `hardhat`, `@fhevm/hardhat-plugin`, `@fhevm/solidity`, `@openzeppelin/confidential-contracts 0.5.3`, `@openzeppelin/contracts 5.x` — one mutually compatible set fixed by spike S-1 (R-6) |
| `packages/confidential-amounts/` | `@ghostpay/confidential-amounts` | `ConfidentialBackend` interface, registry, pinned manifest, CT-1 Zama adapter (lazy `import('@zama-fhe/sdk')`), CT-M cleartext backend, metadata codec (6.4), decrypt scheduler (CT-DEC), copy keys, leakage notes | `viem` (peer, repo pin `2.57.7` [R]), `@zama-fhe/sdk 3.7.0` (optional dep, dynamic import) |
| `packages/confidential-amounts-fhenix/` | `@ghostpay/confidential-amounts-fhenix` | CT-2 adapter (after spike S-3) | `@cofhe/sdk 1.0.1` |
| `packages/confidential-amounts-inco/` | `@ghostpay/confidential-amounts-inco` | CT-3 adapter (after spike S-4) | `@inco/js` (version at spike time) |

Why Hardhat, not Foundry: fhEVM mock execution is shipped as `@fhevm/hardhat-plugin`; a Foundry equivalent was not verified [U]. Keeping it in a separate package leaves `packages/contracts` (Foundry, solc 0.8.28 [R]) untouched. Solidity in the new package: `0.8.28`, `evm_version cancun` to match CONTRACTS_SPEC; fhEVM requires `^0.8.24` [P].

Layout: `confidential-amounts/src/{types.ts,registry.ts,manifest.ts,metadata.ts,decrypt.ts,copy.ts,errors.ts,index.ts}`, `src/backends/{zama.ts,cleartext.ts}`, `manifest/confidential.testnet.json`, colocated `*.test.ts`, `README.md`, `DEVIATIONS.md`.

### 5.2 Edits to existing code (separate PRs, owned by those packages' maintainers)

| File | Change |
|---|---|
| `packages/core-crypto/src/metadata.ts` | accept selector `0x5bebed7e` and return `{kind:'confidential', token, amountHandle}`; plaintext parsing unchanged |
| `apps/web/src/lib/scanClient.ts` | route confidential matches to `pending-decrypt`; never display a number before decryption |
| `apps/web/src/views/Pay.tsx`, invoice create view, Settings | "Amount visibility" selector (section 4) |
| `packages/chain-adapters/src/deployments.ts`, `deployments/` schema | optional `confidentialRouter`, `confidentialTokens[]` per chain |
| `packages/invoice-schema` | optional field `amountVisibility: 'public' \| 'ct1' \| 'ct2' \| 'ct3'` (seller capability) |
| `docs/user/privacy-limits.md`, `anonymization-research.md` 5.6 | NOT-protected list (section 2); mark 5.6 superseded for Sepolia |

## 6. Interfaces and ABIs

### 6.1 `GhostPayConfidentialRouter` (CT-1)

```solidity
// SPDX-License-Identifier: <repo licence>
pragma solidity 0.8.28;
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol"; // exact contract name confirmed in spike S-1 [U]
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

contract GhostPayConfidentialRouter is ZamaEthereumConfig, ReentrancyGuard {
  uint64  public constant FEE_DIVISOR = 400;            // 25 bps exactly: floor(x*25/10000) == floor(x/400)
  uint256 public constant FEE_EPOCH = 7 days;
  bytes4  public constant CT_SELECTOR = 0x5bebed7e;     // confidentialTransfer(address,bytes32)
  IERC5564Announcer public immutable ANNOUNCER;
  address public immutable FEE_RECIPIENT;
  mapping(address token => uint256) public lastFlush;

  constructor(IERC5564Announcer announcer, address feeRecipient); // non-zero, feeRecipient != this

  function payConfidential(IERC7984 token, address stealth, externalEuint64 encGross, bytes calldata inputProof,
      uint256 deadline, uint256 maxBufferWei, bytes calldata ephemeralPubKey, bytes1 viewTag)
      external payable nonReentrant returns (euint64 netSent);

  function flushFees(IERC7984 token) external nonReentrant;   // anyone; at most once per FEE_EPOCH per token

  event ConfidentialPayment(address indexed token, euint64 netHandle);   // no payer/stealth/amount
  event FeesFlushed(address indexed token, euint64 feeHandle);
  error ZeroAddress(); error InvalidStealth(); error Expired(); error InvalidEphemeralKey();
  error BufferTooLarge(); error NotOperator(); error FlushTooEarly(); error NativeTransferFailed(); error NoDirectETH();
}
```

`payConfidential` steps (normative order):
1. `block.timestamp <= deadline`; `stealth` not zero/this/`FEE_RECIPIENT`; eph key 33 bytes, prefix 02/03; `msg.value <= maxBufferWei`; `token.isOperator(msg.sender, address(this))` else `NotOperator`.
2. `gross = FHE.fromExternal(encGross, inputProof)` (input bound to router address and `msg.sender`); `FHE.allowTransient(gross, address(token))`.
3. `t = token.confidentialTransferFrom(msg.sender, address(this), gross)` (token grants router transient access [P]).
4. `fee = FHE.div(t, FEE_DIVISOR)`; `net = FHE.sub(t, fee)`; `FHE.allowTransient(net, address(token))`.
5. `netSent = token.confidentialTransfer(stealth, net)`; fee remains in router balance. `FHE.allow(netSent, msg.sender)` so the payer can prove/inspect what was sent.
6. If `msg.value > 0` forward to `stealth` (`call`, must succeed).
7. `metadata = abi.encodePacked(viewTag, CT_SELECTOR, address(token), euint64.unwrap(netSent))` (57 bytes); `ANNOUNCER.announce(1, stealth, ephemeralPubKey, metadata)`; emit `ConfidentialPayment`.

`flushFees`: `block.timestamp >= lastFlush[token] + FEE_EPOCH`; `bal = token.confidentialBalanceOf(this)`; `token.confidentialTransfer(FEE_RECIPIENT, bal)`; update `lastFlush`. Router has no owner, pause, upgrade, `delegatecall` or arbitrary call (CONTRACTS_SPEC rules [R]). Deviation from CONTRACTS_SPEC: router holds an (encrypted) fee balance between flushes; documented in `DEVIATIONS.md`.

ACL handling of FHE op results (whether `div`/`sub` results are transiently allowed to the computing contract automatically) is [U]; spike S-1 confirms and adds explicit `FHE.allowThis`/`allowTransient` where needed.

### 6.2 Test token (testnet only)

`GhostPayTestConfidentialToken is ERC7984ERC20Wrapper` over `MockERC20 "GhostPay Test USD" (6 decimals, public mint)`. Name/symbol MUST contain "Test". Not an imitation of any real stablecoin.

### 6.3 Fee design rationale

Naive `confidentialTransfer(FEE_RECIPIENT, fee)` per payment lets the fee recipient decrypt each fee and recover gross within 400 base units (section 2 item 3). Aggregating in the router and flushing at most once per 7 days means the recipient decrypts only epoch sums. Residual: with one payment per epoch, the sum is that payment's fee (R-4).

### 6.4 Metadata (GhostPay convention on ERC-5564 metadata)

57 bytes, same length as today [R]: `[0]` view tag, `[1:5]` `0x5bebed7e` (selector of `confidentialTransfer(address,bytes32)`, the ABI type of `euint64`), `[5:25]` token, `[25:57]` net handle. Following the ERC-5564 pattern of "function identifier + token + amount" with the amount slot holding a pointer; this is a GhostPay convention, not part of either ERC.

### 6.5 TypeScript (`@ghostpay/confidential-amounts`)

```ts
export type CtBackendId = 'ct1-zama' | 'ct2-fhenix' | 'ct3-inco' | 'ctm-cleartext';
export interface CtBackendInfo {
  id: CtBackendId; chains: readonly number[]; trust: 'threshold-kms' | 'fhe-network' | 'tee' | 'none';
  maturity: 'testnet' | 'test-double' | 'spike'; licence: string; relayerOrigin: string | null;
  whatItHides: readonly string[]; whatItDoesNotHide: readonly string[];  // must include section-2 keys
}
export interface ConfidentialBackend {
  info: CtBackendInfo;
  encryptAmount(p: { chainId: number; contract: Address; user: Address; amount: bigint }): Promise<{ handle: Hex; inputProof: Hex }>;
  buildPayCalldata(p: CtPayParams): Promise<{ to: Address; data: Hex; value: bigint }>;
  buildSetOperator(p: { token: Address; operator: Address; until: number }): { to: Address; data: Hex };
  userDecrypt(p: { chainId: number; contract: Address; handle: Hex; signer: StealthSigner }): Promise<bigint>; // one handle owner per call
  buildConfidentialTransfer(p: { token: Address; to: Address; amountHandle: Hex }): { to: Address; data: Hex };
  buildUnwrap(p: { token: Address; from: Address; to: Address; amountHandle: Hex }): { to: Address; data: Hex };
  finalizeUnwrap(p: { token: Address; requestId: Hex }): Promise<{ to: Address; data: Hex }>;  // fetches public decryption proof
}
export interface CtPayParams { chainId: number; router: Address; token: Address; stealth: Address; gross: bigint;
  deadline: bigint; bufferWei: bigint; ephemeralPubKey: Hex; viewTag: number; payer: Address }
export function parseConfidentialMetadata(m: Uint8Array): { token: Address; amountHandle: Hex; viewTag: number } | null;
export function buildConfidentialMetadata(viewTag: number, token: Address, handle: Hex): Uint8Array;
export function getBackend(id: CtBackendId): Promise<ConfidentialBackend>;   // dynamic import; throws CtUnavailable
export class DecryptScheduler { constructor(o: { minGapMs: number; maxGapMs: number; isolate: (k: string) => Fetch }); enqueue(job): void }
```

`StealthSigner` signs the EIP-712 user-decrypt request with the one-time stealth key, held via `@ghostpay/secret-box` [R]; the key never leaves the worker except as a signature.

### 6.6 Sweep

`GhostPaySweepRelayer` cannot move ERC-7984 (no permit). PoC sweep = the stealth EOA itself sends `confidentialTransfer(destination, balanceHandle)` paid from the payer's buffer (`maxBufferWei`), or `unwrap`+`finalizeUnwrap` to ERC-20 (public amount). An ERC-7984 meta-transaction relayer is out of scope (open question Q3).

## 7. Requirements

Contracts (`packages/confidential-contracts`):
- **CT-C-1 MUST** implement 6.1 exactly; no owner, pause, proxy, `delegatecall`, arbitrary call; `receive`/`fallback` revert `NoDirectETH`.
- **CT-C-2 MUST** emit no plaintext amount, fee, payer or stealth in router events.
- **CT-C-3 MUST** satisfy, in mock mode, `decrypt(fee)+decrypt(netSent) == decrypt(t)` and `decrypt(fee) == decrypt(t)/400` for fuzzed `t` in `[0, 2^64-1]`.
- **CT-C-4 MUST** produce exactly the 57-byte metadata of 6.4, with `[25:57] == netSent` handle.
- **CT-C-5 MUST** revert `NotOperator` when the payer has not set the router as operator or `until` has passed.
- **CT-C-6 MUST** revert `FlushTooEarly` within `FEE_EPOCH`; `flushFees` moves the full router balance to `FEE_RECIPIENT`.
- **CT-C-7 MUST** never ACL-allow `FEE_RECIPIENT` on a per-payment handle (checked via `FHE.isAllowed` in tests).
- **CT-C-8 MUST** compile only for chain ids 11155111 and 31337 (deploy script refuses others).
- **CT-C-9 SHOULD** keep gas/HCU per `payConfidential` within the coprocessor's per-tx limit with margin; measured value recorded in `DEVIATIONS.md` [limit value U].

Client (`packages/confidential-amounts`):
- **CT-PAY-1 MUST** default to `public`; never auto-select a confidential backend.
- **CT-PAY-2 MUST** set operator `until <= now + 900 s` and show it in tx review.
- **CT-PAY-3 MUST** encrypt the amount client-side only; plaintext gross never sent to any relayer or server.
- **CT-PAY-4 MUST** refuse a backend on a chain not in its pinned manifest; manifest addresses are compared with on-chain code hash before first use (pattern of research S3-01 [R]).
- **CT-PAY-5 MUST** refuse mainnet chain ids (1, 137, 8453, 42161) in this PoC.
- **CT-PAY-6 MUST** label a confidential payment "unconfirmed" on both sides until the seller's decryption returns a value `>=` the invoice net; a decrypted 0 is shown as "payment failed (insufficient confidential balance)".
- **CT-DEC-1 MUST** decrypt one stealth address per relayer request; never batch handles of different stealth owners.
- **CT-DEC-2 MUST** space decryption requests by a random gap (default 30-300 s) and SHOULD use a separate isolated transport per request (Tor circuit per `network-privacy.md`, when enabled).
- **CT-DEC-3 MUST NOT** use delegated decryption to the seller's long-term key (it would link stealth addresses on-chain).
- **CT-DEC-4 MUST** zeroize the stealth key after signing (secret-box scope).
- **CT-UX-1 MUST** display every section-2 NOT-protected item applicable to the selected backend before first use; acknowledgement required.
- **CT-UX-2 MUST** warn `CT_WRAP_PUBLIC` on wrap and `CT_UNWRAP_PUBLIC` on unwrap, showing the exact plaintext amount that becomes public.
- **CT-UX-3 MUST NOT** claim "private", "anonymous" or "untraceable"; allowed claim: "amount hidden on-chain from the public; visible to you, the seller and the encryption operator if it misbehaves".
- **CT-UX-4 SHOULD** suggest wrapping round denominations ahead of time (AB-DENOM link) and warn when wrap amount equals invoice gross.
- **CT-SUP-1 MUST** load `@zama-fhe/sdk` (and CT-2/CT-3 SDKs) only via dynamic `import()`; core bundle without them passes `apps/web/scripts/scan-bundle.mjs` [R].
- **CT-SUP-2 MUST** pin exact versions and record licences in `THIRD_PARTY.md`.
- **CT-SUP-3 MUST** set no telemetry headers beyond what the SDK requires; document SDK `x-zama-sdk-*` usage headers [P: auth guide] in the privacy notice.

## 8. Test plan

| Test | Where | Covers |
|---|---|---|
| T1 Hardhat mock unit tests (pay, fee split fuzz 1 000 runs, operator expiry, metadata bytes, flush epoch, ACL checks, reentrancy via `AndCall` receiver mock) | `packages/confidential-contracts/test` | CT-C-1..8 |
| T2 Zero-balance payment: payer with balance < gross; assert `decrypt(netSent)==0`, no revert | same | section 2.7, CT-PAY-6 |
| T3 Event scan: decode all logs of a payment, assert no plaintext equal to gross/net/fee in topics or data | same | CT-C-2 |
| T4 Codec round-trip and rejection (wrong length, wrong selector, plaintext metadata) | `confidential-amounts/src/metadata.test.ts` | 6.4 |
| T5 Cleartext backend e2e: create invoice -> pay -> scan -> decrypt -> sweep against hardhat node | `confidential-amounts` | CT-PAY-*, CT-DEC-1/4 |
| T6 Decrypt scheduler: no request contains two owners; gaps within bounds (fake timers) | same | CT-DEC-1/2 |
| T7 Manifest/chain guard: Base Sepolia, mainnets rejected for CT-1 | same | CT-PAY-4/5 |
| T8 Bundle test: core entry has no `@zama-fhe` import | `apps/web` (after wiring) | CT-SUP-1 |
| T9 Sepolia live smoke (manual, `CT_LIVE=1`, funded test key): deploy, wrap, pay, user-decrypt, flush after warp not possible -> verify `FlushTooEarly` only | script | integration, latency measurement |
| T10 Copy test: forbidden words absent; NOT-protected keys rendered | `apps/web` | CT-UX-1/3 |

## 9. PoC acceptance criteria

1. `npm test` in both new packages passes offline (mock + cleartext), no network.
2. On Sepolia (T9): a payment of a test amount produces an announcement with a handle; the seller's client finds it by scanning, decrypts the exact net with the stealth key, and moves it to a fresh address with a confidential transfer; no plaintext amount appears in any router/token event of the payment tx (verified by T3 decoder on the live receipt).
3. Measured and recorded: gas of `payConfidential`, time to user-decrypt, time to `finalizeUnwrap`.
4. UI shows the selector with CT-1 enabled only on Sepolia, all others disabled with reasons.
5. `DEVIATIONS.md` lists every [U] item resolved or still open.

## 10. Spikes (before build)

- **S-1 (S):** pick a consistent version set (OZ confidential 0.5.3 vs `@fhevm/solidity` 0.11.1/0.13.4, hardhat plugin 0.4.2 vs 0.13.0-1); confirm config contract name and ACL semantics for op results; compile with solc 0.8.28.
- **S-2 (S):** confirm Sepolia relayer accepts user-decrypt signed by a fresh EOA with no history; measure latency.
- **S-3 (S):** Fhenix: does an ERC-7984 (or FHERC20) implementation exist and run on Base Sepolia? If yes, port router; else CT-2 stays disabled.
- **S-4 (S):** Inco: same question; licence BUSL-1.1 recorded.

## 11. Effort

CT-1 contracts + tests M; CT-1 client lib + cleartext backend M; web wiring (separate owners) S-M; CT-2, CT-3 adapters M each, conditional. Total L.

## 12. Risks

- **R-1** Draft ERC: interface may change (ERC-7984 Draft; OZ interface "Draft"). Pin versions; adapter isolates ABI.
- **R-2** Operator trust: Zama KMS/coprocessor collusion or bug reveals amounts; Sepolia testnet may be reset or re-keyed [U], stranding test handles.
- **R-3** Operator approval: router as operator can move any amount until `until`; a router bug drains confidential balances. Mitigated by 15-min `until`, no arbitrary call.
- **R-4** Fee leak residual: low-traffic epochs reveal single fees to the fee recipient.
- **R-5** Silent zero transfers enable fake "paid" announcements (spam); scanner must not trust before decrypt.
- **R-6** Version skew between OZ peer deps and latest fhEVM; SDK churn (relayer-sdk deprecated within a year).
- **R-7** Relayer as a metadata collector (section 2.5); centralised hosted relayer for Sepolia.
- **R-8** Behavioural leaks at wrap/unwrap dominate; most users wrap exact amounts.
- **R-9** Bundle size and WASM (TFHE public key, zk proof) in browser [U size]; must stay lazy.

## 13. Open questions

- Q1 Does fhEVM's ACL emit events revealing allow-lists? [U]
- Q2 KMS threshold and party set for Zama testnet/mainnet? [U]
- Q3 Gasless ERC-7984 sweep: EIP-712 operator meta-tx or EIP-7702 batch from stealth (`payer-hiding.md`)?
- Q4 Should the seller advertise CT support in the meta-address (new scheme id) or only in the invoice (`amountVisibility`)? This spec uses the invoice field (scheme 1 unchanged).
- Q5 Is there a ZK (non-FHE) ERC-7984 implementation worth a slot? None found.
- Q6 Legal/licensing (Zama patent licence, BUSL) — deferred by owner.

## 14. Sources (retrieved 2026-10-21)

- ERC-7984 text: https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7984.md [P]
- OZ confidential contracts: https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-confidential-contracts/master/contracts/interfaces/IERC7984.sol , `.../contracts/token/ERC7984/ERC7984.sol`, `.../extensions/ERC7984ERC20Wrapper.sol`, `.../interfaces/IERC7984ERC20Wrapper.sol`, `.../contracts/package.json` [P]
- npm registry metadata/tarballs: https://registry.npmjs.org/@fhevm/solidity (0.13.4), `@openzeppelin/confidential-contracts` (0.5.3), `@zama-fhe/relayer-sdk` (0.4.5), `@zama-fhe/sdk` (3.7.0), `@cofhe/sdk` (1.0.1), `@fhenixprotocol/cofhe-contracts` (1.0.2), `@inco/lightning` (1.1.0), `@aztec/aztec.js` (5.2.1), `@oasisprotocol/sapphire-paratime` (2.3.0) [P]
- Zama licence/README: https://raw.githubusercontent.com/zama-ai/fhevm/main/README.md [P]
- Zama SDK auth guide: https://raw.githubusercontent.com/zama-ai/sdk/main/docs/gitbook/src/guides/authentication.md [P]
- OZ audit announcement: https://www.openzeppelin.com/news/zama-confidential-contracts-0.3.0-release-audit [S, search result]
- Inco: https://www.inco.org/blog/inco-lightning-live-on-base-mainnet [S]
- Aztec: https://docs.aztec.network/participate/get-started ; https://aztec.network/blog/aztec-tge-next-steps [S]
- Fhenix: https://cdn.jsdelivr.net/npm/@cofhe/sdk@0.5.2/dist/chains.d.cts [S; superseded by tarball 1.0.1 read]
