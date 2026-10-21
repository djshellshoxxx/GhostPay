# GhostPay Post-Launch Feature Expansion and Advanced Security Roadmap

**Status:** Proposed post-launch specifications.  
**Scope assumption:** The core engine is deployed as stated in the request. Before implementing any item, reconcile this document with the actual deployment manifest, contract bytecode, supported chains/tokens, and existing security audit.

This document gives each feature a developer specification followed immediately by its security assessment. It does not claim that GhostPay hides public-chain sender, amount, timing, token, contract-call, or transaction-graph data. “Blinded” and “stealth” are scoped properties, not absolute anonymity guarantees.

## Shared implementation gates

- Add one feature branch/spec and one security-review checklist per feature. Do not combine the six features into one release.
- Update the architecture decision record, supported-chain/token matrix, privacy data-flow diagram, user disclosure, and test plan before implementation.
- New contract code requires unit, fuzz, invariant, and independent audit coverage. New browser/crypto code requires published vectors, differential tests, browser/network-egress tests, and dependency review.
- Treat all relayers, wallets, RPCs, indexers, oracle sources, embed hosts, and pinning services as external observers.
- A feature is not “privacy preserving” solely because it uses Tor, encryption, a fresh address, randomized delay, or a ZK proof. State which observer learns which data.

# Feature 1 — Gas-Sponsoring Checkout: In-Flight Gas Buffer

## 1A. Developer-ready technical specification

### Purpose and constraint

Let a payer optionally include a small native-token buffer that reaches the one-time destination alongside the ERC-20 payment. The recipient can then spend native gas to sweep the tokens.

An ERC-20 transfer cannot create native ETH. The buffer must be supplied as native value by the payer, swapped from a token by a separately specified swap path, or sponsored by a relayer/paymaster. The straightforward in-flight version is an optional native value attached to the same router call. It avoids a later transfer from the seller’s known wallet, but it publicly connects the payer transaction, stealth address, and buffer.

The buffer is a convenience feature. It does not remove all transaction-linkage risk.

### Architecture and data flow

1. Invoice specifies whether native buffer is accepted, the maximum amount, allowed chain/native asset, and refund behavior.
2. Client estimates sweep gas for the supported token and network, applies a configurable safety multiplier, and converts the estimate to native units using a fresh quote.
3. UI shows buffer in native units and fiat estimate separately, plus the fact it is publicly attached to the payer’s payment.
4. Payer opts in and signs a payable router call with ERC-20 allowance/permit plus exact native buffer.
5. Router atomically pays fee, sends ERC-20 net amount to stealth address, transfers native buffer to the same destination, and calls the standard EIP-5564 announcer.
6. Seller verifies receipt and then sweeps tokens using the received native balance.
7. Any excess-buffer refund policy must be explicit. Refund to payer is publicly linked; do not silently return funds to an address inferred from calldata.

### Front-end calculation

Estimate expected sweep gas using a token-specific simulation when possible. Use conservative values; do not promise a fixed fiat amount of gas coverage.

~~~ts
export interface GasBufferQuote {
  chainId: number;
  nativeAsset: "ETH" | string;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  safetyBps: bigint;
  bufferWei: bigint;
  quotedAt: number;
  expiresAt: number;
}

export function calculateBuffer(input: {
  estimatedSweepGas: bigint;
  maxFeePerGas: bigint;
  safetyBps: bigint;
}): bigint {
  const base = input.estimatedSweepGas * input.maxFeePerGas;
  return (base * (10_000n + input.safetyBps) + 9_999n) / 10_000n;
}
~~~

Re-estimate immediately before transaction confirmation. Reject stale quotes and cap the native buffer to the invoice limit. Account for EIP-1559 fee conditions, token-specific transfer cost, chain congestion, and any account deployment cost. If a token has unusual hooks, simulation is not reliable enough for automatic sizing.

### Contract interface sketch

Prefer a distinct payable router method, so non-buffer payments do not unexpectedly transfer ETH. Production code must use reviewed SafeERC20/ReentrancyGuard utilities and enforce supported token behavior.

