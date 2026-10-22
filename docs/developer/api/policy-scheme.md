# `@ghostpay/policy-scheme`

Client side of the policy-guarded stealth account, ERC-5564 scheme id `0x47500002` ("GP" + 2).
**Experimental (ADR-0014): not enabled in the app or the relayer, no recovery path, no independent review.**
Source: `packages/policy-scheme/src/`. Depends on `@ghostpay/core-crypto`, `viem`, noble. Contracts side:
[contracts-reference.md](../contracts-reference.md#3-policyaccountfactory-and-policyaccount).

Idea: the *owner* EOA `A_owner` comes from ordinary scheme-1 maths. Funds are sent to the counterfactual clone
`A_acct = CREATE2(factory, keccak256(abi.encode(A_owner, policyHash)), EIP-1167 clone of implementation)`, where
`policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot))`. The account can only ever pay to
`destination`, after `delay`, within per-token window caps.

Note: `npm run build:libs` does not build this package; use `npm run build -w @ghostpay/policy-scheme`.

## Exports

### Constants and types (`types.ts`)

`SCHEME_ID = 0x47500002n`, `MAX_DELAY = 30n*24n*3600n` (30 days), `MIN_DELAY = 3600n` (the factory minimum; the account
alone accepts 1 s), `MAX_UINT256`, `MAX_UINT64`, `ZERO_ADDRESS` (denotes the native coin as a token), `ZERO_HASH`
(`limitsRoot` zero = no limits), types `Address`, `Hex`.

### Policy and addresses (`policy.ts`)

```ts
interface Policy { readonly destination: Address; readonly delaySeconds: bigint; readonly limitsRoot: Hex }
interface PolicyDeployment { readonly factory: Address; readonly implementation: Address }
const CLONE_PREFIX: Hex = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73';   // OpenZeppelin Clones 5.x creation prefix
const CLONE_SUFFIX: Hex = '0x5af43d82803e903d91602b57fd5bf3';

function computePolicyHash(policy: Policy): Hex                              // encoding check only (any uint256 delay)
function validatePolicy(policy: Policy): Policy                              // non-zero destination; MIN_DELAY <= delay <= MAX_DELAY
function accountSalt(owner: Address, policyHash: Hex): Hex                   // keccak256(abi.encode(owner, policyHash))
function cloneInitCodeHash(implementation: Address): Hex
function predictAccountAddress(deployment: PolicyDeployment, owner: Address, policyHash: Hex): Address
function predictAccountAddressFromSalt(deployment: PolicyDeployment, salt: Hex): Address   // what GhostPayPolicyRouter checks
```

`predictAccountAddress` equals `PolicyAccountFactory.predictAddress(owner, policyHash)`; `predictAccountAddressFromSalt`
is the same CREATE2 formula starting from the salt (the router receives only the salt, see below). Pin **both** factory
and implementation per chain (either one changes every account address).

### Limits tree (`limits.ts`)

```ts
interface TokenLimit { readonly token: Address; readonly limit: bigint; readonly windowSeconds: bigint }
interface LimitLeaf extends TokenLimit { readonly leaf: Hex }
interface LimitsTree { readonly root: Hex; readonly leaves: readonly LimitLeaf[]; readonly tree: readonly Hex[] }
interface LimitProof { readonly limit: bigint; readonly windowSeconds: bigint; readonly proof: readonly Hex[] }
interface TokenLimitProof extends LimitProof { readonly leaf: Hex }
const UNLIMITED = MAX_UINT256;

function limitLeafHash(l: TokenLimit): Hex      // keccak256(keccak256(abi.encode(address token, uint256 limit, uint64 windowSeconds)))
function buildLimitsTree(limits: readonly TokenLimit[]): LimitsTree
function getLimitProof(tree: LimitsTree, token: Address): TokenLimitProof
function verifyLimitProof(root: Hex, leaf: Hex, proof: readonly Hex[]): boolean
function noLimitsProof(): TokenLimitProof       // limit 0, window 0, empty proof, leaf ZERO_HASH (for limitsRoot == 0)
```

Layout matches OpenZeppelin `StandardMerkleTree`: leaves sorted by hash, flat array with `tree[0]` the root and leaf
`i` at `tree[tree.length - 1 - i]`, inner nodes `keccak256(sorted pair)`. Stricter than the contract: zero limit,
limited leaf with zero window, and **duplicate tokens** are refused. With a non-zero root a token with no leaf can
never be withdrawn: add an `UNLIMITED` leaf (`limit = MAX_UINT256`, `windowSeconds = 0n`) for every token the account may
receive, including the native coin (`ZERO_ADDRESS`).

### Meta-address (`meta.ts`)

```ts
interface Scheme2MetaAddress { readonly spendingPublicKey: CompressedPoint; readonly viewingPublicKey: CompressedPoint; readonly policyHash: Hex }
const SCHEME2_META_PREFIX = 'st:eth:gp2:0x';
function encodeScheme2MetaAddress(meta: Scheme2MetaAddress): string   // prefix + spend33 + view33 + policyHash32, 209 chars
function decodeScheme2MetaAddress(metaAddress: string): Scheme2MetaAddress
function ownerMetaAddress(meta: Scheme2MetaAddress): string           // plain scheme-1 'st:eth:0x...' of the same keys
```

The `gp2` format is GhostPay-specific and not ratified by any ERC (`DEVIATIONS.md` S1). Never publish
`ownerMetaAddress`: payments to it are plain scheme-1 payments with no policy.

### Derivation and scanning (`derive.ts`)

```ts
interface Scheme2Payment { schemeId: bigint; ownerAddress: Address; accountAddress: Address; ephemeralPublicKey: CompressedPoint;
                           viewTag: Uint8Array; metadataPrefix: Uint8Array; policyHash: Hex }
interface Scheme2Announcement { schemeId?: bigint; stealthAddress: string; ephemeralPublicKey: string; metadata: string }
type Scheme2Check = { matches: false } | { matches: true; ownerAddress: Address; accountAddress: Address; policyHash: Hex }
interface Scheme2OwnerKey { ownerSecret: SecretScalar; ownerAddress: Address; accountAddress: Address; policyHash: Hex }

function deriveScheme2Payment(metaAddress: string, deployment: PolicyDeployment, rng?: RandomSource): Scheme2Payment
function checkScheme2Announcement(announcement: Scheme2Announcement, viewingSecret: SecretScalar, spendingPublicKey: CompressedPoint,
                                  policyHashes: readonly Hex[], deployment: PolicyDeployment): Scheme2Check
function deriveScheme2OwnerKey(announcement: Scheme2Announcement, keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>,
                               spendingPublicKey: CompressedPoint, policyHashes: readonly Hex[], deployment: PolicyDeployment): Scheme2OwnerKey
```

The announcement must use `schemeId = 0x47500002`, `stealthAddress = accountAddress`, the returned ephemeral key and the
view tag as metadata byte 0. `checkScheme2Announcement` accepts several policy hashes (one viewing key can serve several
published policies) and never throws on malformed chain data. `deriveScheme2OwnerKey` throws `NOT_MATCHED` on a miss.

### EIP-712 (`eip712.ts`)

```ts
const POLICY_DOMAIN_NAME = 'GhostPayPolicyAccount'; const POLICY_DOMAIN_VERSION = '1';
const TYPE_STRINGS; const POLICY_TYPES;
const WITHDRAW_TYPEHASH, CANCEL_WITHDRAW_TYPEHASH, PROPOSE_DESTINATION_TYPEHASH, CANCEL_DESTINATION_TYPEHASH: Hex;
interface PolicyDomain { name; version; chainId: number; verifyingContract: Address }      // verifyingContract = the CLONE address
function policyDomain(chainId: number, account: Address): PolicyDomain
function policyDomainSeparator(domain: PolicyDomain): Hex

interface WithdrawParams { chainId: number; account: Address; token: Address; amount: bigint; deadline: bigint; nonce: bigint;
                           limit: { limitsRoot: Hex; proof: TokenLimitProof } | null }
interface ProposeDestinationParams { chainId: number; account: Address; newDestination: Address; deadline: bigint; nonce: bigint }
function buildWithdrawTypedData(p: WithdrawParams): WithdrawTypedData
function buildCancelWithdrawTypedData(chainId: number, account: Address, id: Hex): CancelWithdrawTypedData
function buildProposeDestinationTypedData(p: ProposeDestinationParams): ProposeDestinationTypedData
function buildCancelDestinationTypedData(chainId: number, account: Address, id: Hex): CancelDestinationTypedData
function signPolicyTypedData(td: AnyPolicyTypedData, ownerSecret: SecretScalar, expectedOwner?: Address): Promise<PolicySignature>
// every *TypedData has: domain, types, primaryType, message, structHash (= on-chain request/proposal id), digest
// PolicySignature = { signature: Hex /* 65 bytes r||s||v */, v: 27 | 28, r: Hex, s: Hex }
```

`structHash` of a `Withdraw` equals the request id the contract computes, so pass it to `encodeExecuteWithdraw`/
`encodeCancelWithdraw`. `buildWithdrawTypedData` pre-checks what the contract checks (`amount > 0`, token not the
account, proof verifies against `limitsRoot`, `amount <= limit`) and sets `limitLeafHash` from the proof (audit L-04:
the signature commits to the leaf). The destination is **not** part of a withdraw order. Always pass `expectedOwner`
to `signPolicyTypedData`.

### Calldata (`calldata.ts`, `router.ts`)

```ts
interface CallRequest { readonly to: Address; readonly data: Hex; readonly value: bigint }
function encodeDeployAccount(deployment: PolicyDeployment, owner: Address, policy: Policy): CallRequest & { account: Address; policyHash: Hex }
function encodeRequestWithdraw(td: WithdrawTypedData, proof: LimitProof, signature: PolicySignature | Hex): CallRequest
function encodeExecuteWithdraw(account: Address, id: Hex): CallRequest
function encodeCancelWithdraw(account: Address, id: Hex, signature: PolicySignature | Hex): CallRequest
function encodeProposeDestination(td: ProposeDestinationTypedData, signature: PolicySignature | Hex): CallRequest
function encodeExecuteDestinationChange(account: Address): CallRequest
function encodeCancelDestination(account: Address, id: Hex, signature: PolicySignature | Hex): CallRequest

const POLICY_ROUTER_FEE_BPS = 25n;  const MAX_POLICY_ROUTER_GROSS: bigint;
interface ExpectedPolicyRef { readonly owner: Address; readonly policyHash: Hex }
type PolicyRouterMethod = 'payERC20' | 'payERC20WithPermit' | 'payNative' | 'payERC20WithBuffer'
interface PolicyPaymentInput { router: Address; feeRecipient: Address; deployment: PolicyDeployment;
  payment: Pick<Scheme2Payment, 'ownerAddress' | 'accountAddress' | 'policyHash' | 'ephemeralPublicKey' | 'viewTag'>;
  token: Address | 'native'; gross: bigint; minNet?: bigint; deadline: bigint; now?: bigint;
  permitSignature?: Hex; buffer?: { bufferWei: bigint; maxBufferWei?: bigint } }
interface PolicyPayment { method: PolicyRouterMethod; tx: CallRequest; fee: bigint; net: bigint; metadata: Hex }
function policyRouterFee(gross: bigint): bigint
function buildPolicyPaymentTx(input: PolicyPaymentInput): PolicyPayment
function decodePolicyPaymentCalldata(data: Hex, deployment: PolicyDeployment, expected?: ExpectedPolicyRef): DecodedPolicyPayment
   // { method, stealth, salt, ephemeralPublicKey, metadata }; throws if stealth != predictAccountAddressFromSalt(salt),
   // and, when `expected` is given, if salt != accountSalt(expected.owner, expected.policyHash)
```

The router entry points take the per-payment CREATE2 **salt** (`bytes32`, `keccak256(abi.encode(owner, policyHash))`), not
the owner and policy hash: the seller-constant `policyHash` therefore never appears in router calldata (round-3 audit
N-01). The router cannot see the owner any more, so `buildPolicyPaymentTx` is the only place that checks a non-zero owner;
pass `expected` to `decodePolicyPaymentCalldata` to bind the salt to the payee's owner and policy before a wallet prompt.

`encodeDeployAccount` additionally refuses `owner == destination` and `destination == account` (the contract allows the
former; it defeats the product). With a non-zero factory `FLAT_FEE` the sender must first `approve` the factory for
`FEE_TOKEN`. ABIs: `policyAccountAbi`, `policyAccountFactoryAbi`, `ghostPayPolicyRouterAbi` (generated by
`npm run gen-abi -w @ghostpay/policy-scheme`; regenerated after the N-01 salt change and the factory fee waiver).

### Errors

`PolicySchemeError { code }`: `INVALID_ADDRESS`, `INVALID_HEX`, `INVALID_INPUT`, `INVALID_DELAY`, `INVALID_POLICY`,
`INVALID_LIMIT`, `DUPLICATE_TOKEN`, `EMPTY_TREE`, `UNKNOWN_TOKEN`, `INVALID_PROOF`, `INVALID_META_ADDRESS`,
`INVALID_ANNOUNCEMENT`, `NOT_MATCHED`, `SIGNING_FAILED`. Key errors from core-crypto (`GhostPayCryptoError`) pass through.

## Verified example

Executed against a `tsc` build of `src/` at commit `ab09bad` (the package has no `dist/` in the checkout). Factory/implementation/router
addresses are placeholders.

```ts
import { generateKeySet } from '@ghostpay/core-crypto';
import {
  validatePolicy, computePolicyHash, buildLimitsTree, getLimitProof, UNLIMITED, ZERO_ADDRESS, SCHEME_ID,
  encodeScheme2MetaAddress, deriveScheme2Payment, checkScheme2Announcement, deriveScheme2OwnerKey,
  buildPolicyPaymentTx, decodePolicyPaymentCalldata, accountSalt, encodeDeployAccount,
  buildWithdrawTypedData, signPolicyTypedData, encodeRequestWithdraw, encodeExecuteWithdraw, PolicySchemeError,
} from '@ghostpay/policy-scheme';
import { bytesToHex } from 'viem';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const deployment = { factory: '0x00000000000000000000000000000000000f0001', implementation: '0x00000000000000000000000000000000000f0002' };
const keys = generateKeySet();

const tree = buildLimitsTree([
  { token: USDC, limit: 5_000_000_000n, windowSeconds: 86_400n },       // 5000 USDC per day
  { token: ZERO_ADDRESS, limit: UNLIMITED, windowSeconds: 0n },          // native coin, no cap
]);
const policy = validatePolicy({ destination: '0x00000000000000000000000000000000000000d1', delaySeconds: 86_400n, limitsRoot: tree.root });
const policyHash = computePolicyHash(policy);
const meta = encodeScheme2MetaAddress({ spendingPublicKey: keys.spendingPublicKey, viewingPublicKey: keys.viewingPublicKey, policyHash });
// 'st:eth:gp2:0x02653b...' (209 chars)

// Payer
const pay = deriveScheme2Payment(meta, deployment);            // pay.schemeId === SCHEME_ID
const built = buildPolicyPaymentTx({
  router: '0x00000000000000000000000000000000000f0003', feeRecipient: '0x00000000000000000000000000000000000f0004',
  deployment, payment: pay, token: USDC, gross: 1_000_000n, deadline: 1_900_000_000n,
});
// built.method 'payERC20', fee 2500n, net 997500n, selector 0x95e21466
const dec = decodePolicyPaymentCalldata(built.tx.data, deployment, { owner: pay.ownerAddress, policyHash });
dec.method;                                                       // 'payERC20'
dec.salt === accountSalt(pay.ownerAddress, policyHash);           // true; the policy hash itself is not in built.tx.data

// Seller: scan, recover owner key, deploy, withdraw
const ann = { schemeId: SCHEME_ID, stealthAddress: pay.accountAddress, ephemeralPublicKey: bytesToHex(pay.ephemeralPublicKey), metadata: built.metadata };
const hit = checkScheme2Announcement(ann, keys.viewingSecret, keys.spendingPublicKey, [policyHash], deployment);   // { matches: true, ... }
const owner = deriveScheme2OwnerKey(ann, keys, keys.spendingPublicKey, [policyHash], deployment);
const dep = encodeDeployAccount(deployment, owner.ownerAddress, policy);     // dep.to === factory, selector 0xaffdf337, dep.account === pay.accountAddress

const proof = getLimitProof(tree, USDC);
const td = buildWithdrawTypedData({ chainId: 84532, account: owner.accountAddress, token: USDC, amount: 1_000_000n,
                                    deadline: 1_900_000_000n, nonce: 1n, limit: { limitsRoot: tree.root, proof } });
const sig = await signPolicyTypedData(td, owner.ownerSecret, owner.ownerAddress);
const req = encodeRequestWithdraw(td, proof, sig);            // to = account, selector 0x30d51307 (requestWithdraw)
const exec = encodeExecuteWithdraw(owner.accountAddress, td.structHash);   // after the delay, anyone may send it

try { validatePolicy({ destination: policy.destination, delaySeconds: 10n, limitsRoot: policy.limitsRoot }); }
catch (e) { e instanceof PolicySchemeError; /* code 'INVALID_DELAY', message 'invalid delay: delaySeconds' */ }
```

## Pitfalls

- A payer cannot verify the policy behind `policyHash`; the meta-address must arrive over an authenticated channel.
- A policy the factory rejects (delay outside `[1 h, 30 d]`, zero destination) makes payments to its account
  unrecoverable. Always `validatePolicy` before publishing a meta-address.
- `PolicyAccountFactory.deploy` publishes the full policy pre-image in calldata, so the first deployment of any of a
  seller's accounts reveals the `policyHash` and destination of that meta-address and links every deployed account
  (contracts `DEVIATIONS.md` R10). Undeployed, router-paid accounts stay unlinkable.
- The factory may waive the flat fee (`FeeWaived`) when the fee token refuses a caller who can pay (R11); do not assume a
  fee was collected from the presence of a deployment.
- Key theft is delayed and made visible, not prevented: the thief holds the same key and can request withdrawals to the
  owner's destination. There is no guardian or recovery path (ADR-0014; contracts `DEVIATIONS.md` P-section).
- `A_acct` depends on chain, factory and implementation. Re-deploying either changes every account address.
- Tests (`vectors.test.ts`, `properties.test.ts`, `anvil.test.ts`) and generated vectors: [testing.md](../testing.md).
  Deviations S1-S6: `packages/policy-scheme/DEVIATIONS.md`.
