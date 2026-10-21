# Failures and Prevention: GhostPay Security Map

Scope: real-world failures, root cause, loss, preventing control, GhostPay control/test to add.
Targets: apps/web, apps/relayer, packages/contracts (plus packages/address-safety, relayer-guard, tx-review, chain-adapters, secret-box where relevant).
Method: WebSearch/WebFetch. Secondary sources unless noted. Numbers conflict across sources; flagged `[UNVERIFIED]`. No primary court docs read.

## 1. Centralized exchange and custody failures

### Bybit (Feb 2025), Safe{Wallet} frontend/supply chain
- Root cause: developer workstation compromised via social engineering; attacker reached cloud env using live session token past MFA; malicious JS injected into Safe{Wallet} S3 bucket (Feb 19), triggered on Bybit multisig tx (Feb 21). Malicious UI showed benign tx, signers approved disguised tx. Attribution: Lazarus (per SlowMist/secondary).
- Loss: ~$1.4-1.5B `[UNVERIFIED exact]`.
- Sources: https://slowmist.medium.com/bybits-1-5-billion-theft-unveiled-safe-wallet-front-end-code-tampered-84b78f0fa9c2 ; https://report-uri.com/case-studies/bybit ; https://onrampbitcoin.com/knowledge-center/how-was-bybit-hacked
- Prevention: signers verify tx calldata/hash on hardware device, not UI; SRI/CSP on frontend; signed release artifacts; session-token binding; no long-lived cloud sessions.
- GhostPay control/test: apps/web CSP + SRI on all script tags; test that signing flow displays decoded calldata and recipient from chain-side data, not UI string. Test that build artifact hash matches published manifest. Add CI check: fail on new third-party script include.

### Coincheck (Jan 2018), NEM hot wallet
- Root cause: bulk NEM in single-sig internet-connected hot wallet, no multisig; theft over hours undetected.
- Loss: ~523M XEM (~$400-530M depending on price) `[UNVERIFIED USD]`.
- Sources: https://toyokeizai.net/articles/-/206538 ; https://bitcoinmagazine.com/articles/following-massive-cryptocurrency-hack-coincheck-pledges-improve-operations-refund-losses
- Prevention: cold storage majority; hot wallet cap; outflow anomaly alerts; multisig for all chains.
- GhostPay control/test: relayer hot-key spend cap per window; alert on outflow rate anomaly (packages/ops-monitor). Test: relayer refuses tx above cap; alert fires on synthetic burst.

### KuCoin (Sep 2020), hot wallet keys via APT
- Root cause: long-dwelling intruder past internal network controls obtained keys of several hot wallets. CEO attributed to APT.
- Loss: ~$281M (analyst) vs ~$285M (CEO) `[UNVERIFIED, varies]`.
- Sources: https://decrypt.co/43806/kucoin-has-found-the-hackers-who-stole-281-million ; https://forklog.com/en/analyst-estimates-kucoin-hack-damage-at-280-million/
- Prevention: key isolation per hot wallet; HSM/MPC signing; egress and lateral-movement detection.
- GhostPay control/test: relayer signing key never in plaintext env in prod; test that key material loads only via KMS/HSM interface. Add keyring rotation test.

### FTX (Nov 2022), key management and unrecorded transfers
- Root cause (bankruptcy report): private keys stored without proper backup or access logs; undocumented fund movement between affiliates; hot-wallet drain of ~$432M on filing night.
- Sources: https://www.theblock.co/post/225601/ftx-bankruptcy-report-latest
- Prevention: auditable key access logs; segregated accounting; proof-of-reserves.
- GhostPay control/test: every relayer/admin key use logged with actor and reason; ledger reconciliation test: sum(user balances) == sum(on-chain holdings) for each asset.

### Mt. Gox (2011-2014)
- Root cause (claimed): transaction malleability exploited for double withdrawals; ETH Zurich study found little evidence of widespread malleability theft; suspicion of internal theft unresolved in sources.
- Loss: claimed 850,000 BTC `[UNVERIFIED, contested]`.
- Sources: https://arxiv.org/pdf/1403.6676 ; https://www.technologyreview.com/s/526161/the-troubling-holes-in-mtgoxs-account-of-how-it-lost-600-million-in-bitcoins/
- Prevention: never trust txid before confirmation; reconcile on tx hash and output set, not txid alone; withdrawal state machine.
- GhostPay control/test: relayer and web reconcile by full tx hash + outputs; test that a malleated-equivalent tx does not double-credit.