~~~solidity
/// @notice Pays an ERC-20 invoice and optionally sends a native gas reserve.
/// @dev This joins payer, stealth destination, token payment, and reserve in one
/// public transaction. The reserve is not confidential and is not a ZK gas pool.
function payERC20WithBuffer(
    bytes32 invoiceId,
    IERC20 token,
    address stealthAddress,
    uint256 grossAmount,
    uint256 minNetAmount,
    uint256 maxBufferWei,
    uint48 deadline,
    bytes calldata ephemeralPubKey,
    bytes calldata metadata
) external payable;
~~~

Required checks: chain-bound invoice policy, nonzero destination/token, deadline, gross and min-net bounds, exact metadata format, fee math, and maximum native buffer. Require msg.value to equal the selected buffer or define an explicit excess policy. Atomic revert if any transfer/announce fails. Avoid unbounded arbitrary swap calls. If token-to-native swapping is later added, use a separately audited adapter with strict slippage, route allowlist, deadline, and minimum output.

### UI components and integration steps

- “Add gas buffer” opt-in toggle; default off.
- Display native quantity, fiat estimate, gas assumptions, expiry, and public linkage notice.
- Show native/token amounts on the final wallet confirmation screen.
- Provide retry/refresh when fee estimate changes, and never submit automatically after a delay.
- Receipt records actual native amount and payment status.
- Add testnet flows for buffer omitted, exact buffer, over max, fee spike, unsupported network, sweep estimate failure, and token revert.

## 1B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| MEV/searcher sees buffer and can reorder or copy a sweep | Buffer arrives atomically with payment; no separate public “gas top-up” transaction. Set min-net and deadline; seller signs sweep locally and checks destination. | Buffer and token receipt are in one public transaction. A searcher cannot spend without the key but can observe and attempt economic griefing. |
| Front-run/steal native reserve | No public claim or unprotected reserve withdrawal function. Reserve is transferred only to the derived stealth address, not a user-supplied gas-vault recipient. | If a contract wallet is used, its execution policy must be audited. |
| Gas-cost manipulation/underfunding | Conservative buffer, fresh fee estimate, max/min bounds and clear insufficiency message; no fiat guarantee. | Gas may spike after inclusion; transfer hooks can increase sweep cost. |
| Payer griefs recipient with dust or invalid buffer | Minimum buffer and minimum payment policy; rate-limits only if a hosted checkout service exists. | Permissionless on-chain payments can still create unwanted dust. |
| Native refund creates link | Default to exact payment, no automatic change/refund; if refund enabled, require explicit payer address confirmation and document linkability. | Refund connects payer and stealth transaction. |
| Confusion that this “solves” unlinkability | UI says buffer is a payer-funded on-chain transfer in the same transaction. | Public chain data still links sender, amount, time, and destination. |

**Release checklist**

- [ ] Contract proves atomic token/native transfer and standard announcement.
- [ ] Buffer max, minimum, expiry, and refund behavior are tested.
- [ ] Simulated transaction matches the UI preview and final calldata.
- [ ] User-facing copy describes the public payer-to-stealth relationship.
- [ ] Unsupported token/sweep estimates fail closed.

# Feature 2 — Embeddable “Pay with GhostPay” Widgets and Buttons

## 2A. Developer-ready technical specification

### Architecture

Publish a small static SDK, ghostpay-embed.js, that merchants load from a pinned GhostPay release. The script creates a button using DOM APIs and opens either:

1. a top-level checkout popup/window on a dedicated GhostPay origin; or
2. a sandboxed iframe modal, only for merchants explicitly permitted by GhostPay’s frame policy.

The iframe is the preferred containment boundary for CSS/DOM isolation, but it does not make the merchant’s page trustworthy or protect the checkout from a compromised GhostPay origin. A merchant can always alter the surrounding button and supplied parameters.

### Merchant parameters

HTML attributes are untrusted input. Example:

~~~html
<button
  data-ghostpay
  data-amount="500.00"
  data-currency="USD"
  data-token="USDC"
  data-chain="8453"
  data-merchant-id="merchant_public_id">
  Pay with GhostPay
</button>
<script defer src="https://static.example/ghostpay-embed-v1.js"></script>
~~~

