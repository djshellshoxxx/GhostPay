# GhostPay Supplementary Planning, Security, QA, and Feature Expansion Playbook

**Status:** Operational standard for development and release readiness.  
**Research checked:** 2026-10-21. Recheck tool versions and upstream security guidance whenever workflows or dependencies change.

This playbook supplements the [Master Blueprint](MASTER_BLUEPRINT.md) and [Developer Specification](DEVELOPER_SPECIFICATION.md). Passing tests are not a security audit, and an audit does not prove absolute privacy.

## Operating rules

- Production release changes require a reviewed pull request, passing checks, and release-owner sign-off.
- Pull request jobs from forks are untrusted: do not expose RPC keys, IPFS credentials, SSH keys, deployer keys, or paymaster secrets.
- Mainnet deployments, contract verification, production IPFS pinning, ENS updates, and onion mirror publication are separate protected release actions.
- Scope every privacy claim to a named attacker and observable data. Avoid unqualified guarantees such as “untraceable,” “anonymous,” “zero-knowledge,” or “serverless.”
- Every new external provider, token, chain, contract, wallet flow, or network transport requires a threat-model update and user-facing documentation.
- Feature proposals follow Section 4: complete specification first, then feature-specific security review before implementation; repeat the security review after implementation.

# Section 1: Supplementary planning and DevOps specifications

## 1. Automated testing and fuzzing suite

### Test layers and evidence gates

| Layer | Tooling | Required checks | Gate |
|---|---|---|---|
| Solidity unit | Foundry; Hardhat optional for deployment scripts | EIP-5564 ABI compatibility, fee arithmetic/rounding, token transfers, expiry, replay, unsupported token behavior, reentrancy | Every public function has positive and negative tests |
| Solidity stateful fuzz | Foundry invariants and Echidna | Arbitrary callers, token values/decimals, repeated invoices, reentrancy/malicious callbacks, fee/router invariants | Save minimized failure corpus; no unexplained failures |
| Crypto unit/property | Vitest | secp256k1 validation, shared-secret encoding, view-tag byte, stealth address, secret recovery against published vectors | Byte-for-byte match to canonical vectors |
| UI/integration | Vitest, Testing Library, Playwright | fragment parser, malicious inputs, wallet preview, chain switching, RPC errors, worker cancellation, state reset | No transaction mismatch or unexpected egress |
| Deployment | Foundry scripts and testnet smoke tests | chain ID, announcer code/address, router config, token behavior, event decode, reorg/finality | Deployment manifest and verified addresses |
| Supply chain | npm audit/equivalent, lockfile review, SBOM, GitHub dependency review | vulnerable/transitive dependency changes, package provenance, artifact reproducibility | Critical/high findings triaged; no ignored critical issue |