### Bitfinex (Aug 2016), multisig bypass
- Root cause (per reporting, unconfirmed): attackers overrode multisig authorization and worked around BitGo-enforced withdrawal limits; insider role suspected by commentators.
- Loss: 119,756 BTC (~$72M then) `[UNVERIFIED USD range $65-77M]`.
- Sources: https://hackingdistributed.com/2016/08/03/how-bitfinex-heist-could-have-been-avoided/ ; https://coinbureau.com/analysis/bitfinex-hack
- Prevention: policy limits enforced in an independent signer, not the same service; cold-storage majority; signer quorum that does not share infra.
- GhostPay control/test: rate/amount limits enforced in a separate guard (packages/relayer-guard), tested as independent process with its own keys. Test: relayer cannot sign above limit even when API layer is compromised.

### Binance (May 2019), BTC hot wallet
- Root cause (Binance statement): phishing, malware, API key and 2FA code exposure; attacker used patient, multi-account orchestration to pass checks; single tx from BTC hot wallet (~2% of BTC holdings).
- Loss: ~7,000 BTC (~$40M+).
- Sources: https://www.cnbc.com/amp/2019/05/08/binance-bitcoin-hack-over-40-million-of-cryptocurrency-stolen.html ; https://www.bloomberg.com/news/articles/2019-05-08/crypto-exchange-giant-binance-reports-a-hack-of-7-000-bitcoin
- Note: Ledger/Lazarus attribution in an earlier query was not supported by search results; not used here.
- Prevention: per-tx and per-account velocity limits; withdrawal allowlists; step-up auth on API key creation.
- GhostPay control/test: API key scopes exclude withdrawal by default; new key cooldown; test that single-tx and multi-account sum limits both trigger.

### NiceHash (Dec 2017)
- Root cause (reported, not confirmed by company): spear-phishing with social engineering; engineer credentials reportedly used for payment system access.
- Loss: ~4,700 BTC (~$63-64M).
- Sources: https://fortune.com/2017/12/07/nicehash-bitcoin-hack-cryptocurrency ; https://www.engadget.com/2017-12-07-nicehash-cryptocurrency-hack.html
- Prevention: phishing-resistant MFA (WebAuthn) for ops; least privilege.
- GhostPay control/test: enforce WebAuthn for any admin route in apps/web; test that admin endpoints reject session without fresh WebAuthn assertion.

## 2. Bridges, cross-chain and DeFi exploits

### Ronin (Mar 2022), validator key compromise
- Root cause: Sky Mavis controlled 4 of 9 validators; Axie DAO validator delegation to Sky Mavis left active after Dec 2021; attacker obtained keys via phishing and gasless RPC flaw. Five-of-nine threshold met.
- Loss: ~173,600 ETH + 25.5M USDC (~$625M). Undetected ~6 days.
- Sources: https://www.spark.money/research/stablecoin-bridge-hack-postmortem-lessons ; https://blockworks.com/news/sky-mavis-ronin-network-bridge-exploited-for-over-600m
- Prevention: no single operator controls threshold; revoke stale delegations; monitor large withdrawals; time-locked withdrawals.
- GhostPay control/test: no single org holds >= quorum of relayer/attestation keys; delegation/grant table with expiry; test that stale delegation is rejected; withdrawal delay plus anomaly alert in packages/ops-monitor.

### Wormhole (Feb 2022), signature verification bypass
- Root cause: Solana program used deprecated `load_instruction_at`, which did not validate the Instructions sysvar address; attacker supplied fake sysvar; secp256k1 precompile check passed in wrong context; forged VAA minted ~120k wETH.
- Loss: ~120k wETH (~$320-326M). Jump Trading backfilled.
- Sources: https://www.certik.com/resources/blog/wormhole-bridge-exploit-incident-analysis ; https://halborn.com/explained-the-wormhole-hack-february-2022
- Prevention: validate every account owner/address in programs; use current APIs; verify signatures bound to context.
- GhostPay control/test: packages/contracts and any Solana/EVM verifier: negative tests for spoofed sysvar/precompile context; test that signature digest binds chain ID, contract address, and nonce.

### Nomad (Aug 2022), zero trusted root
- Root cause: upgrade initialized trusted root to 0x00, auto-proving any message. Copy-paste replay with substituted recipient.
- Loss: ~$186-200M `[UNVERIFIED, varies]`.
- Sources: https://immunefi.com/blog/bug-fix-reviews/hack-analysis-nomad-bridge-august-2022/ ; https://www.coinbase.com/blog/nomad-bridge-incident-analysis
- Prevention: zero-value init must fail closed; upgrade invariants tested pre-deploy; pause on invariant break.
- GhostPay control/test: packages/contracts invariant test: trusted root != 0 after init and upgrade; fork test replays upgrade script; test that replay of prior message with new recipient fails.

