# Independent Tor hosting QA

Reviewer: `tor_qa`, delegated by the Tor completion coordinator.
Date: 2026-11-19 (America/Los_Angeles).
Scope: local functional/configuration checks and read-only review of the static
Tor recipe, hosting-kit changes, browser fixture and validation workflow. No
deployment, live Tor connection, public onion identity or real funds were used.

## Source boundaries

- Starting main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Reviewed origin repair: `373dabba4c88fc0081777752ed8fb064a0a2f60c`.
- Tested hosting-kit tree: `97f757533d85703c2a17835b12bcc3663fc0fe68`.
  It was unchanged between that repair and the subsequent browser-fixture commit.
- Final recipe source reviewed: `e37f2e449d013a5233201540fee8acf6905ebd20`.
- Final browser fixture reviewed: `2509540fdd9c5f1e428fb97fe05ef860ba38936a`.
- Final workflow trigger repair reviewed: `71918fdaa8ffb071b72a70afe1a329c6d3ace334`.

No additional functional or configuration blocker was established in these
reviewed changes. This is a scoped source assessment, not a deployed-service or
whole-product security qualification.

## Independently executed checks

Runtime: Node 24.22.3, with the system POSIX shell and `dpkg` used by the bounded
runtime-report tests. Commands and outcomes:

| Command / working directory | Outcome |
|---|---|
| `node --test --test-concurrency=2 'test/**/*.test.mjs'` in `tools/portable-hosting-kit` | 302 tests: 287 passed, 0 failed, 15 skipped; 18.1 seconds |
| `node --test scripts/tor/hosting-config.test.mjs` at the stable pre-final recipe checkpoint | 10 tests: 9 passed, 0 failed, 1 skipped; 3.16 seconds |
| `git diff --check` | Passed |

The full-kit skips were absent Tor, i2pd, Docker Compose and Java I2P tools;
opt-in Chromium and Docker executions; unavailable nginx checks; and an unbuilt
net-transport comparison. The recipe skip was actual combined Docker Compose
model validation because Compose was unavailable.

The recipe suite preceded the final `_headers` refusal and nested README
corrections. Those narrow additions were subsequently source-reviewed here; the
coordinator reports its separate final suite as 10 passed and 1 Compose skip.
That later execution is coordinator evidence, not an independent rerun by this
reviewer. The coordinator also separately ran the built net-transport comparison.

Original local log fingerprints:

| Log | SHA-256 |
|---|---|
| `tor-independent-kit-tests.log` | `2a43c92d1248eef09434be1621683782cbe3fdfddc4ea8773ca2c09ab84c462d` |
| `tor-independent-recipe-tests.log` | `b17be1c145623f4da9db847f5e7984f2be900ab8dcf0484881f7be68107fedf4` |

## Review findings and disposition

The recipe tests covered static-byte preservation, expected archive hash checks,
failure without output on mismatches, preservation of existing destinations,
regular-file inputs, onion configuration validation, explicit subpath acceptance,
source verification before compilation, build-context exclusions, version/PoW/GPL
report validation and startup-script parsing.

The final `_headers` requirement checks the kit's verified private artifact copy.
Generation checks the expected archive SHA-256 again, so the header-presence check
cannot authorize a different archive. The recipe does not replace the signed
deployment-manifest trust path or enable payments.

The generated nested Tor README originally retained generic two-file Compose
instructions. The reviewer requested a consistent three-file command. The final
recipe replaces that README and explicitly requires `compose.onion.yaml`, which
removes host-published web ports and the web publishing network.

The initial workflow path filters omitted direct build inputs. The reviewer
requested their inclusion. Commit `71918fda` adds the root manifest, base TS
configuration, workspace manifests/TS configurations and workspace build script
to both PR and main-push filters.

The workflow keeps read-only repository permissions and no deployment/signing
credentials. Its container stage checks the combined Compose model, builds the
pinned Tor source, checks runtime capabilities, starts only the local static web
server and runs Tor's configuration verification. The source contains no Tor
bootstrap command in the validation job. Runtime execution remains a hosted gate.

The browser fixture uses the actual packaged app, two loopback origins and root/
subpath variants. It checks headers, WebCrypto, storage separation, saved Tor
preferences, an unavailable same-origin hash read, and local synthetic key
generation. Its HTTP(S) interception is context-wide and WebSocket attempts fail
acceptance. The fixture explicitly excludes browser/extension traffic from its
claims and is not Tor Browser or live onion evidence.

## Unverified boundaries

This reviewer did not build/run Docker, run the final Chromium fixture, launch
Tor, create an onion identity, contact a public RPC or onion service, use Tor
Browser, or execute an external-wallet/payment flow. Local source review cannot
clear those gates. Keep image/runtime, current Tor Browser and real onion
acceptance separate from the passing local tests and from queued hosted checks.
