# ERC-20 Pages browser payment and recovery qualification

## Source and status

This is a separate browser qualification lane prompted by #751's 41 passing ERC-20
Anvil/Vitest checks. Those checks did not exercise the rendered browser journey.
The candidate at `48254ae02edad512ee37ae072fa4215c947fceb8` remains untouched and is
not a dependency or an integration target of this change.

The task began on main `c9177f57bc7293fa7a461cfc663c38cc7fe63bf2`. During verification,
#744 merged as `a7f9abf80f2c9aee9b7d130a9bbc3af1b8131053`. That main update was merged
without changing its runtime code, workspace libraries were rebuilt, and both
complete ERC-20 modes were rerun on local composition
`d3687dcb32ffcb4549a2d67ae6eba2b37adb8262`.

**Local result: 8/8 approval cases and 8/8 permit cases passed, with zero skips,
retries, unexpected failures or flaky results.** These runs used Playwright 1.64.1
with an isolated Chromium 158.0.8127.0 executable. The standard Playwright CDN
download returned HTTP 403 in the local environment. The fallback browser and its
installer are outside the repository; no dependency or lockfile changed.

The dedicated workflow runs the same eight cases in each of six combinations:
plain/permit tokens with Playwright-managed Chromium, Firefox and WebKit. Hosted
results must be read on the actual PR head; local Chromium evidence is not a pass
claim for the managed Chromium build or either other engine. This handoff records
the local checkpoint, not an unobserved CI, release or deployment result.

## Implemented journey

The primary test uses the actual lean Pages artifact under `/GhostPay/`, checks its
served bytes against `SHA256SUMS`, and verifies its build identity. Ordinary UI
controls drive every payment and recovery operation; application helpers do not
manufacture the invoice, scan results, receipt, recovered session or sweep.

1. Generate seller keys, download the encrypted seller keystore, reopen that
   actual file, and satisfy the backup verification gate. Save an encrypted local
   vault and register a signed 100-USDC invoice for explicit reconciliation.
2. Open the invoice in a separate payer profile. Manually approve the real wallet
   disclosure for account access. Permit mode discloses and signs the exact
   typed-data request during preparation; plain mode uses an exact approval.
3. Check the final preview and provider silence before confirmation. For plain
   mode, mine the token approval and verify its allowance before a separate payment
   disclosure. Submit exactly one router payment.
4. Independently read the transaction, decoded calldata, receipt and announcement.
   Assert `100000000` gross, `250000` fee and `99750000` net base units, zero native
   payment value, zero residual router token balance and zero residual allowance.
   Permit mode additionally consumes exactly one permit nonce.
5. Run the actual scanner Worker. The payment is pending below the configured
   confirmation depth and cannot produce a verified receipt. Mine 101 blocks,
   rescan, explicitly confirm the proposed invoice match, then consent to signing
   an invoice-bound seller receipt. Rescanning does not duplicate the observation.
6. Close both original browser contexts while the original token payment remains
   unspent. Open a fresh context with no copied storage and no preconfigured RPC.
   Refuse a wrong passphrase and modified backup without network activity or a
   loaded seller identity. Import the original downloaded keystore successfully.
7. Configure the RPC through Settings. Recover the same original payment by
   scanning. Invoice/reconciliation history is not treated as part of the seller
   keystore. Enter Sweep through the existing UI and approve its RPC disclosure.
8. Refuse the sweep with zero native gas, without a raw broadcast. Send a real
   local native top-up, then sign and broadcast one ERC-20 `transfer` to the
   chosen destination. Recover the sender from the signed transaction, verify its
   nonce, token recipient, destination, amount, receipt and balance changes, and
   refuse a second sweep of the emptied stealth address.

The primary journey never waives backup verification. Focused payer-only boundary
fixtures use the existing explicit UI backup waiver to obtain an invoice; they do
not stand in for the complete recovery case.

## Seven interruption cases per mode

| Browser event | Required evidence |
| --- | --- |
| Cancel the payment disclosure | No payment provider request or transfer; an already mined exact approval remains visible and its allowance remains; a permit signature is not a payment or consumed permit nonce. |
| Pending payment, real reload, second tab | Durable attempt survives reload while its hash is hidden until wallet reconnection; explicit RPC check reports pending; the same invoice in a second tab of the same profile produces no extra signature, provider send or broadcast. The plain allowance remains available during this check, so allowance failure cannot impersonate journal protection. |
| Wallet broadcasts but loses its response | Chain oracle observes one payment; UI and durable journal retain unknown outcome with no invented hash. A retry actually performs a new RPC simulation, preserves uncertainty and produces no second wallet broadcast. |
| Account changes with payment disclosure open | Disclosure closes, prepared authority is invalidated, and no stale signature or payment is requested. Previously confirmed approval remains. |
| Network changes with payment disclosure open | Same refusal and authority invalidation, with unchanged token balances and permit nonce. |
| RPC outage | Review blocks before account access, signature or send; no journal entry is created. The same invoice can reconnect after the endpoint returns. |
| Initial approval/signature rejected | No payment, broadcast or token debit; allowance stays zero and no successful typed signature is recorded. |

