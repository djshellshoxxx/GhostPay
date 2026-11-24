# Timestamp-retention static-hosting fixture recovery

## Source and correction

This continuation completes the stale confirmation-message repair blocking PR #587's static-hosting browser stage. The original retention implementation and branch remain intact.

- Parent: https://github.com/djshellshoxxx/GhostPay/pull/587 at `19a11f90db0bcf84c94a0b883a310e103ce8878a`.
- Child: `resume/receipt-retention-tor-fixture-20261124`.
- Ownership checkpoint: `7d9452b7`; tested implementation: `b7d58ea2c9cc70af0219203ef7bfef77d6a8d03e`.
- Existing donor: #436 at `cbf6edbb5471dd085c233fdf0b8c35c6e4fc3362`.
- Corrected script blob: `9f6732a60662664617c623a3dca9c5644ed20c90`, byte-identical to that donor.

The parent failed at https://github.com/djshellshoxxx/GhostPay/actions/runs/45337165063/job/138251886114 while waiting for the obsolete scan-privacy confirmation. The current English catalog supplies the network-privacy confirmation used by Settings. The carried donor reads that source-catalog key, requires a nonempty string, and waits for the exact displayed confirmation after Save. It subsequently reloads and independently checks the persisted transport.

Only the browser fixture and additive documentation differ. No retention behavior, product source, dependency, workflow, timeout or browser assertion was removed. This child reuses the existing implementation.

## Executed qualification

| Check | Result |
| --- | --- |
| Script syntax and patch whitespace | Passed |
| Hosting configuration/header/adapter tests | 55 passed, 0 failed, 1 existing Docker Compose availability skip |
| Complete web typecheck and lean production build | Passed |
| Original CSP and bundle scan | Passed, 17 files |
| Hosting-kit validation | Passed, 17 files and 2,884,095 application bytes |
| Package and static Tor configuration preparation | Passed; no service started |
| Original static-hosting browser acceptance | Passed on `/` and `/mirror/ghostpay/` at separate origins |
| Repository secret scan | Passed |
| Independent source review | `/root/resume_payment_safety` verified donor-blob equality and found no blocking finding or weakened gate |

The browser retained rendering, CSP/headers, WebCrypto, origin-separated storage, persisted Tor preference, blocked external HTTP/WebSocket requests, failed integrity-read/no-fallback handling, and local synthetic key generation. Both origins recorded zero external request attempts. The browser report and full successful build/test output are preserved in `docs/qa/retention-587-20261124/qualification.json`.

Archive SHA-256: `0d1187139d607d64c3ff3fd0d0e2a9870a608ece029d7c2de85e552a36d0fd29`.
Content digest: `sha256:f133705aeb319f4288344325b6a455c3a858e10f045a2537349e3c261b205506`.
These hashes bind the tested local artifact; they are not independent publisher authentication.

## Environment and commands

```sh
node --check scripts/tor/browser-acceptance.mjs
node --test scripts/tor/hosting-config.test.mjs tools/portable-hosting-kit/test/config/host-config.test.mjs tools/portable-hosting-kit/test/adapters/tor.test.mjs tools/portable-hosting-kit/test/serve/headers.test.mjs
GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web
node tools/portable-hosting-kit/bin/ghostpay-host.mjs validate apps/web/dist
```

The existing hosting CLI packaged the application, and the unmodified `scripts/tor/browser-acceptance.mjs` accepted absolute archive/report paths. `GHOSTPAY_CHROMIUM` selected native Chrome for Testing Headless Shell 156.0.8078.4. Node was 24.22.3; no local Node 22 run is claimed.

The canonical dependency installation was privately copied from #569 after root package and lockfile equality checks; 646 installed versions matched. Sixty-four library dist directories (2,235 files) were reused only when each complete package source tree matched. The differing `ux-vault` package was rebuilt from this parent. Workspace links resolve into this checkout. Lockfile SHA-256: `1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.

## Remaining gates

The demonstrated browser-fixture failure is closed locally. Fresh hosted checks must qualify the public child. Docker Compose was unavailable: its existing configuration-model test skipped, and container image/runtime qualification was not executed locally. Ordinary Chromium on loopback does not establish live onion routing or Tor Browser support. No gate or accessibility rule was disabled; no shared merge, deployment, live Tor service or real-funds operation occurred.
