# Tor static-hosting checkpoint — November 19, 2026

## Result

Implementation and source hardening are published in [PR #308](https://github.com/djshellshoxxx/GhostPay/pull/308).
This remains a **draft qualification candidate**. Live Tor Browser/onion acceptance is not met;
no deployment or whole-product security certification is claimed.

Local runtime source `2509540fdd9c5f1e428fb97fe05ef860ba38936a` and published source
`14a7526842b3cb055452b721d237a7e68813ff0c` have identical complete Git tree
`bf80afd348c3902de989edfecb7eca882b198e31`. Base main is
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`. Git fetch independently read the published
tree back. The connector was used because CLI Git had no write credential; original local
commit provenance is preserved in the published message. Later changes are the workflow
input-filter correction `71918fda` and documentation/evidence only.

## Delivered behavior

- Canonical HTTP v3 onion-origin validation checks version/checksum at the config,
  direct Tor-generator and Onion-Location boundaries. Known origins match virtual port 80;
  unknown origins retain custom ports. Existing I2P behavior is preserved.
- The static recipe requires a regular archive, independent expected SHA-256, packaged
  `_headers`, and fresh output directory. It preserves static bytes and application trust data.
- Generated hosting has only web and Tor. The mandatory third Compose file removes
  host-published ports; web stays on the internal network. Tor alone has egress. Identity
  material stays in a private named volume outside served files and image contexts.
- Tor 0.4.9.17 source is hash-checked before extraction/compilation. Build/startup checks
  require supported stable Tor and PoW/GPL capability. Startup checks non-root ownership,
  0700 data permissions and torrc. Read-only root, dropped capabilities and resource bounds remain.
- The ordinary-browser runner covers two loopback origins/subpaths, headers, WebCrypto,
  isolated storage, saved Tor preferences, unavailable integrity reads without fallback,
  and synthetic local key generation. Context HTTP routes and WebSocket refusal bound
  observed traffic. It does not prove Tor routing or browser/extension traffic.
- The hosted job retains whole-web typechecking and adds browser/compiled-container
  acceptance. Tor invocations check runtime/configuration only; no onion bootstrap occurs.

The Pages HTTPS-origin guard, application RPC selections, custody, contracts and existing
release gates are unchanged. Operator instructions: `deploy/tor-static/README.md`.

## Executed evidence

| Check | Actual result |
|---|---|
| Full hosting-kit native suite | 302 tests: 287 passed, 0 failed, 15 environment/opt-in skips. |
| Final static recipe suite | 11 tests: 10 passed, 0 failed, 1 Docker Compose skip. |
| Previously skipped onion cross-package comparison after library build | 1 passed, 0 skipped. |
| Release/manifest/scan-privacy/browser-invariant unit suites | 103 passed across four files. |
| Hosting-kit lint and types | Passed. |
| Preparation code lint and strict checkJs | Passed in implementation worker; source independently reviewed. |
| Lean Vite build | Passed; 825 modules transformed; existing chunk warnings retained. |
| Bundle scanner | Passed, 17 files. |
| Actual artifact validation, packaging and Tor preparation | Passed with `_headers` preserved. |
| Web-workspace npm audit, production-only and including dev | Both reported zero known vulnerabilities. |
| Secret/action-reference, syntax and diff checks | Passed; existing scanner exclusions retained. |

Logs and hashes are indexed in `EVIDENCE.json`. The local unsigned artifact's build-info
commit is `2705e88c`; later changes do not alter app/library source. Its archive SHA-256 is
`f8dfa738b7ba2f2aa58c36479cbbf0f8037c1b94ba213b73b2d4ab01dfceac6a`.
The locally computed fixture digest proves byte binding only; operators need independent
expected release hashes. No signed deployment manifests were bundled, so this is not a
payment-enabled production release.

## Failed attempts and unresolved gates

1. Two full-workspace offline installs were killed (137). Temporary identical-lock dependency
   reuse lacked a library. The final clean, frozen, scripts-disabled web-workspace install
   succeeded with a 384 MiB Node heap: `npm ci --workspace @ghostpay/web --include-workspace-root
   --ignore-scripts --offline --no-audit --no-fund`.
2. Library builds completed. Whole-web TypeScript/build was killed (137). A 640 MiB typecheck
   reported heap exhaustion (134); an 832 MiB attempt was killed (137). No whole-web typecheck
   pass is claimed. Vite built separately; CI retains the original typecheck gate.
3. Chromium aborts before application assertions: `socket() failed: Operation not permitted (1)`.
   No local browser pass or network trace exists. Docker, Tor and nginx are unavailable locally.
4. No actual onion service, Tor Browser, external wallet, public RPC or real-chain payment
   was exercised. No onion identity/service was created. Source/tests are not daemon acceptance.
5. Upstream checksum/signature bodies could not be retrieved here. Buildroot's primary
   packaging patch corroborates the hash and links the official checksum. No upstream
   signature verification or successful image build is claimed.

Initial hosted runs were queued at this checkpoint:
[CI](https://github.com/djshellshoxxx/GhostPay/actions/runs/44688153829),
[Hosting kit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44688153820), and
[Tor static hosting](https://github.com/djshellshoxxx/GhostPay/actions/runs/44688153939).
Read live state; later documentation heads can create newer runs.

## Independent review

Separate QA executed the native suites; its source-pinned record is `INDEPENDENT_QA.md`.
Separate security review covered strict origins, hash checks, identity storage, runtime
requirements, topology and no-bootstrap CI. No remaining blocking source defect was established.
It found missing WebSocket coverage; `2509540f` repaired it and was independently re-reviewed.
QA found generic two-file Compose instructions and missing workflow trigger inputs; both were
repaired. These bounded reviews do not constitute a professional whole-system audit.

Preparation assumes a trusted operator filesystem. Concurrent creation of an empty output
directory is outside its guarantee; nonempty existing deployments are not replaced.

## Next acceptance actions

1. Require successful exact-source hosted types, browser assertions, effective Compose parsing,
   source-image build and Tor runtime/configuration. Fix failures without weakening gates.
2. On an operator-controlled host, review activation, record image digest/Tor version, and
   retain the identity volume/project name across updates.
3. Test current Tor Browser on the actual onion origin: WebCrypto, key backup/recovery,
   same-origin resources, preference retention and wallet/RPC disclosures. Record real traffic
   and unavailable-path behavior using test assets. Keep live/payment acceptance distinct.

## Primary references checked

- https://spec.torproject.org/rend-spec/encoding-onion-addresses.html
- https://community.torproject.org/onion-services/advanced/dos/
- https://forum.torproject.org/t/security-release-0-4-9-17/22454
- https://security-tracker.debian.org/tracker/source-package/tor
- https://lists.busybox.net/pipermail/buildroot/2026-November/816677.html