No case is marked skipped or expected to fail. Transaction-request counts and
successful broadcast/signature counts are separate observations.

## Fixture and scope boundaries

`devnet/erc20.ts` installs the repository's existing `MockERC20` or `PermitToken`
runtime at the already allowlisted Base Sepolia USDC/EURC addresses only on the
disposable loopback Anvil process. Before mutations it verifies loopback transport,
Anvil identity and chain 84532. Constructor immutables, six decimals, token metadata
and the permit domain are checked. Reusing another mode or a different token
runtime fails. Each test restores its own chain snapshot and browser contexts.

The EIP-6963 wallet fixture signs through public unlocked local Anvil accounts. It
does not contain private keys, auto-approve disclosures or replace product state.
Its bounded controls emit actual account/network events, reject a request, pause
one request or lose a response after a real local broadcast.

Production contracts, token allowlists, approved network scope, application code
and dependencies are unchanged relative to the incorporated main. The existing
native runner, manifest helper, `devnet/{chain,pages,ui}.ts`, native Pages spec and
Pages workflow remain unchanged. All ten stopped products remain excluded; the
lean build verifier reported 377 rendered modules and 17 site files with no
stopped-product or `FUTURE` module.

This is not qualification of issuer deployments, real wallets/extensions, physical
devices, public RPCs, Tor Browser, production L1 fees or public-chain finality.
The local OP fee oracle deliberately returns zero. A fresh browser context proves
storage isolation and key-file recovery within this harness, not every real device
or browser extension combination. No release or deployment is performed here.

## Reproduction and CI

Use the existing repository-pinned Node, Foundry and solc versions. Install
dependencies, build workspace libraries and contracts, and install the required
Playwright engines before running the dedicated journey:

```bash
npm ci --ignore-scripts
npm run build:libs
(cd packages/contracts && forge build)
./node_modules/.bin/playwright install --with-deps chromium firefox webkit

GHOSTPAY_PAGES_ERC20=plain GHOSTPAY_PAGES_BROWSER=chromium \
  BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh

GHOSTPAY_PAGES_ERC20=permit GHOSTPAY_PAGES_BROWSER=chromium \
  BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh
```

Repeat each mode with `GHOSTPAY_PAGES_BROWSER=firefox` and `webkit` for the full
matrix. Each runner invocation creates its own Anvil, signed test manifest and
Pages artifact. Leaving `GHOSTPAY_PAGES_ERC20` unset retains the native Pages suite.
The ordinary mocked browser suite excludes both new real-chain specs. Invalid
mode/engine settings fail configuration; Firefox/WebKit never inherit Chromium
arguments or executable paths.

The nondeploying workflow has read-only repository permissions, pinned actions,
fresh library/contract builds, no dependency/build caches, one browser worker and
zero retries. Its collector fails if either spec is missing, any test is skipped,
expected to fail or retried, a result is not passed, source/build identity changes,
or the public evidence schema is invalid.

Only `qualification.json` is retained. It records checkout and PR-head identity,
artifact hashes, case outcomes, actual engine/Playwright versions and strictly
validated public payment/funding/sweep facts. Raw reports, logs, downloads, browser
profiles, screenshots, traces, keys and passphrases are excluded and cleaned up.

## Local verification checkpoint

| Check | Actual result at the local checkpoint |
| --- | --- |
| Existing libraries rebuilt after main update | Pass |
| Full web TypeScript check through real Pages builds | Pass |
| Focused ESLint on all four new TypeScript files | Pass |
| Plain browser journey and seven boundary cases | 8 passed, 0 skipped/retried; 51.4 seconds including build |
| Permit browser journey and seven boundary cases | 8 passed, 0 skipped/retried; 50.0 seconds including build |
| Workflow structure/regression tests | 6 passed, 0 skipped |
| Action pin checker | 120 references passed |
| Committed-secret scan and whitespace check | Pass |
| Independent source review | No blocking findings; no additional runtime pass claimed |
| Real qualification collector, not only synthetic inputs | Accepted local reports and public attachment without changing their identities |

Artifact identities for `d3687dcb32ffcb4549a2d67ae6eba2b37adb8262`:

| Mode | SHA-256 of `SHA256SUMS` | Manifest digest |
| --- | --- | --- |
| Plain | `38e175f83b073ac9b6a89b17ac28a75fc08654e448599bbd1e24adcde18db3e0` | `684a2bef1aa9ce425521ec1c6f21c9112102fc94f71348f6e8e0173e0086cf39` |
| Permit | `f328a1a9e3b18ca53acb056094c0c29a394072896164a749f22408cae40e42db` | `f7ef71534ef6fb53873939e4b1a38386908f63bd24d1fea0f32efd817b4c1c53` |

The code checkpoint precedes this documentation commit. The published candidate's
tree must match the reviewed local source, and its own hosted checks must qualify
that published commit. Recheck main, active ownership and the integration lease
before any merge. This handoff does not acquire the lease or release other workers'
claims.