Foundry invariant tests use the invariant_ prefix; use handler contracts and target selectors so fuzz campaigns exercise valid state transitions. See [Foundry invariant testing](https://getfoundry.sh/forge/invariant-testing). Echidna supports property and stateful campaigns; see [Echidna](https://github.com/crytic/echidna). Slither supports CI integration; see [Slither](https://github.com/crytic/slither).

### Contract properties

- **Fee conservation:** for supported standard ERC-20s, gross equals fee plus net; fee is floor(gross × 25 / 10,000); transfers cannot exceed gross.
- **Atomicity:** if fee transfer, net transfer, or announcement fails, the whole transaction reverts.
- **No custody:** after a successful call the router does not retain settlement tokens; document accidental-transfer behavior.
- **Recipient integrity:** emitted stealth destination equals the address that receives net tokens.
- **Announcement format:** correct scheme ID, valid ephemeral key, metadata begins with the view tag, and standard event signature/indexing is unchanged.
- **Replay policy:** if invoices are single-use, consume each nonce once. If repeat payments are allowed, specify that behavior.
- **No admin mutation:** immutable configuration cannot change; any upgrade authority is explicitly modeled and tested.

Test tokens should include standard bool return, no return, false return, fee-on-transfer, rebasing, malicious callback/reentrancy, blacklist/pause, arbitrary token, and extreme decimals. Reject token behaviors without tests.

### Crypto test plan

- Use published EIP-5564/reference vectors for every derived output. Record vector source and version.
- Deterministic tests inject a test-only RNG; production uses Web Crypto CSPRNG.
- Verify key bounds, point parsing, ECDH symmetry, point serialization, hash-to-scalar behavior, view-tag byte, public-key addition, EVM address conversion, and stealth secret addition modulo curve order.
- Differential-test against an independent implementation. Never adapt expected vectors to fit the implementation.
- Negative cases include malformed prefix, wrong scheme/chain, invalid point, out-of-range scalar, truncated metadata, wrong tag, malformed address, endian/leading-zero errors, corrupted ciphertext/AAD, duplicate JSON fields, and oversized fragments.
- Assert no secret appears in worker messages, errors, console output, analytics, localStorage, IndexedDB, network requests, or test snapshots.

### Vitest configuration sketch

~~~ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    testTimeout: 10_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/core-crypto/src/**", "packages/invoice-schema/src/**"],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 }
    }
  }
});
~~~

Use Jest only if the workspace already standardizes on it. Coverage thresholds reveal untested branches; they do not establish cryptographic correctness.

### Testnet smoke tests

- Run on Sepolia and Base Sepolia only after confirming test deployment addresses and supported test tokens.
- Validate chain ID before signing; do not infer chain solely from RPC URL.
- Test a direct ERC-5564 announcement and optional router settlement; compare receipt, recipient, token amount, and metadata.
- Simulate stale/malformed quotes, provider log caps, RPC chain mismatch, missing bytecode, token reverts, replacement transactions, and reorg handling.
- Testnet smoke tests never authorize or trigger a mainnet deployment.

## 2. CI/CD pipeline and deployment automation

### Stages

1. **Pull request:** formatting, typecheck, ESLint, Vitest, Foundry unit/fuzz, Slither, secret scan, build. No deployment secrets.
2. **Nightly/deep:** longer Echidna, Mythril symbolic analysis, browser tests, fork tests, mutation testing, dependency audit, reproducibility check.
3. **Testnet deployment:** manually dispatched or protected branch only, dedicated low-fund Sepolia/Base Sepolia keys, chain allowlist, protected environment.
4. **Release candidate:** signed tag, clean build, SBOM and hashes, testnet smoke, artifact/dependency review.
5. **Static publication:** protected environment pins release build to IPFS via Pinata/Fleek or a self-hosted pinning provider; record CID and checksum. ENS update is a separate gated action.
6. **Tor mirror:** publish the exact same static artifact to a controlled onion service using an isolated self-hosted runner or deployment host. Never give SSH credentials to an untrusted PR job.
7. **Mainnet:** separate deployment authorization, independent contract review, verified source/bytecode, release manifest, and incident procedure. Immutable contract rollback means routing users to a migration/replacement, not reversing chain state.

GitHub recommends pinning Actions to full commit SHAs and minimizing token permissions. Use contents: read by default, narrowly scoped write only for publishing, and never execute untrusted code with secrets through pull_request_target. See [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

### Workflow blueprint

Template only: replace every placeholder action ref with a reviewed full 40-character SHA and pin tool versions. Configure testnet, ipfs-publish, tor-publish, and mainnet-release as protected GitHub Environments.

~~~yaml
name: GhostPay CI
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 4 * * 2"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<REVIEWED_FULL_SHA>
      - uses: actions/setup-node@<REVIEWED_FULL_SHA>
        with:
          node-version: "PINNED_LTS"
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build

  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<REVIEWED_FULL_SHA>
      - uses: foundry-rs/foundry-toolchain@<REVIEWED_FULL_SHA>
      - run: forge fmt --check
      - run: forge test -vvv
      - run: forge test --fuzz-runs 10000
      - run: forge build --sizes
      - run: slither . --fail-high

  testnet-smoke:
    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
    environment: testnet
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<REVIEWED_FULL_SHA>
      - run: ./scripts/validate-chain-config.sh
      - run: forge script script/SmokeSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast
        env:
          SEPOLIA_RPC_URL: ${{ secrets.SEPOLIA_RPC_URL }}
          DEPLOYER_KEY: ${{ secrets.TESTNET_DEPLOYER_KEY }}

  publish-static:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [quality, contracts]
    environment: ipfs-publish
    permissions:
      contents: read
      id-token: write
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<REVIEWED_FULL_SHA>
      - run: npm ci && npm run build
      - run: ./scripts/verify-release-artifact.sh
      - run: ./scripts/pin-ipfs.sh dist/
        env:
          PINNING_TOKEN: ${{ secrets.PINNING_TOKEN }}

  publish-tor:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [publish-static]
    environment: tor-publish
    runs-on: [self-hosted, ghostpay-deploy]
    steps:
      - uses: actions/checkout@<REVIEWED_FULL_SHA>
      - run: ./scripts/verify-release-artifact.sh
      - run: ./scripts/deploy-onion-static.sh dist/
        env:
          ONION_DEPLOY_KEY: ${{ secrets.ONION_DEPLOY_KEY }}
~~~

Security notes:

- Do not use mutable action tags in the final workflow. Replace placeholders with verified full SHAs and keep a version comment.
- Do not write secret values to shell command lines, artifacts, summaries, debug output, or set -x logs. Scope each secret to one protected job.
- Prefer ephemeral runners for privileged publishing. A persistent onion runner must be isolated, patched, restricted to trusted refs, and wiped/reimaged.
- Pinning tokens should only grant write scope to the correct project; use short-lived OIDC credentials if supported.
- Tor job publishes the release artifact, not PR source. Compare artifact hashes before and after transfer.
- GitHub Pages may not provide arbitrary response headers. Test CSP/referrer behavior on every host. If a host cannot set required headers, document the limitation and treat a meta CSP only as a partial fallback. See [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https) and [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).

### Release manifest

Each release records signed tag/commit, compiler and tool versions, lockfile digest, SBOM, artifact SHA-256 and IPFS CID, onion artifact hash, chain IDs, announcer/router addresses, deployment transactions, source verification, supported token/oracle matrix, test/fuzz/static-analysis/audit summaries, known limitations, and signing-key verification instructions.

## 3. User documentation and operational manual

Maintain task-focused docs in docs/user and docs/operators; use synthetic examples only.

### “Set up a Stealth Meta-Address”

- Explain spending key vs viewing key, compromise impact, local CSPRNG generation, public meta-address and scheme.
- Explain EIP-6538 registration is public and may associate an identifier with the meta-address.
- Document backup/recovery test on testnet and why keys must not go in support tickets.
- Explain viewing-only scanning and spend authorization where supported.

### “Review and pay an invoice”

- Show chain, token contract, fiat estimate, quote time, expiry, slippage, fee, final destination, wallet transaction, and public data.
- Explain URL fragments are visible to page scripts, extensions, and anyone with the invoice link despite being omitted from normal HTTP requests.
- Explain signatures authenticate key control, not identity or invoice legitimacy.

### “Sweep funds and understand gas privacy”

- Explain that direct ETH funding can associate a stealth address with its funder.
- Explain supported token authorization relay, token limitations, relay fee, expiry, network fees, and public-chain visibility.
- State gasless does not mean unlinkable; show source/destination visibility before confirmation.
- Include recovery for unavailable relay, expired authorization, consumed nonce, and unsupported token.

### “Host a GhostPay mirror”

- Build from signed tag; verify commit signature, artifact hash, and lockfile.
- Serve static files with secure headers, no analytics, no mutable third-party scripts, correct MIME types.
- Document optional IPFS and onion hosting, CID/hash publication, update and key-rotation procedure, compromise response, cache purge, and incident notice.
- Explain mirrors can serve altered JavaScript unless users verify signed reproducible artifacts.

### “Run a local scanner/RPC”

- Document supported clients, chain setup, archive/log range limits, reorgs, pruning, freshness, and local storage.
- Verify viewing keys never appear in RPC requests.
- Explain provider fallback and independent log reconciliation.
- State retention policy for public chain data and local scan cursor.

# Section 2: Post-development security assessment specification

## 1. Module-by-module review plan

Each review records commit, scope, architecture/data-flow diagram, assumptions, findings with severity/evidence, reproduction steps, owner, retest, and residual risk.

### Smart contracts and deployment

- Confirm compiler, optimizer, EVM version, dependency commits.
- Compare announcer ABI/event to EIP-5564; view tag remains metadata byte zero.
- Review fee math, token decimals/semantics, SafeERC20, reentrancy, atomicity, approval/permit, replay/nonce/expiry, access control, immutable addresses, accidental custody.
- Test malicious callbacks, false/no return, reverts, blacklist/pause, arbitrary token, zero/max values, rounding, fee recipient edge cases.
- Review router failure atomicity, paymaster deposit/stake, deterministic validation, sponsorship binding, gas caps, nonce races, postOp, EntryPoint version.
- Review deployment chain ID, deterministic addresses, constructor arguments, bytecode verification, address book, secret handling, and no mainnet broadcast from ordinary CI.

### Core crypto engine

- Confirm scheme 1 point encoding/hash/scalar rules against canonical EIP/reference vectors.
- Review CSPRNG, scalar reduction/rejection sampling, point validation/infinity, byte order, domain separation, EVM address conversion.
- Review secret lifecycle, serialization ban, error redaction, worker transfer and persistence; do not promise guaranteed JavaScript zeroization.
- Test false view-tag positives, malformed logs, adversarial event volume, duplicate/reorg logs, differential implementation.
- Check dependency versions, provenance, build output, and upgrade diffs.

### UI, fragment parser, and browser bundle

- Fuzz fragment parser; enforce decoded byte and nesting limits; reject invalid Unicode, duplicate fields, unknown critical versions, noncanonical numbers, unsafe URLs.
- Search for innerHTML, dangerouslySetInnerHTML, eval, new Function, dynamic script injection, untrusted markdown, debug logging, and full URL telemetry.
- Confirm fragment never reaches query/path, analytics, console, localStorage, IndexedDB, support dump, network, referrer report, or service-worker cache.
- Verify CSP, Referrer-Policy, iframe restrictions, permissions, origin isolation, no third-party scripts, and headers on every mirror.
- Simulate malicious RPC responses: forged/omitted/duplicate/old logs, wrong chain, wrong emitter, truncated ranges, malicious token metadata. Verify event emitter and chain.
- Compare wallet preview to final calldata; verify chain, token, destination, amount, fee, expiry, router and announcer.
- Test XSS strings in line items, seller fields, token symbols, RPC errors, QR content, imported metadata; inspect history, tab restore, clipboard, crash restore, and service worker behavior.

### Relayer, bundler, and paymaster

- Treat endpoint as hostile; inspect schemas and redact logs.
- Fuzz authorization signatures, chain IDs, paymaster data, malformed UserOps, huge calldata, gas caps, fee caps, nonce races.
- Attempt replay across chains, EntryPoints, tokens, accounts, destinations, and expiry windows.
- Attempt front-run, replace/cancel race, bundle reorder, censorship, stale quote, callData mutation, gas griefing, timeouts, simulation mismatch, and postOp failure.
- Monitor deposits, quotas, stake, gas charged, failure rates, sponsored account concentration, and withdrawal delays.
- Document what relay sees: IP, signed authorization, source/destination, amount, token, timing, RPC choice.
- Ensure fallback never silently asks users to fund from a known wallet.

## 2. Whole-system threat modeling

Maintain data-flow/trust-boundary diagrams across invoice link, browser, wallet, RPC, chain logs, price source, bundler/paymaster, Tor, IPFS/ENS, and deployment CI.

Review systemic failure modes:

- **Compromised frontend:** one malicious build can read keys and change calls; verify signed artifacts and independent mirror comparison.
- **Dependency/action compromise:** crypto package, wallet library, build plugin, GitHub Action, or host can compromise all mirrors; pin versions, SHA-pin Actions, sign builds, produce SBOM, review lockfile changes.
- **Key correlation:** reused meta-address, derivation bug, view-key exposure, or registry entry can deanonymize invoices; define rotation/recovery.
- **Metadata joins:** RPC timing + invoice channel + exact amount + announcement + sweep + ENS + fee path may correlate activity across layers.
- **Oracle/settlement:** stale/manipulated quote, reorg, token quirks, or router bug can mischarge or strand funds.
- **Economic attacks:** fee rounding, dust spam, fake invoices, announcement spam, paymaster drain, relay censorship, token blacklist, MEV ordering.
- **Availability/censorship:** host, gateway, pinning provider, DNS/ENS, onion host, RPC, bundler, token may fail/censor; define fallback and status.
- **Privacy claim drift:** new API, analytics, indexer, cloud build or customer support upload changes trust model; require privacy review.
- **Immutable contract defect:** cannot patch; define migration and warning procedure.

Deliver an updated STRIDE/LINDDUN-style (or equivalent) actor/data-flow model, observer table, attack trees for high-impact assets, and review after material architecture change.

## 3. Penetration-test checklist

Use authorized staging/testnets, synthetic accounts/invoices, and controlled RPC endpoints.

### Client and data flow

- [ ] Inspect browser requests from load through scan/payment; no keys or plaintext invoice data leave client.
- [ ] Fuzz fragment with malformed base64url, oversize payload, nested JSON, invalid Unicode, prototype keys, XSS, unsafe links.
- [ ] Attempt DOM clobbering, XSS, malicious labels, QR injection, service-worker cache poisoning.
- [ ] Replace bundle at each mirror in a controlled test; verify signed hash warnings.
- [ ] Test browser history/tab restore, clipboard leak, extension assumptions, crash telemetry.
- [ ] Verify Referrer behavior and no-referrer policy; test requests and navigations.
- [ ] Test worker cancellation, rejection, memory pressure, bad message, timeout and RPC flood.

### RPC, chain, and MEV

- [ ] Malicious RPC fixture returns wrong chain, forged/invalid/omitted/duplicate logs, delayed data, stale block, fabricated token metadata.
- [ ] Verify emitter, chain, block hash/finality and ABI before trusting any match.
- [ ] Simulate reorg after payment/sweep; UI status must recover safely.
- [ ] Attempt router reentrancy, malicious callbacks, permit/invoice nonce replay, replacement.
- [ ] Simulate public mempool fee-router payment and test minimum net amount, deadline, sandwich/reordering.
- [ ] Test UserOp replay, paymaster drain, bundle griefing, front-run, stale sponsorship, calldata mutation, cross-chain replay and postOp failure.
- [ ] Run timing/amount correlation on synthetic activity; document residual correlation.
- [ ] Test Tor/RPC fallback and measure IP/DNS leakage with controlled endpoints, including wallet RPC traffic.

### Domain, hosting, and operations

- [ ] Simulate DNS hijack and incorrect ENS pointer; verify signature/CID procedure.
- [ ] Compare GitHub Pages, IPFS gateway/direct IPFS, and onion bundle hashes.
- [ ] Attempt publish from fork PR, tag spoof, branch push, poisoned artifact, compromised action ref/cache.
- [ ] Confirm publish credentials inaccessible to PR jobs and environment approval enforced.
- [ ] Test onion compromise recovery, key rotation, mirror publication and cache invalidation.
- [ ] Review retention at GitHub, RPC, paymaster, pinning, and onion services.

Each test records setup, exact commands/browser version, expected/actual result, evidence, severity, and retest. Remove test keys/synthetic data from artifacts.

# Section 3: Code review and bug hunting specification

## 1. Automated analysis

### Solidity

- **Slither:** pinned version, every PR, fail on high/critical; suppressions require local rationale and review date.
- **Foundry:** unit, fuzz, invariant, fork, gas snapshot, regression corpus.
- **Echidna:** nightly stateful campaigns with handler and explicit properties; save/replay crash corpus.
- **Mythril:** bounded symbolic analysis on supported targets in nightly/release-candidate jobs; review findings manually. Mythril is not a proof or substitute for fuzzing. See [Mythril](https://github.com/ConsensysDiligence/mythril).
- Treat compiler warnings as errors unless justified; record analyzer version, command and disposition for each finding.

### TypeScript/browser

- ESLint with type-checked typescript-eslint recommended rules; enforce promise handling, no unsafe HTML, restricted eval/dynamic code.
- eslint-plugin-security is supplemental heuristics, not certification.
- Run Vitest, Playwright, dependency/lockfile review, secret scan, bundle endpoint scan, CSP/referrer tests.
- SonarQube/SonarCloud may supplement defect/maintainability checks; version quality gates and triage findings.

### Local command examples

~~~bash
forge fmt --check
forge test -vvv
forge test --fuzz-runs 10000
forge test --match-test invariant_ -vvv
forge build --sizes
slither . --fail-high
echidna . --contract RouterEchidnaHarness --config echidna.yaml
myth analyze contracts/GhostPayPaymentRouter.sol --solc-json mythril-solc.json
npm ci
npm run typecheck
npm run lint
npm run test -- --run
npm run test:e2e
npm run build
~~~

## 2. Manual review protocol

Reviewers inspect full call/data flow; a spec-only or code-only review is insufficient for crypto/payment changes.

### Contract checklist

- [ ] No unchecked arithmetic without proof; fee multiplication safe and rounding documented.
- [ ] Token return values handled safely; unsupported semantics rejected.
- [ ] Reentrancy/callback considered at each external call; state ordering correct.
- [ ] No hidden admin, rescue, pause, upgrade, fee-change, arbitrary-call, or delegatecall path.
- [ ] Immutable configuration matches deployment manifest.
- [ ] Signature domain includes chain, contract, nonce, deadline and calldata binding.
- [ ] Announcer ABI/metadata match EIP-5564.
- [ ] No PII, plaintext invoice details, or stable invoice ID emitted unintentionally.
- [ ] Reverts are atomic and no assets strand.
- [ ] NatSpec covers every public contract, function, event, error, parameter and return.

### Crypto and worker checklist

- [ ] No hand-rolled crypto, modulo bias, invalid point acceptance, ambiguous encoding.
- [ ] Scheme/hash/serialization behavior has vector provenance.
- [ ] Secrets do not enter JSON logs, exception strings, analytics or traces.
- [ ] Async worker promises handled; worker error, messageerror, termination, cancel and timeout are handled.
- [ ] Canceled scans cannot publish stale matches or overwrite newer cursors.
- [ ] Worker is not treated as sandbox; CSP and code integrity still apply.
- [ ] Memory clearing is best effort. JS strings are immutable and GC copies may remain; avoid stringifying secret bytes and never promise guaranteed wiping.
- [ ] No keys in localStorage, IndexedDB, URL, DOM attributes, persisted UI state or snapshots.

### UI and async checklist

- [ ] Fetch/RPC calls validate chain, status, schema, response size and timeout.
- [ ] No unhandled rejection on wallet disconnect, provider error, worker crash or route change.
- [ ] Confirmation uses final calldata, not stale UI state.
- [ ] Fragment parse/clear/history behavior explicit.
- [ ] No silent auto-submit; user can inspect destination, token, amount and fee.
- [ ] Keyboard and screen-reader review of confirmation/error states.
- [ ] Safe external links and redirects.
- [ ] Errors do not include secrets, full fragments or private invoice content.

### PR checklist

- [ ] Linked spec/ADR and threat-model delta.
- [ ] Positive and security-negative tests.
- [ ] Tool findings triaged; suppressions justified.
- [ ] Bundle/network diff checked for new origins/scripts.
- [ ] Docs and support matrix updated.
- [ ] Clean checkout reproduces tests.
- [ ] Contract/crypto changes get independent specialist review before release.

# Section 4: Feature expansion framework

## Mandatory two-step protocol

### Phase A — Spec first

Before code, document user problem, users/success metrics, scope, UX/failure states, package/API/data/contract changes, privacy/network/storage impact, dependencies and compatibility, acceptance criteria/tests, rollout/disable plan, and docs.

### Phase B — Post-implementation security review

After code exists and before merge/release, review the exact diff/dependencies, update threat model/data flow, run feature-specific abuse tests and static/unit/fuzz/browser checks, publish a user-facing privacy disclosure, record residual risk, fix/accept findings, and retest the exact release artifact hash.

The three proposals below include Phase A and a pre-implementation security review. Their Phase B review is still required after implementation.

## Proposal 1 — Usability: Quote-locked preview and local payment receipt

### Phase A: Specification

**Purpose:** Reduce payer confusion about price, token, network, fee and confirmation.

- Seller sets fiat amount/currency, supported token, quote source, freshness bound, slippage and expiry.
- Payer sees quote amount, exact token/chain, timestamp, expiry, fee, minimum net recipient amount and public observability.
- No automatic wallet submission. Payer explicitly confirms.
- Client verifies receipt and announcement, shows included vs final status, and exports a local receipt containing tx hash, chain, amount, quote snapshot, fee and time.
- Export is local-only; no hosted invoice or receipt database.
- Allowlisted quote adapters fail closed on stale/out-of-range values and never silently switch sources.

API sketch:

~~~ts
export interface QuotePolicy {
  chainId: number;
  token: `0x${string}`;
  fiatCurrency: string;
  fiatMinorUnits: bigint;
  source: "chainlink" | "uniswap-twap";
  maxAgeSeconds: number;
  maxSlippageBps: number;
  expiresAt: number;
}

export interface PaymentPreview {
  quotedTokenAmount: bigint;
  minimumNetAmount: bigint;
  feeAmount: bigint;
  quoteTimestamp: number;
  expiresAt: number;
  destination: `0x${string}`;
}
~~~

Acceptance: preview equals calldata; stale price disables payment; decimals/rounding tested; receipt differentiates included/final; no private fields sent to backend.

### Phase A: Security review

- Stale/manipulated oracle, low liquidity, decimals, rounding and expiry can cause financial loss. Gate per chain and bound slippage.
- Malicious RPC/UI mismatch can show one amount and submit another. Derive preview from final call and compare pre-wallet.
- Receipt exposes amount/time; label local/private and warn before sharing.
- Never imply guaranteed fiat value; execution price may differ.

## Proposal 2 — Adoption: Wallet-agnostic payment handoff and accessible QR

### Phase A: Specification

**Purpose:** Make invoices usable across desktop/mobile and multiple wallet providers.

- Support EIP-1193 and EIP-6963 injected discovery; optional WalletConnect-style adapter, never mandatory.
- QR encodes public invoice URL only. If bearer key is in the fragment, warn that anyone with the QR/link can read it.
- Accessible copy, QR download, keyboard navigation, screen-reader labels, localization-ready strings and explicit unsupported chain/token errors.
- Adapter exposes normalized provider and capabilities; GhostPay never receives wallet seed phrases or credentials.
- Cross-device handoff opens the same URL; no link shortener, tracking QR, account server or analytics.
- Optional wallet relay integration is disclosed as a network metadata observer.

API sketch:

~~~ts
export interface WalletAdapter {
  id: string;
  displayName: string;
  connect(): Promise<{ provider: Eip1193Provider; accounts: readonly string[] }>;
  getCapabilities(): Promise<{
    chainIds: readonly number[];
    supportsSignAndSend: boolean;
  }>;
  disconnect?(): Promise<void>;
}
~~~

Acceptance: two independent provider paths; no hidden fallback; QR round-trip exact; accessibility audit passes; local QR generation creates no network request; chain mismatch errors are clear.

### Phase A: Security review

- Malicious provider may lie about chain/account or mutate transaction response; verify receipt and show actual calldata before signing.
- QR/deep-link library can add remote scripts or URL logs; bundle locally with no shortening service.
- Bearer fragments may enter photo backup, clipboard, previews or history; warn at creation and allow excluding private notes.
- Wallet relay sees IP/session metadata; integration remains optional and disclosed.

## Proposal 3 — Advanced optional security: Policy-guarded stealth smart-account destinations

### Phase A: Specification

**Purpose:** Offer recovery/withdrawal guardrails to users who prefer policy protection over simple EOA sweeps.

**Compatibility boundary:** This is a new GhostPay scheme/account mode, not EIP-5564 scheme 1's standard EOA destination. Scheme 1 remains available unchanged.

- Define a new scheme ID only after ADR and interoperability review.
- Derive stealth owner key from reviewed scheme primitives; derive a deterministic counterfactual smart-account address from fixed audited factory and versioned init code.
- Account permits only allowlisted token transfers to seller-configured cold destination, optional delay, per-asset limit and recovery path. No arbitrary delegatecall or arbitrary external target.
- User explicitly opts in per invoice; UI shows deployment/gas costs, delay, chain/factory and public activity.
- Optional ERC-4337 sponsorship has strict caps; it does not provide unlinkability.
- Recovery configuration is versioned and signed; changes require delay or threshold/guardian policy. Resolve lockout/censorship behavior before implementation.
- Publish address derivation vectors per chain; independently audit factory/account bytecode.

Acceptance: deterministic addresses match; unapproved destination fails; delays/limits enforced; recovery tested; unauthorized initialization fails; deployed and counterfactual behavior verified.

### Phase A: Security review

- More contract/key-management surface and a new scheme may reduce interoperability.
- Factory/init-code change alters counterfactual addresses; bind version and chain.
- Key theft may bypass policy depending on design; guardians/time delays can censor or lock out users.
- Bundlers/paymasters observe/censor operations; apply quotas, simulation, deposit monitoring and fallback.
- Account deployment and recovery events may increase graph linkability. Do not market as privacy-enhancing without graph analysis.
- Require design review, audit, testnet soak and explicit opt-in.

# Section 5: Code readability and commenting standards

## 1. Solidity NatSpec

Every contract, interface, public/external function, event, custom error, parameter and return gets NatSpec. Explain security invariants and caller-visible effects.

~~~solidity
/// @title GhostPayPaymentRouter
/// @notice Atomically splits a supported ERC-20 payment and announces its stealth recipient.
/// @dev Non-upgradeable; fee and announcer are immutable. Successful calls do not retain
/// settlement tokens. Only tested token semantics are supported.
contract GhostPayPaymentRouter {
    /// @notice Emitted after net transfer and standard stealth announcement succeed.
    /// @param invoiceId Public correlation value; never encode customer information.
    /// @param payer Address authorizing transfer.
    /// @param stealthAddress One-time net-payment destination.
    /// @param token ERC-20 asset.
    /// @param grossAmount Authorized amount before fee.
    /// @param feeAmount Protocol fee.
    /// @param netAmount Amount delivered to stealth destination.
    event GhostPaySettled(
        bytes32 indexed invoiceId,
        address indexed payer,
        address indexed stealthAddress,
        address token,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount
    );

    /// @notice Rejects malformed scheme announcement metadata.
    error InvalidMetadata();

    /// @notice Splits a payment and announces its stealth destination.
    /// @dev Reverts atomically if a token transfer or announcer call fails.
    /// @param invoiceId Public correlation identifier; do not encode PII.
    /// @param token Supported ERC-20 asset.
    /// @param stealthAddress One-time scheme-derived destination.
    /// @param grossAmount Amount authorized before fee split.
    /// @param ephemeralPubKey Ephemeral public key for the selected scheme.
    /// @param metadata EIP-5564 bytes; byte zero contains the scheme view tag.
    function payERC20(
        bytes32 invoiceId,
        IERC20Minimal token,
        address stealthAddress,
        uint256 grossAmount,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external;
}
~~~

- @notice: integrator/user-visible purpose and effects.
- @dev: trust assumptions, atomicity, privacy consequence, invariants.
- @param: every parameter, units/encoding and visibility.
- @return: every return including whether quote, commitment or final result.
- Document event indexed fields and public correlation IDs. Errors explain rejection condition.
- CI checks missing public NatSpec. Never claim code guarantees anonymity.

## 2. TSDoc/JSDoc for cryptography and frontend

For every complex function document exact scheme/version, encoding, curve, scalar/point range, byte order, hash/serialization, secret/public inputs, randomness source, failure behavior, security implications, limitations and vector IDs.

### Crypto function template

~~~ts
/**
 * Derives a scheme-1 stealth payment from a recipient meta-address.
 *
 * @remarks Uses secp256k1 and exact ERC-5564 scheme-1 serialization/hash rules
 * from the pinned reference implementation. Samples a fresh ephemeral scalar
 * with Web Crypto. The result is a public destination; this does not conceal
 * payer, amount, time, or later transaction graph.
 *
 * @param metaAddress Valid st:eth scheme-1 spending/viewing public-key pair.
 * @param rng Production callers must use crypto.getRandomValues.
 * @returns One-time address, ephemeral key, and one-byte view tag.
 * @throws If scalar, point, prefix, or serialization is invalid.
 * @security Never log/serialize secret scalars or send them to an RPC.
 * @see https://eips.ethereum.org/EIPS/eip-5564
 * @testVector scheme1-generation-001
 */
export function deriveStealthPayment(
  metaAddress: string,
  rng: Crypto
): DerivedStealthPayment;
~~~

### URL/encryption template

~~~ts
/**
 * Parses and authenticates a GhostPay invoice fragment without network access.
 *
 * @remarks Fragment is omitted from ordinary HTTP requests but is readable by
 * page scripts and local browser software. This function does not fetch URLs,
 * render HTML, or make the fragment confidential from link recipients.
 *
 * @param fragment Bounded #gpi=v1.<base64url> input.
 * @returns Validated data; never executable markup.
 * @throws On size, version, canonicalization, authentication or schema failure.
 * @security Do not log the fragment or returned private fields.
 */
export function parseInvoiceFragment(fragment: string): ValidatedInvoice;
~~~

Worker/UI comments explain cancellation, buffer ownership, error handling, persistence, and network access. Encryption comments document nonce uniqueness/size, AAD, key origin, version and key-sharing. Do not claim JS memory can be securely wiped.

## Completion criteria

- Workflows use SHA-pinned Actions, protected environments, least-privilege permissions, and separate testnet/release secrets.
- Tests cover crypto vectors, invariant properties, malicious tokens, parser attacks, worker failures and network-egress assertions.
- Phase-end security assessment is run against an exact release candidate.
- User/operator manuals explain observable data and recovery.
- Every feature has Phase A spec and Phase B post-implementation review.
- NatSpec/TSDoc coverage is reviewed and generated docs checked.

## Primary references reviewed

- [Foundry invariant testing](https://getfoundry.sh/forge/invariant-testing)
- [Echidna](https://github.com/crytic/echidna)
- [Slither](https://github.com/crytic/slither)
- [Mythril](https://github.com/ConsensysDiligence/mythril)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [typescript-eslint rules](https://typescript-eslint.io/rules/)
- [EIP-5564](https://eips.ethereum.org/EIPS/eip-5564)
- [ERC-4337 paymaster security](https://docs.erc4337.io/paymasters/security-and-griefing)
