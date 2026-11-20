# Static beta decisions (B01), manifest validation script (B03), chain matrix reconciliation (B04)

Prepared 2026-11-18 on local branch `secrec-local`, base commit `c827d22fee16da1cd50c7c3239bd894ae1f5eb2e`
(descends from the candidate head `71abc7e55c25d45b206ac47e5ddd24e072805710` with #204 merged; between those two commits
nothing changed under `apps/web`, `packages/chain-adapters`, `scripts/lib`, `scripts/check-chain-matrix.mjs`,
`docs/pages` or ADR-0029; only `.github/workflows/ci.yml` changed, by one line).

**This is a decision packet, not a decision.** An AI agent read the source and the GitHub API and wrote it. It is not an
external audit and records no owner approval. Nothing in it enables deployment, publishing, signing, schedules or
paid automation, and it contains no keys, fingerprints or placeholder credentials. Every "recommended default" below
waits for the owner's choice.

## 1. Current state, checked against source

| Item | What the source does today | Where |
|---|---|---|
| ADR-0029 status | "Proposed (2026-11-12). Needs the owner's acceptance." ADR-0015 governs until then; Pages must not be dispatched with `deploy: true` | `docs/adr/ADR-0029-github-pages-static-beta.md`:3 |
| Pages publishing | Only `workflow_dispatch` on `refs/heads/main` with `deploy=true` sets `publish=true`; the `deploy` job uses the `github-pages` environment with `pages: write`, `id-token: write`. Pull requests build and verify only | `.github/workflows/pages.yml`:34-38, :65, :216-233 |
| Serving origin | Default `https://<owner>.github.io` unless repository variable `GHOSTPAY_PAGES_ORIGIN` is set. `build-pages.sh` treats any `*.github.io` host as shared and refuses bundled manifests on it unless `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` | `pages.yml`:97-102; `scripts/pages/build-pages.sh`:60-100 |
| Pages manifests | Only the seven EVM testnet chain ids are accepted (mainnet ids refused); manifests require `GHOSTPAY_RELEASE_PUBKEYS` and an origin | `scripts/pages/verify-pages-site.mjs`:22, :216; `build-pages.sh`:93-100 |
| Shipped manifests | None: `apps/web/deployments/` holds only `README.md`, so payments are disabled on every chain | `ls apps/web/deployments` |
| Manifest trust root | `GHOSTPAY_RELEASE_PUBKEYS` (at most 8 compressed secp256k1 keys) is compiled into the bundle. No key: any manifest fails the build, and `loadBundledManifest` returns `invalid`. With keys: an unsigned or wrongly signed manifest fails the build and is refused at load time | `apps/web/scripts/validate-deployments.mjs`:8-43; `apps/web/vite.config.ts`:10, :56, :64-70; `apps/web/src/lib/releaseKeys.ts`; `apps/web/src/lib/manifest.ts`:34-49 |
| Default app loader | `defaultServices` binds `loadManifest` to `loadBundledManifest` (no runtime fetch). The network `loadManifest` in `manifest.ts`:52 still accepts an unsigned **testnet** manifest when no key is passed (`unsigned-dev`); it is documented as manual/test-only and is not wired into the default services | `apps/web/src/lib/defaultServices.ts`:30, :38 |
| Manifest signature scheme | Detached compact secp256k1 (`r || s`, low-s) over Keccak-256 of `GhostPay/structured-deployment-manifest/v1\n` + canonical JSON. The only signing recipe is a documentation snippet with a raw hex key file; there is no maintained signer tool | `docs/DEPLOYMENT_MANIFEST.md` §4-§6; `apps/web/deployments/README.md` |
| Tag-signing trust root | `.github/release-signers/allowed_signers` contains **no key**, so `scripts/verify-tag.sh` and `release.yml` reject every `v*` tag. CI reads that file from the default branch. SSH (`namespaces="git"`) and optional OpenPGP (`pgp-keys.asc`) are supported | `.github/release-signers/{allowed_signers,README.md}`; `.github/workflows/release.yml`:1-15 |
| Release workflow | On `v*` tag push: verify tag, run contract analysis, build, then a **draft** release behind the `release` environment; the static-publish job is a commented-out stub | `release.yml`:16-18, :108, :205-245, :248-265 |
| Repository protection (GitHub API, 2026-11-18T07:00Z) | `GET repos/.../branches/main/protection` returned 404 "Branch not protected"; `GET repos/.../rulesets` returned `[]`; `GET repos/.../tags/protection` returned 404; there is no `.github/CODEOWNERS`. Environment, Pages and Actions-variable endpoints were refused by the session proxy (403), so environment reviewers, the Pages source and the values of `GHOSTPAY_RELEASE_PUBKEYS` / `GHOSTPAY_PAGES_ORIGIN` were **not observed** | `gh api` (read-only) |
| Shared origin size | `GET repos/djshellshoxxx/GhostPay` reports `has_pages: true`, `visibility: public`. The "more than fifteen other Pages sites" count in GP-PAGES-01 could **not be re-checked**: account-wide repository listing is refused by the session proxy | `docs/pages/RELEASE_MATRIX.md` (GP-PAGES-01) |