### Poly Network (Aug 2021), keeper replacement via arbitrary call
- Root cause: cross-chain manager allowed calls to arbitrary contract; function-selector hash collision allowed attacker to change keeper set.
- Loss: ~$611M (most returned by attacker).
- Sources: https://blog.gopluslabs.io/vulnerabilities-cases/smart-contract/hash-collision/poly-network ; https://www.theblock.co/post/114045/poly-network-hack-explained
- Prevention: deny-list or allow-list target contracts for cross-chain calls; never trust selector alone; admin/keeper changes behind timelock.
- GhostPay control/test: packages/contracts: test that cross-chain executor cannot call the keeper/owner-managing contracts; fuzz selector collisions; timelock on keeper set changes.

### Harmony Horizon (Jun 2022), multisig key compromise
- Root cause (Harmony): encrypted keys (passphrase + KMS) but attacker decrypted some; 2-of-5 (some sources 2-of-4) quorum reached.
- Loss: ~$100M.
- Sources: https://www.theblock.co/post/154029/harmonys-100-million-hacker-took-control-of-its-multi-signature-wallet-analysts-say ; https://securityaffairs.com/132642/hacking/harmony-crypto-assets.html
- Prevention: quorum sized vs. number of independent custody domains; HSM; alerting on signing outside ceremony.
- GhostPay control/test: relayer key ceremony doc + test that threshold keys live on separate hosts/KMS; alert on signature request without matching intent record.

### BadgerDAO (Dec 2021), frontend injected approvals
- Root cause: front-end script injected (reportedly via compromised Cloudflare API key, unconfirmed); malicious script added unlimited ERC-20 approvals when users transacted. Contracts unchanged.
- Loss: ~$120M (PeckShield); ~$115M (other outlets) `[UNVERIFIED]`.
- Sources: https://halborn.com/blog/post/explained-the-badgerdao-hack-december-2021 ; https://www.theblock.co/post/126072 ; https://revoke.cash/exploits/badger
- Prevention: no unlimited approvals (exact-amount or permit2 scoped); CSP/SRI; approval simulation vs. known intent.
- GhostPay control/test: apps/web: test that approve() uses exact amount, not MAX_UINT; CSP blocks inline and unknown origins; e2e test with injected script rejected.

### Ledger Connect Kit (Dec 2023), npm supply chain
- Root cause: former employee's npm account phished; 2FA bypassed via session token; malicious versions 1.1.5-1.1.7 published; rerouted via rogue WalletConnect project ID.
- Loss: ~$484K-600K+ `[UNVERIFIED, varies]`. Live ~5 hours per Ledger.
- Sources: https://ledger.com/blog/security-incident-report ; https://cointelegraph.com/news/multiple-dapps-using-ledger-connector-compromised
- Prevention: lockfile + provenance (npm provenance / sigstore); publish via CI with 2-person approval; pin SDK versions; dependency diff alerts.
- GhostPay control/test: CI: `npm audit` plus lockfile integrity check; block publish/install of new versions without review; test that WalletConnect project ID is config-pinned and not user-supplied.

### Atomic Wallet (Jun 2023), wallet software compromise
- Root cause: not confirmed by vendor (virus, infra breach, malware injection, or MITM listed). Elliptic attributes to Lazarus (high confidence, secondary).
- Loss: ~$35M early, >$100M later (Elliptic) `[UNVERIFIED, conflicting]`.
- Sources: https://elliptic.co/blog/analysis/north-korea-linked-atomic-wallet-heist-tops-100-million ; https://decrypt.co/145765/atomic-wallet-claims-less-than-0-1-of-users-affected-by-100m-hack
- Prevention: reproducible builds; code signing; no unsigned update channels; key material not in renderer.
- GhostPay control/test: apps/web: no private key material in browser storage; test that a modified bundle fails SRI.

## 3. Address poisoning and user-side wallet errors

### Address poisoning (ongoing; $50M case Dec 2025)
- Root cause: attacker sends zero/dust transfer from look-alike address (matching first/last chars) into victim history; victim copies from history. Reported: ~49,999,950 USDT lost (~$50M), laundered quickly via DAI/ETH/Tornado Cash (SlowMist via secondary).
- Chainalysis aggregate 2025 theft figure ($3.4B) cited secondarily; not verified against Chainalysis original `[UNVERIFIED]`.
- Sources: https://www.theblock.co/post/383423/crypto-trader-loses-50-million-in-address-poisoning-attack-offers-1-million-bounty-for-return ; https://onekey.so/blog/ecosystem/even-wang-chun-wasnt-immune-50m-tuition-and-why-address-poisoning-keeps-succeeding
- Prevention: never copy addresses from history; show full address; allowlist/saved recipients; warn on lookalike match.
- GhostPay control/test: packages/address-safety: test that lookalike addresses (same prefix/suffix, different middle) are flagged; apps/web: full-address display and checksum (EIP-55) verification; test that send form never prefills from tx history.