Attributes select a draft/payment intent only. The checkout must show a seller-authenticated invoice configuration or a merchant profile signed by a merchant key. Do not treat data-token or data-amount alone as authorization to charge. Amount format is a decimal string with strict precision; chain IDs and token contracts are allowlisted.

### SDK responsibilities

- Zero runtime dependencies; no dynamic code generation or remote script loading.
- Use document.createElement, setAttribute, and textContent. Never interpolate merchant-controlled strings into innerHTML.
- Attach a click handler and create an iframe with a fixed GhostPay origin, restrictive sandbox/allow attributes, title, and loading state.
- Use window.postMessage only with exact expected origin and verify event.source is the expected iframe. Use a random per-instance nonce and strict message schema. Ignore unknown message types and oversized payloads.
- Checkout renders token, network, fiat estimate, crypto amount, stealth destination, fee, and wallet call. User must confirm in wallet.
- Never send merchant page URL, customer data, or invoice plaintext to a GhostPay backend. If a merchant-defined callback is supported, it receives only documented public status/transaction fields.
- Provide an unminified audit build and a pinned version URL; support self-hosting with integrity hashes.

### Iframe and origin policy

- Checkout page CSP uses frame-ancestors allowlist where feasible. A universal open embed policy is a deliberate risk decision.
- Iframe sandbox should omit top-navigation and downloads unless justified. Wallet deep links/popup capabilities must be tested across supported wallets; fail closed when the browser cannot provide safe handoff.
- Do not rely on merchant-provided origin strings as trusted allowlist entries.
- If CSP headers cannot be configured on a host, document a partial fallback and keep the widget as an explicit top-level popup instead of silently weakening policy.

### Integration steps

1. Merchant configures a public merchant profile and supported invoice templates.
2. SDK validates data attributes locally and opens checkout with bounded parameters.
3. Checkout resolves signed merchant profile and shows canonical values.
4. Payer reviews and authorizes through wallet.
5. Checkout sends a minimal completion message containing status and public transaction hash.
6. Merchant site displays completion using text-only DOM updates.

## 2B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| XSS from merchant attributes | Schema validation, strict length/decimal/address parsing, textContent, no innerHTML/eval, CSP. | Merchant controls their own DOM and may alter checkout launch parameters. |
| Malicious iframe/postMessage | Exact origin, expected source window, random nonce, schema validation, no wildcard targetOrigin, message size cap. | Compromised GhostPay checkout origin can still alter transactions. |
| Clickjacking or fake widget | Iframe title/branding, anti-framing policy for checkout except allowlisted hosts, wallet confirmation, transaction preview. | Merchant can draw a fake lookalike button or overlay. |
| Third-party merchant script reads page data | Checkout isolates sensitive fields on GhostPay origin; SDK receives no keys. | Merchant page can observe user interaction, timing, and callback hash. |
| Supply-chain replacement of embed JS | Immutable versioned URL, published hash/signature, SRI where supported, local hosting option. | SRI is ineffective if merchant updates the hash from a compromised release. |
| Malicious merchant profile changes amount/token | Signed config and payer-visible canonical fields; user confirmation; limits and expiry. | Seller signing key compromise or deceptive merchant identity remains. |
| Referrer/data leakage | no-referrer policy on checkout, no analytics, no sensitive query/path values, fragment only where appropriate. | Browser extensions, merchant scripts, and wallet providers remain observers. |

**Release checklist**

- [ ] Fuzz data attributes and message schema.
- [ ] Test malicious parent page, origin mismatch, spoofed message, replayed nonce, iframe close/navigation, and popup failure.
- [ ] Verify no checkout secret enters merchant DOM, logs, or completion callback.
- [ ] Publish SDK hash, supported-host requirements, and CSP examples.

# Feature 3 — Encrypted Milestone Escrows: GhostMilestones

## 3A. Developer-ready technical specification

### Custody and privacy boundary

Escrow holds assets and changes GhostPay from a direct non-custodial payment path into a conditional-custody contract path. The contract must be minimal, independently audited, and optional. Milestone stealth addresses do not hide public escrow deposits, project timing, payer identity, amounts, or release destinations.