Consequence of the protection row: if the API answers are complete, anyone with push access to `main` can change
`allowed_signers`, the Pages workflow, the bundled manifests and the code that checks them, and dispatch a deploy. The
ADR-0029 consequence "Branch protection and the `github-pages` environment rules are part of the security boundary"
is therefore not yet met. The owner should confirm in Settings; a token with narrower permissions can see less.

## 2. Decisions

### D1. Accept ADR-0029, and for what

| Option | Effect | Security implication |
|---|---|---|
| A. Accept for `DEMO_DEPLOYED` only (no manifest) | A manual dispatch may publish the lean demo; payments stay disabled everywhere | Exposes the static client and its local key handling on a host without response headers (no `frame-ancestors`, `nosniff`, Permissions-Policy). No funds can move through the app |
| B. Accept including testnet payments | Also allows `TESTNET_BETA_QUALIFIED` once ADR-0015 gates 2 and 3 close | Needs D2-D5 settled first; testnet funds only |
| C. Defer | ADR-0015 keeps all hosting gated | No exposure; no public beta |

**Recommended default: A.** It matches the ADR's own consequence section and needs no key. B should be a later,
separate acceptance after D2-D5 and the B02 deployment evidence exist.

### D2. Serving origin (GP-PAGES-01)

All GitHub Pages project sites of one account are served from the same origin `https://<account>.github.io`. Path does
not isolate origins: any sibling site can open or frame a GhostPay page and script it, and can read `localStorage`
(RPC URLs, settings, scan checkpoints) and IndexedDB (encrypted vault ciphertext, reconciliation data). The CSP is
`script-src 'self'; connect-src 'self' https: wss:` (`apps/web/index.html`:12-13), and on a shared origin `'self'`
includes every sibling site. If the account also has a user site (repository `<account>.github.io`, served at `/`),
a service worker registered there can claim scope `/` and intercept requests for `/GhostPay/`; GitHub Pages cannot send
`Service-Worker-Allowed` or any other header to stop that. Whether such a repository exists was not checked (proxy refusal).
Encrypted data stays encrypted, but a hostile sibling can exfiltrate ciphertext for offline guessing, or script the
page while keys are unlocked.

| Option | Isolation | Cost and residual risk |
|---|---|---|
| A. Shared `github.io`, demo only (no manifests) | None | Today's state. Users may still create and store keys there; the banner warns. Every other Pages site of the account, and anyone who compromises one, is in the trust boundary |
| B. Shared `github.io` with `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN=testnet` | None | Same as A, with testnet payments enabled. Only for test assets; not recommended |
| C. Custom domain on GitHub Pages (`GHOSTPAY_PAGES_ORIGIN=https://<domain>`) | Own origin | Domain cost. Verify the domain at account level (prevents takeover by another Pages user if DNS dangles), enforce HTTPS, keep the CNAME record under change control. Still no response headers |
| D. Dedicated GitHub account or organisation used only for GhostPay Pages | Own `github.io` origin, as long as nothing else is published there | No domain needed. Any future Pages site in that account shares the origin again; a second account to secure |
| E. Header-capable primary host, Pages as labelled mirror | Own origin with headers (`frame-ancestors`, `nosniff`, COOP) | Needs a new ADR (ADR-0029 decision 2); ADR-0015 gate 5 fully met; more operational surface |

**Recommended default: A now, C or D before any testnet manifest is bundled.** The build already enforces the
prerequisite (no manifests on a shared origin without the explicit opt-in); keep `GHOSTPAY_PAGES_ALLOW_SHARED_ORIGIN`
unset. E is the only option that restores clickjacking protection and is the path to anything beyond a testnet beta.