## 4. Darknet market OpSec (defensive lessons only)

### Hansa / Operation Bayonet (2017)
- Failure: admins left old IRC logs with real names and address; server location found via dev server; after move, BTC tracing identified hosting; police ran site and captured credentials and IPs.
- Sources: https://www.helpnetsecurity.com/2017/07/20/hansa-market-shut-down/ ; https://en.wikipedia.org/wiki/Operation_Bayonet_(darknet) ; https://portswigger.net/daily-swig/cast-no-shadow-history-of-darknet-market-takedowns-is-littered-with-opsec-fails
- Lessons: no identifying data in logs; separate dev/prod hosts; server-side logs minimized and rotated; no admin login from same identity as public-facing persona.
- GhostPay control/test: apps/relayer: log redaction test (no IP/user-address pairing persisted beyond TTL); test that dev config cannot reach prod hosts.

### AlphaBay (2017)
- Failure: welcome-message email reused personal address; same address on forum post and PayPal; admin logged in during law-enforcement-induced reboot; unencrypted laptop.
- Sources: https://www.bankinfosecurity.com/one-simple-error-led-to-alphabay-admins-downfall-a-10131 ; https://en.wikipedia.org/wiki/AlphaBay
- Lessons: identifier reuse across contexts; full-disk encryption; session timeout on admin.
- GhostPay control/test: no personal identifiers in automated outbound email templates (test); admin session idle timeout test; encryption-at-rest check in infra/ IaC.

## 5. Chain-analysis and privacy protocol deanonymization

### Wasabi / Samourai CoinJoin
- Finding: academic measurement shows Wasabi and Samourai CoinJoins can be detected with simple heuristics; anonymity set shrinks with clustering; reported high accuracy `[UNVERIFIED accuracy claims vary by paper]`.
- Reported Chainalysis de-mix claim (Protos): secondary, unverified.
- Samourai prosecution: pleas Aug 2025 (secondary).
- Sources: https://arxiv.org/pdf/2109.10229 ; https://protos.com/bitcoin-mixing-coinjoin-wasabi-chainalysis-samourai-privacy-wallet/ ; https://www.moneylaunderingnews.com/2025/12/the-prosecution-of-samourai-wallet-developers-expanding-the-reach-of-crypto-enforcement/
- Party account (weigh accordingly): https://nopara73.medium.com/samourai-wallet-post-mortem-900fa541fde5
- Lessons: privacy depends on graph context, not just mixing; deposit/withdraw timing and amounts link; operator visibility is a risk.
- GhostPay control/test: privacy test in packages/contracts/payer-hiding or stealth module: fixed denomination/batching, no unique amount leak; test that relayer does not log payer-to-stealth link; analysis harness runs clustering heuristic on test chain and asserts anonymity set above threshold.

### Stealth-address / ECDH timing leaks
- Finding: Stanford timing attacks on Zcash (ECDH with viewing key) and P2P node linkage for Monero/Zcash; Zcash fixed in 2.0.7-3 (CVE-2019-16930 tracked related bug). Cure53 stealth-address audit (2023) found a low-severity timing leak in ECDH modulo operation.
- Sources: https://crypto.stanford.edu/timings ; https://cure53.de/audit-report_stealth-address.pdf
- Prevention: constant-time scalar ops; do not expose viewing keys to relay network; no timing-observable decryption branch.
- GhostPay control/test: packages/solana-stealth and EVM stealth code: constant-time ECDH test (dudect-style); relayer must not see viewing key; test that scan is client-side only.

## 6. Gaps (not researched in this pass)
- Payment processor incidents (card/crypto gateways): not searched.
- Silk Road, Tornado Cash legal status: only secondary, not verified.
- Rainbow Book / government hardening: separate research task.
- Solana-specific account-validation bugs beyond Wormhole: not searched.
- Official Ronin, Bybit/Safe, Ledger, Bitfinex post-mortems: read only via secondary coverage.

## 7. Priority controls for GhostPay (from above)
1. Threshold/key separation and no single operator controlling quorum (Ronin, Harmony, Bitfinex).
2. Independent limit guard on relayer signing (Coincheck, Bitfinex, Binance).
3. Exact-amount approvals and strict CSP/SRI on apps/web (BadgerDAO, Bybit, Ledger).
4. Dependency provenance and locked installs (Ledger Connect Kit).
5. Contract invariants: zero trusted root, sysvar/precompile checks, no arbitrary cross-chain calls (Nomad, Wormhole, Poly).
6. Address-poisoning guard in packages/address-safety (2025 $50M case).
7. Log minimization and dev/prod isolation (Hansa, AlphaBay).
8. Constant-time stealth ECDH and client-only scanning (Stanford, Cure53).