The URL fragment can hold a client-side encrypted project manifest. It must not be treated as a private database or as evidence that multiple on-chain stages are uncorrelated.

### Project manifest and state machine

Each milestone has an independent fresh stealth meta-address/derivation context, invoice nonce, amount, chain/token, release condition, deadline, and dispute policy. Generate independent ephemeral scalars per stage. Do not derive a single stable address or event identifier for the project.

Local manifest shape:

~~~ts
export interface MilestoneManifest {
  version: 1;
  projectNonce: Uint8Array;
  chainId: number;
  stages: Array<{
    stageNonce: Uint8Array;
    fiatMinorUnits: bigint;
    token: string;
    stealthMetaAddress: string;
    dueAt: number;
    releasePolicy: "buyer-approval" | "timelock-after-submit";
    disputeWindowSeconds: number;
  }>;
}
~~~

State transitions for one escrow stage:

~~~text
Created -> Funded -> WorkSubmitted -> Released
                         |             -> Refunded
                         -> Disputed -> Resolved
~~~

Define exact authorizations for each transition. Buyer and seller signatures use EIP-712 domain separation with chain, contract, stage nonce, amount, destination, deadline, and current state. No transition trusts a client-side URL alone.

### Contract architecture

- A minimal factory creates a separate stage escrow per milestone or a clone with a unique salt.
- Each escrow tracks token, depositor, one-time recipient, amount, stage nonce, deadline, and status.
- Submit and approve/release are signed actions; time-lock release is opt-in and should occur only after a defined dispute window.
- Explicit dispute resolution is either mutually signed or handled by a chosen arbitration policy. Do not add an undocumented administrator.
- No project ID, shared root hash, repeated deterministic salt, or event field links stages by default.
- Apply token allowlist and SafeERC20; forbid arbitrary call/delegatecall.
- Fee policy and refunds are explicit. A factory/clone deployment pattern may itself create an observer fingerprint.

### UI and integration

- Project builder validates sum of stage amounts and displays fees, token, dates, dispute rules, and custody warnings.
- Encrypt the manifest locally with authenticated encryption and a user-held key; URL link holders can decrypt only if they possess the secret. A fragment containing its own key is a bearer link, not access control.
- The buyer reviews each stage independently. Stage acceptance/release requires wallet signature; no automatic release based only on local client state.
- Sync local manifest status against contract state and block finality. Surface “unknown” when RPC or chain state is unavailable.
- Export a local project backup and test recovery before first escrow deposit.

## 3B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| Custody/contract exploit | Minimal finite-state machine, no arbitrary execution, SafeERC20, reentrancy guard, fuzz/invariant tests, external audit, limited supported tokens. | Escrow necessarily holds funds; immutable bugs and token controls can strand funds. |
| Client-chain desynchronization | Chain state is authoritative; verify contract address, chain ID, nonce, block hash/finality; use idempotent transitions and explicit pending/reorg states. | RPC can censor or delay; local manifest may be lost or stale. |
| Stage correlation heuristics | Independent addresses/nonces, no common project hash on-chain, separate contracts if justified, independent transaction timing and amounts where business allows. | Same payer/seller, escrow factory, shared relayer, same token/amount pattern, timing, and releases remain correlatable. |
| Malicious dispute/signature replay | EIP-712 domain and stage-specific nonce/deadline/state binding; consume nonce on transition; test cross-chain and cross-stage replay. | Key compromise can authorize bad releases within the key’s role. |
| URL manifest tampering or disclosure | Authenticated encryption, schema/version validation, size cap, optional separately conveyed secret, local backup. | Anyone holding a bearer URL may read it; browser extensions/scripts can access fragment. |
| Time-lock griefing | Clear deadlines, bounds on disputes, fallback/refund path, exact state machine, no indefinite lock. | Buyers/sellers can disagree; arbitration introduces additional trust. |
| “Unlinkable milestones” overclaim | User docs describe observable data; evaluate transaction graph in testnet and post-launch telemetry is not collected. | Separate addresses alone do not hide relationships. |

**Release checklist**