### D3. Release tag-signing trust root (`allowed_signers`)

| Option | Supported by `verify-tag.sh` today | Tradeoff |
|---|---|---|
| A. SSH `ed25519-sk` key on a FIDO token | Yes | Private key never leaves hardware; touch required per tag. Losing the token without a second enrolled key blocks releases |
| B. SSH `ed25519` software key | Yes | Simplest; key theft from the workstation is the main risk |
| C. OpenPGP key (`pgp-keys.asc`) | Yes | Familiar to some verifiers; more tooling and key-management complexity |
| D. Sigstore keyless (gitsign, OIDC identity) | **No**: would need new verification code and a new trust policy | No long-lived key; trust moves to the identity provider and transparency log |

**Recommended default: A, with two enrolled keys** (one daily token, one offline backup token), each line bounded with
`valid-before`, fingerprints published through at least one channel outside this repository. Because CI reads
`allowed_signers` from the default branch, D5's protection of `main` and `.github/release-signers/**` is a prerequisite:
without it the trust root is only as strong as push access to `main`.

### D4. Deployment manifest signing key (secp256k1, `GHOSTPAY_RELEASE_PUBKEYS`)

This is a different key, algorithm and trust root from D3. It authorises contract addresses and the fee recipient that
the app pays. Its public half is compiled into the bundle, so it only adds assurance for a user who checked the bundle
itself out of band (D3's signed tag and published `SHA256SUMS`).

| Option | Tradeoff |
|---|---|
| A. Dedicated offline secp256k1 key on an air-gapped machine, signing with the documented `@noble/curves` recipe | Matches the code exactly (raw 32-byte digest, `prehash: false`, low-s, 64-byte compact). The recipe is a documentation snippet, not a maintained tool (`docs/DEPLOYMENT_MANIFEST.md` §6) |
| B. Hardware wallet | Only if the device can sign a raw 32-byte digest without an EIP-191/EIP-712 prefix and the result is converted to 64-byte low-s compact. Many wallet apps refuse raw-digest signing; **not verified here**, so the owner must test it before choosing B |
| C. Reuse an existing deployer or EOA key | Not recommended: one compromise then authorises both on-chain deployment and the manifest that tells users which contracts to trust |
| D. Two keys (up to 8 are accepted) | Rotation without a gap; each additional key is another way to authorise a manifest |

**Recommended default: A with a single key now, D (add a second key) at the first rotation.** Before the first signed
manifest, add the maintained signer tool listed as open in `docs/DEPLOYMENT_MANIFEST.md` §6 rather than signing with
an ad-hoc script. Store the public keys as the repository variable (public data, not a secret), and keep the same list
for relayer and ops monitor as that document requires.

### D5. Environment approval and repository protection

| Control | Recommended default | Why |
|---|---|---|
| `github-pages` environment | Deployment branches: `main` only; required reviewer: the owner | `pages.yml` already gates on `main` + `deploy=true`; the environment rule makes the approval separate from the dispatch |
| `release` environment | Required reviewer: the owner | `release.yml` comments assume this; it could not be observed |
| Ruleset on `main` | Require pull request, block force-push and deletion, and require the checks chosen in [OWNER_ACTION_PACKET.md](OWNER_ACTION_PACKET.md) section 1.1: `changes`, `typescript`, `contracts` and `secrets-and-egress` (pinned to `integration_id` 15368), plus a `code_scanning` rule. Do **not** require `echidna`/`mythril` (`contract-analysis.yml:3-12` is path-filtered, and Mythril is red by design) or every `ci.yml` check by name (a docs-only PR reports the skipped matrix as `e2e`, e.g. CI run 44253820581: `e2e` and `lean-candidate` skipped). Mythril is enforced at release (`release.yml` `contract-analysis` job and evidence gate) | The API reported no branch protection and no rulesets |
| CODEOWNERS (owner review) | `.github/**`, `.github/release-signers/**`, `apps/web/deployments/**`, `apps/web/scripts/validate-deployments.mjs`, `scripts/pages/**`, `scripts/verify-tag.sh`, `packages/chain-adapters/config/matrix.json` | These files define what is trusted; no CODEOWNERS file exists |
| Tag ruleset | Restrict creation of `v*` to the owner | Recommended in `.github/release-signers/README.md` |

With a single maintainer, a required reviewer is a deliberate second click by the same person, not two-person control.
Real separation of duties needs a second trusted reviewer (D6 option B).

### D6. Release authority ownership

| Option | Who holds what | Tradeoff |
|---|---|---|
| A. Owner only | Owner merges to `main`, holds both keys (D3, D4), approves both environments, dispatches Pages | Simple and matches today. Single point of compromise and of loss |
| B. Owner plus one named reviewer | Owner holds keys and approves environments; reviewer must approve PRs touching CODEOWNERS paths | Two people must collude or be compromised to change the trust root; needs a second trusted person |
| C. Organisation with a release team | Team-based environment reviewers and rulesets | Most auditable; more administration, and fits option D2-D if the org is dedicated |

**Recommended default: A for the demo (D1-A), B before any testnet manifest is bundled.** Whatever is chosen, record
it in ADR-0029 (or a follow-up ADR) with the date, the key fingerprints published out of band, and the recovery
procedure for a lost or compromised key.

### Order of owner actions

1. D1 (accept ADR-0029 for demo or defer). 2. D5 protection of `main`, CODEOWNERS and tag ruleset. 3. D2 origin choice.
4. D3 tag keys added to `allowed_signers` through a reviewed PR. 5. D4 manifest key and signer tool. 6. B02 deployment,
then B03 signed manifest. Steps 4-6 are needed only for D1-B.

## 3. B03: `validate:deployments` script

The deployments README (step 4), `docs/DEPLOYMENT_MANIFEST.md`:108 and `docs/developer/release-and-repro.md`:115 all
tell operators to run `npm run validate:deployments -w @ghostpay/web`. Before this change that failed:

```
$ npm run validate:deployments -w @ghostpay/web       # at c827d22f
npm error Missing script: "validate:deployments"      # exit 1
```

Fix: `apps/web/package.json` now maps `validate:deployments` to `node scripts/validate-deployments.mjs`, the same
validator the Vite build hook (`vite.config.ts`:64-70), `scripts/scan-bundle.mjs` and `e2e/devnet/scan-dist.mjs` call.
Adding the script keeps all three documents correct. The validator itself is unchanged.

Run locally (Node 22.23.5, npm 10.9.9; `@ghostpay/chain-adapters` resolves through the shared `node_modules` to the
main checkout's built `dist`, whose committed `src` is identical to this tree's):

| Command | Result |
|---|---|
| `npm run validate:deployments -w @ghostpay/web` | `deployments/: ok`, exit 0 (no manifest shipped, so payments stay disabled) |
| same with `GHOSTPAY_RELEASE_PUBKEYS=<freshly generated test key>` | `deployments/: ok`, exit 0 |
| `GHOSTPAY_RELEASE_PUBKEYS=02abc node scripts/validate-deployments.mjs` | throws "each key must be a 33-byte compressed secp256k1 public key", exit 1 |

"ok" with an empty directory is the intended result: an absent manifest is fail-closed at runtime (`ManifestState`
`absent`, payments disabled), not a validation error. A shipped manifest is never accepted without a key.

`apps/web/src/validateDeploymentsScript.test.ts` (new, runs in the normal `npm test -w apps/web` pass) proves:
the script exists and points at the validator; `npm run validate:deployments` runs against the real `deployments/`
and passes without keys only while no manifest is shipped (otherwise it must fail for the missing key); and, through a
byte-identical copy of the validator in a temporary tree, the CLI exits 1 for an unsigned manifest without a key, an
unsigned manifest with a key, a manifest signed by a different key, a signed manifest without a key, and a bad file
name, exits non-zero for a malformed key, and exits 0 only for a correctly signed manifest with its key. Result:
3/3 pass; with the script removed from `package.json`, 2/3 fail (red), as expected.

Remaining limitation (not changed; outside this task's files): the CLI always validates `apps/web/deployments/`
(path fixed relative to the script) and ignores `GHOSTPAY_DEPLOYMENTS_DIR`, which only the Vite build honours. The
Pages build validates its own copy through the Vite hook, so this matters only for checking another directory by hand.

## 4. B04: chain/token/feed matrix

`node scripts/check-chain-matrix.mjs` cannot run in this tree: it imports `packages/chain-adapters/dist/...`, which is
absent (`ERR_MODULE_NOT_FOUND`, exit 1). Counts below come from reading `packages/chain-adapters/config/matrix.json`
directly. As a cross-check, a scratch copy of the script with only its import paths rewritten to the main checkout's
built `dist` (no logic change) gave:

- default mode: `Chain matrix schema/configuration passed: 14 chains, 9 tokens, 4 feeds`, exit 0;
- `--release`: `Chain matrix rejected`, 73 errors, every one `required release cell is not verified`, exit 1.

73 = unverified cells on the seven enabled chains (42 chain-level + 27 token + 4 feed). Release mode requires every
cell of every enabled chain, so this gate correctly blocks a release. Nothing was marked verified.

Matrix cell counts (statuses present: 30 `verified`, 115 `unverified`, 0 `n/a`):

| Chain | enabled | Chain-level cells (6) | Tokens: verified / unverified | Feeds: verified / unverified |
|---|---|---|---|---|
| 11155111 Ethereum Sepolia | true | 0 / 6 | USDC 2/3, EURC 2/3 | ETH/USD 3/1, USDC/USD 3/1 |
| 84532 Base Sepolia | true | 0 / 6 | USDC 2/3, EURC 2/3 | ETH/USD 3/1, USDC/USD 3/1 |
| 11155420 OP Sepolia | true | 0 / 6 | USDC 2/3 | none |
| 421614 Arbitrum Sepolia | true | 0 / 6 | USDC 2/3 | none |
| 80002 Polygon Amoy | true | 0 / 6 | USDC 2/3 | none |
| 97 BNB Smart Chain Testnet | true | 0 / 6 | none | none |
| 43113 Avalanche Fuji | true | 0 / 6 | USDC 2/3, EURC 2/3 | none |
| 1, 8453, 10, 42161, 137, 56, 43114 (mainnets) | false | 0 / 6 each | none | none |
| **Totals** | 7 enabled, 7 disabled | **0 / 84** | **18 / 27** | **12 / 4** |

Chain-level unverified cells on every chain: `gasToken`, `finalityDepth`, `getLogsMaxRange`, `announcer`, `registry`,
`deployment`. Token cells verified: `address` and `decimals` (Circle source); unverified: `permit`, `blacklist`,
`eip3009`. Feed cells verified: `address`, `decimals`, `heartbeatSec` (Chainlink reference-data source); unverified:
`acceptance`. Sepolia alone has 14 unverified cells (6 + 6 + 2), which matches the B04 row of `NEXT_PHASE_QUEUE.md`.
A `verified` cell here means a documented primary source and date only; it is not on-chain readback (see the header of
`scripts/lib/chain-matrix.mjs`).

Unsupported networks stay disabled:

- `packages/chain-adapters/src/config/chains.ts`:48-54: all seven mainnets have `testnet: false, enabled: false`;
  `requireEnabledChain` (:74-76) fails with `CHAIN_DISABLED` for them. The matrix `enabled` flags match (the checker
  compares them).
- Web app: `defaultServices.ts`:45 passes only `CHAINS.filter((c) => c.enabled)`; `pay.ts`:129 blocks a disabled chain;
  `sellerPairing.ts`:7 and `PolicyView.tsx`:61 additionally require `testnet`; Pages builds refuse non-testnet
  manifests (`verify-pages-site.mjs`:216). BTC, Solana and TRON `mainnet` entries are `enabled: false`
  (`features/{btc,solana,tron}/network.ts`) and their wallet and worker paths throw when a network is disabled.
- All seven EVM testnets are `enabled: true` although none has a verified chain-level cell. Payments still stay
  disabled on each, because no signed manifest ships (`deployment` cell unverified, `ManifestState` `absent`).

Drift found (not fixed; not in this task's files): `docs/operators/testnet-runbook.md`:53 says the app and relayer
accept "Ethereum Sepolia and Base Sepolia only", but `chains.ts` enables seven testnets. Some components do restrict to
those two (plus 31337): `packages/scan-source/src/guard.ts`:4, `packages/hops/src/types.ts`:7,
`packages/payer-sponsor/src/chainGuard.ts`:4. `NEXT_PHASE_QUEUE.md` D01 repeats the runbook statement. Either the
runbook should list the seven enabled testnets, or the owner should decide to disable the five testnets that have no
deployment plan; that is a product decision, so it is left open here.
