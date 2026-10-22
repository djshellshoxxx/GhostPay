# 01 Manifest read-back and authentication

Priority P0 | Effort M (3-5 d) | Owner: chain-adapters + web | Deps: none in-repo; release key (owner) only for the signature half
Sources: gap-analysis s2 item 1; ADR-0007, ADR-0015; DEPLOYMENT_MANIFEST.md; audits S3-01/A-07/G-05.

## 1. Problem
`manifest.ts` fetches an unauthenticated JSON; a swapped manifest redirects the fee recipient, router or announcer. ADR-0015 forbids hosting until manifests are read back from chain.

## 2. Design
New module `packages/chain-adapters/src/readback.ts`:
```ts
export interface ReadbackResult { ok: boolean; checks: ReadbackCheck[] }
export interface ReadbackCheck { name: 'router.FEE_RECIPIENT'|'router.ANNOUNCER'|'router.FEE_BPS'|'router.codehash'|'relayer.codehash'|'announcer.codehash'; expected: string; actual: string; pass: boolean }
export async function verifyManifest(m: DeploymentManifest, rpc: RpcClient[], opts: {requireTwoProviders: boolean}): Promise<ReadbackResult>;
```
Rules:
1. `eth_chainId` of every provider == manifest.chainId.
2. `eth_call` `FEE_RECIPIENT()`, `ANNOUNCER()`, `FEE_BPS()` (must be 25) equal manifest values (case-normalised).
3. `keccak256(eth_getCode)` compared with `bytecodeHashes`. Immutables live in runtime code, so the manifest stores the hash of the deployed code for that deployment (post-immutable) plus the build-time hash with immutable slots zeroed; verifier zeroes slots listed in `immutableRanges` (from solc `immutableReferences`) before comparing the latter.
4. Announcer codehash equals the pinned reference codehash (`EXPECTED_ANNOUNCER_CODEHASH`).
5. With `requireTwoProviders`, two independent RPC endpoints must agree on every value (reuse `requestWithFallbackCheck`).
6. Fail closed: any failure sets `ChainAdapter.payable = false` with a machine code `MANIFEST_READBACK_FAILED`; Pay and relayer start-up refuse. No "continue anyway" control.
7. Result cached per (chainId, block) for 10 min; re-run at Pay preview time (not only app load).
Signature (phase 2, needs owner key): `signature` = Ed25519 over canonical JSON; public key compiled into the bundle; absence is a hard error on mainnet chains, warning on testnets.

## 3. Threats
Hostile RPC lies about code (mitigate: two providers; residual: both colluding). Proxy/CREATE2 tricks (contracts have no delegatecall; reject if code starts with EIP-7702 designator 0xef0100). Replay of an old valid manifest for a superseded router (include `version` and `supersededBy`; UI shows warning). TOCTOU between readback and tx (re-check at preview; calldata assertion already exists in payExec).

## 4. Test plan
Unit with mock RPC: each mismatch kind fails; chainId mismatch; one provider disagrees; immutable zeroing vectors. Anvil test (reuse `apps/relayer/src/harness.testutil.ts`): deploy compiled router, verify pass; deploy router with different recipient, verify fail. Playwright: Pay page shows blocking message when readback mocked to fail.

## 5. Acceptance
- [ ] All six checks implemented with exact-value tests. - [ ] Pay and relayer refuse on any failure. - [ ] No code path pays when readback has not run. - [ ] Docs: DEPLOYMENT_MANIFEST.md s3 updated to describe the shipped checks.
Unverified: exact `immutableReferences` layout per solc 0.8.28 build; confirm from compiler output.