- [ ] Formally enumerate every state transition and prove no unauthorized release/refund.
- [ ] Fuzz replay, reentrancy, expiry, dispute, repeated calls, token callbacks, and reorg scenarios.
- [ ] Audit user-visible dispute/escrow copy and supported-token assumptions.
- [ ] Publish a separate escrow audit and deployment manifest before enabling real funds.

# Feature 4 — Encrypted Local Sub-Account Client Tagging

## 4A. Developer-ready technical specification

### Purpose and schema

Allow sellers to label incoming stealth payments locally without writing client names or invoice IDs to chain. Keep all labels in browser storage, encrypted at rest. An IndexedDB record should not contain plaintext client names or plaintext invoice metadata.

Suggested encrypted record:

~~~ts
interface EncryptedTagRecord {
  schemaVersion: 1;
  chainId: number;
  recordId: string;       // random local ID
  lookupKey: Uint8Array;  // keyed HMAC, not raw address/hash
  salt: Uint8Array;
  iv: Uint8Array;         // fresh 96-bit AES-GCM nonce
  ciphertext: ArrayBuffer;
  createdAt: number;
  updatedAt: number;
}
~~~

Plaintext encrypted payload, held only while the user is using the app:

~~~ts
interface TagPayload {
  stealthAddress: string;
  transactionHash: string;
  logIndex: number;
  clientLabel: string;
  invoiceLabel?: string;
  notes?: string;
}
~~~

### Key derivation and local encryption

Use the seller viewing private key as a local input only, with explicit user consent. Convert the validated scalar to fixed-width bytes. Derive a distinct tagging key using HKDF-SHA-256 with a random per-profile salt and domain-separated info string such as GhostPay/local-tags/v1. Import/derive a non-extractable AES-GCM key and a separate HMAC-SHA-256 lookup key. Never use the raw view key directly as an AES key.

- Fresh random 96-bit IV for each encryption under a given AES-GCM key; enforce uniqueness and rotate profile salt/key version if state is uncertain.
- Use authenticated additional data containing schema version and chain ID.
- Store ciphertext, IV, salt, and keyed lookup token only. The HMAC token allows local exact lookup without exposing a raw stealth address in the database.
- IndexedDB is not encrypted by the browser automatically; app-level encryption is mandatory.
- Keep decrypted labels in component memory only while the profile is unlocked. Lock on inactivity and tab close where practical.
- Export only an encrypted archive. Require explicit passphrase or recovery key and validate import/export by round-trip tests.

### Integration steps

1. User unlocks a view-key profile locally.
2. Scanner finds a matching announcement and derives the stealth address.
3. UI prompts user to assign a client/invoice label; no remote call.
4. App encrypts record and writes to IndexedDB.
5. Search derives keyed lookup tokens locally; decrypt only matching records after unlock.
6. User can export an encrypted archive or clear all local tags.

## 4B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| Browser storage theft or profile access | AES-GCM encryption, non-extractable CryptoKey while active, device lock, app inactivity timeout, minimal stored metadata. | Malware, XSS, devtools, browser profile access while unlocked can read plaintext/key material. |
| Accidental local leak | No analytics, crash dumps, sync, plaintext filenames or exports; no tags in URL, DOM attributes, or logs. | Browser backup/forensics may retain IndexedDB ciphertext and application caches. |
| View-key compromise | Domain-separated derived tag key, separate from spend derivation; rotate/re-encrypt tags after compromise. | View key already permits scanning incoming payments; compromise exposes payment history and tags after decryption. |
| AES-GCM nonce reuse | Random 96-bit IV and per-profile key; enforce per-record randomness and never restore a stale RNG state. | Random collision probability is low, not zero; key rotation and record caps reduce exposure. |
| Weak recovery passphrase | Argon2id or scrypt with documented parameters and salt for exported archive; rate limit local guesses where possible. | Offline guessing remains possible; users must choose strong passphrases and protect backups. |
| Tag indexing leaks patterns | HMAC lookup token with secret derived key; random record IDs; avoid deterministic unkeyed hashes. | Repeated HMAC tokens reveal duplicate records within a database; timestamps and record count still leak. |

**Release checklist**

- [ ] Inspect IndexedDB contents and confirm labels/addresses are ciphertext only.
- [ ] Test XSS while locked/unlocked, export, import, wrong password, and key rotation.
- [ ] Verify no plaintext enters browser logs, crash reports, backups, or network requests.
- [ ] Document that encrypted-at-rest storage does not protect an unlocked browser session.

# Feature 5 — Blinded Scanning Protocol / Light Indexing

## 5A. Developer-ready technical specification

### Feasibility boundary

A conventional indexer cannot identify the user’s EIP-5564 matches without either receiving a viewing secret, receiving some match capability that leaks information, or doing additional private computation. EIP-5564 exposes a one-byte view tag in each announcement, but the recipient’s matching tag depends on ECDH with the viewing private key. Sending a query for a matching tag or derived address leaks a capability and can enable correlation.

PIR hides which database record/page a client retrieves, but it does not automatically run the client’s ECDH/view-tag filter on the server. A two-server DPF/PIR design can hide a row index from each individual non-colluding server, but privacy depends on non-collusion and traffic metadata still exists. See [Stanford PIR overview](https://crypto.stanford.edu/pir-library/) and [two-server DPF/PIR reference implementation](https://github.com/facebookresearch/GPU-DPF).

Therefore split the feature into stages:

### Stage 1: Tor-routed light indexer, client-side match checking

- Indexers expose public announcement logs by chain, scheme, and block range. The client sends no viewing key or derived view tag.
- Query through Tor or a user-selected privacy proxy; add coarse fixed-size block windows and randomized request padding.
- Indexer returns raw public event data plus block number/hash and transaction/log indices.
- Client verifies response shape and locally computes EIP-5564 matches in a worker.
- This reduces RPC provider dependence and direct IP exposure to the indexer when Tor is correctly used. It does **not** eliminate log download or CPU scanning.

### Stage 2: Two-server PIR over fixed-size log pages

- Two independently operated servers hold the same immutable, fixed-layout public log database, partitioned into deterministic chain/block shards.
- Client uses a reviewed DPF-PIR implementation to retrieve selected fixed-size pages without either server learning the queried page, assuming the two servers do not collude.
- Client scans retrieved events locally. To hide the exact scan range, query fixed-size padded windows and issue requests on a schedule independent of invoice activity.
- Each response includes a Merkle root/hash manifest tied to finalized block headers. Client verifies page inclusion and chain consistency.
- PIR returns records, not “only my matches”; reducing CPU requires reading all relevant page contents or adding an advanced private-computation protocol.

### Stage 3: Research-only private matching compute

If CPU reduction without disclosing viewing keys is a hard requirement, evaluate a separate multi-party computation or verifiable encrypted-computation design:

- Client secret-shares viewing scalar between at least two independently operated, non-colluding computation services.
- Services jointly compute the ECDH-derived check over public ephemeral keys and return only candidate matches with proofs/consistency checks.
- Protocol must specify curve scalar multiplication in MPC, leakage from match count, malicious-server security, denial-of-service, query batching, versioning, and independent implementation.
- Do not invent a “blinded ECDH token” or send a derived key/tag to one indexer and claim it is private. Do not deploy this stage without formal protocol review and a security proof/audit.

### API shape

~~~ts
export interface PublicLogPageRequest {
  chainId: number;
  fromBlock: bigint;
  toBlock: bigint;
  pageSize: number;
  pageNonce: Uint8Array;
  protocol: "tor-range-v1" | "dpf-pir-v1";
}

export interface VerifiedLogPage {
  chainId: number;
  shardId: string;
  finalizedBlockHash: string;
  records: PublicAnnouncement[];
  inclusionProofs?: Uint8Array[];
  indexerSignature?: Uint8Array; // operator identity only, not proof of completeness
}
~~~

No request field may contain viewing key, spending key, stealth address list, raw view tag, match result, or invoice/client label. For the PIR stage, DPF query shares go to separate endpoints over independent network paths; never send both shares through the same provider/session.

### Correctness and completeness

- Verify each event emitter address, ABI, chain ID, block hash, transaction/log position, and any inclusion proof.
- An indexer signature proves who served a response, not that it is complete or truthful.
- To detect omission/censorship, reconcile page roots and finalized block ranges against an independent header/receipt verifier or multiple providers. Full completeness against a malicious chain-data server requires validating chain commitments, not trusting its API.
- Store only public scan cursors and user-approved local matches. Never upload match outputs.

## 5B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| Malicious indexer injects forged logs | Verify emitter, chain, ABI, block hash, receipt/log inclusion proofs where available; locally recompute EIP-5564 match. | Incorrect/missing proof verifier or chain header trust can still accept bad data. |
| False-positive flooding | Bound page sizes, validate event shape, local view-tag prefilter, work quotas, cancel/resume, independent indexer selection. | Public log spam remains; indexer can degrade availability. |
| Indexer learns viewing key | Never send it; local matching only in stages 1/2. Stage 3 shares secret among non-colluding MPC operators. | Stage 3 privacy fails if the required collusion threshold is reached or protocol leaks. |
| Query pattern correlation | Tor, fixed-size padded windows, schedule decoupled from invoice activity, two-server PIR, independent operators. | Timing/volume can fingerprint the user; Tor exit/network observer may correlate; two PIR servers may collude. |
| Indexer omits matching events | Verify page continuity/finalized roots, compare independent sources, optional local full-node fallback. | Availability/completeness is difficult without verifying all data against consensus commitments. |
| Compromised transport or response | TLS/Tor plus signed manifests, Merkle/inclusion verification, local parsing, strict bounds. | Signatures alone do not prove completeness; indexers can selectively censor. |
| “Blinded query” leaks derived capability | Protocol review before implementing any tag/query token; no raw tag or reusable capability to a single server. | Even a secure query can leak request timing, chain/range, page volume and account use. |

**Release checklist**

- [ ] Stage 1 confirms no view key/tag/match output in requests.
- [ ] Tor tests cover DNS, direct fallback, retries, and endpoint changes.
- [ ] Malicious response injection and omission tests pass.
- [ ] Stage 2 has a reviewed DPF-PIR implementation, independent server operators, fixed-page layout, and non-collusion disclosure.
- [ ] Stage 3 is disabled until formal protocol design and external cryptographic review are complete.
- [ ] User copy distinguishes IP privacy, query privacy, response integrity, and completeness.

# Feature 6 — Announcement Jitter and Timing-Privacy UX

## 6A. Developer-ready technical specification

### Purpose and limit

Offer an optional delay between invoice opening and transaction submission to make immediate timing correlation less deterministic. This is traffic-timing friction, not steganography or cover traffic: it creates no fake transactions and does not hide the eventual public transaction. The wallet must sign only when the user is ready to submit.

Never sign a transaction in advance and leave a raw signed transaction waiting in a browser queue. Never auto-submit after a hidden timer.

### Flow

1. Payer opens and validates invoice. UI offers “Send now” or “Delay up to N minutes.”
2. If delay is chosen, app computes a random due time using crypto.getRandomValues with a configured bounded interval, e.g. 2–15 minutes.
3. UI shows truthful state: “Scheduled locally; no transaction has been signed or sent.” User can cancel or send now.
4. Do not hold a wallet signature, raw transaction, nonce lock, or private key while waiting.
5. At due time, app revalidates invoice expiry, quote freshness, chain, wallet connection, fee bounds, and destination. It shows the final transaction again.
6. User explicitly confirms in wallet. The wallet selects/currently validates nonce and broadcasts using the configured RPC.
7. If tab closes, queue is canceled. Optional local persistence stores only public invoice ID/expiry and due time after user consent; it never stores a signature or key.
8. Use monotonic timer while page is active; handle system sleep, clock changes, tab suspension and service-worker limits. A service worker cannot silently make a wallet sign a transaction.

### Scheduler sketch

~~~ts
interface ScheduledPayment {
  scheduleId: string;
  dueAtEpochMs: number;
  invoiceExpiry: number;
  status: "waiting" | "ready" | "cancelled" | "expired";
}

function randomDelayMs(minMs: number, maxMs: number, cryptoApi: Crypto): number {
  const span = maxMs - minMs + 1;
  const sample = new Uint32Array(1);
  cryptoApi.getRandomValues(sample);
  return minMs + (sample[0] % span);
}
~~~

For unbiased selection, use rejection sampling rather than modulo when span does not divide 2^32. Delay policy is per-payment and visible; do not randomize outside user-selected bounds.

### UI states

- Waiting: “Scheduled locally. Nothing has been signed or broadcast.”
- Ready: “Delay complete. Review updated quote and confirm in wallet.”
- Expired: “Invoice or quote expired. Refresh and review again.”
- Cancelled: no transaction action.
- Submitted: transaction hash and confirmation state.
- Error: wallet/provider/nonce failure with retry path.

“Securing Transmission…” is not recommended because it implies cryptographic protection or covert transmission the feature does not provide.

## 6B. Security and threat assessment

| Threat | Mitigation | Residual risk |
|---|---|---|
| User closes tab before broadcast | Queue is explicitly local and cancel-on-close by default; offer reminder/export rather than background signing. | Payment is abandoned; delayed execution cannot be guaranteed. |
| Stale invoice/price/fee | Revalidate expiry, quote, gas, chain and limits at due time; require fresh wallet confirmation. | Price or network conditions may change after confirmation. |
| Nonce conflicts | Do not reserve nonce before delay; obtain current wallet nonce during final transaction construction; handle replacement/nonce-too-low errors. | Other wallet activity can race after construction. |
| Mempool reordering/MEV | Set min-output/min-net and deadline where contract supports; optional private transaction endpoint is explicitly disclosed. | Public broadcast reveals the transaction; private RPC may still observe/order/censor. |
| Timing correlation persists | Delay selected by user; broad optional window and no link-open telemetry; test correlation against realistic background traffic. | One payment in a quiet time window remains correlatable; amount and transaction sender remain public. |
| Predictable or biased jitter | CSPRNG and rejection sampling; no Math.random; test distribution and bounds. | Delaying one transaction is not a proper anonymity set and does not generate cover traffic. |
| Misleading “steganographic” status | Use honest status text and explain no transaction is signed/sent until confirmation. | Users may still assume the delay hides their identity; in-product explanation required. |

**Release checklist**

- [ ] No wallet signature or private key is stored during the delay.
- [ ] Close/reopen, sleep, clock changes, suspended tab, invoice expiry and cancellation tested.
- [ ] Nonce is re-read at send time and wallet confirmation is mandatory.
- [ ] CSPRNG delay range/distribution is tested; no automatic retries/broadcast.
- [ ] Product language describes timing obfuscation only, not anonymity.

# Implementation order and release gates

1. **First:** Feature 4 local tagging and Feature 2 embed SDK, after data-flow/XSS review; they mainly extend client boundaries.
2. **Next:** Feature 1 gas buffer, only after fee-router and token behavior audit.
3. **Separate product/security scope:** Feature 3 escrow, because it adds custody, disputes and irreversible state.
4. **Research track:** Feature 5 staged indexer/PIR, begin with Tor-routed range indexer and local matching; no view-key matching service without a reviewed protocol.
5. **Optional UX experiment:** Feature 6 jitter, with user-selected delay and explicit final confirmation; measure whether it provides value without misrepresenting privacy.
6. Each feature ships behind an explicit opt-in/feature flag where feasible, has a rollback/disable route for the UI, and includes release notes, supported-chain matrix, monitoring and incident response.

## Reference material

- [EIP-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564) — scheme 1, view-tag placement and parsing.
- [EIP-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538).
- [ERC-4337 Paymaster security and griefing guidance](https://docs.erc4337.io/paymasters/security-and-griefing).
- [Stanford PIR overview](https://crypto.stanford.edu/pir-library/).
- [GPU-DPF: two-server PIR reference code](https://github.com/facebookresearch/GPU-DPF).
- [Ethereum.org privacy roadmap: PIR for private reads](https://ethereum.org/roadmap/privacy/).
- [React DOM and untrusted HTML security](https://react.dev/reference/react-dom/components/common).
- [MDN Referer header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referer).
