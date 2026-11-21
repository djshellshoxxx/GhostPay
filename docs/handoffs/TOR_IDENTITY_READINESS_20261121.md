# Offline Tor identity startup readiness

Base: `313cea93d727a4ed620a69de6733a2bdff433400` (PR #363).
Worker: `/root/tor_security_review`; coordinator: `/root`.

## Finding and repair

The identity helper stopped its private offline Tor process immediately after
the derived hostname appeared. Tor writes that hostname while applying its
configuration, before its main loop installs signal handlers. A process can
therefore receive default-action SIGTERM before its clean shutdown handler is
ready. The helper correctly refused the nonzero exit, but legitimate first-use
initialization or identity verification could fail because of that timing.

The repair requires both the derived hostname and Tor's fixed NOTICE message
`Bootstrapped 0% (starting): Starting` in the private process log before sending
SIGTERM. The existing 150-poll bound remains. Successful process termination,
private file checks, the configured hostname comparison and unchanged-key byte
comparisons remain mandatory. The startup marker is not a network bootstrap
claim: `DisableNetwork 1`, numeric loopback targets and disabled listeners remain
in the isolated configuration. No control endpoint was added. Logs remain
private and are removed by the existing cleanup.

No arbitrary product delay or acceptance of exit 143 was introduced. A missing
marker, a failed process or a nonzero shutdown still refuses activation and
preserves existing identity files. A future Tor version that changes its
startup notice will fail this check until its behavior is reviewed and tested.

## Primary-source basis and limit

The official generated Tor source documentation shows this order:

1. [`tor_init()` in `main.c`](https://tpo.pages.torproject.net/core/doc/tor/main_8c_source.html)
   calls `options_init_from_torrc()` (source line 622).
2. [`options_act()` in `config.c`](https://tpo.pages.torproject.net/core/doc/tor/config_8c_source.html)
   calls `hs_service_load_all_keys()` (source line 2275).
3. [`load_service_keys()` in `hs_service.c`](https://tpo.pages.torproject.net/core/doc/tor/hs__service_8c_source.html)
   derives and writes the hostname from the loaded service public key.
4. `run_tor_main_loop()` subsequently calls `handle_signals()` (source line 1274)
   and then `control_event_bootstrap(BOOTSTRAP_STATUS_STARTING, 0)` (line 1291).
5. [`control_bootstrap.c`](https://tpo.pages.torproject.net/core/doc/tor/control__bootstrap_8c_source.html)
   maps the starting state to `starting` / `Starting` and emits the fixed notice.

These retrieved documentation pages identify their version as
`0.5.0.0-alpha-dev`; they support the inspected ordering, not exact-version
runtime proof for the pinned `0.4.9.17` image. Actual execution of the pinned
image remains required. Docker and a real Tor binary were unavailable locally.

Hosted run `44868708242` failed its first explicit initialization at the base
commit. That failure's cause is still unconfirmed: its original report did not
include a bounded diagnostic. The independently reproduced startup race is
repaired here; the next hosted run must qualify the patched image and identify
any remaining failure without exporting private logs or keys.

## Executed regression and validation evidence

The final regression suite was run against an exact copy of the base helper
from `git show 313cea93:deploy/tor-static/identity-check.sh`, without modifying
the candidate source. It failed in two independent ways: an early hostname
caused premature termination; a zero-exit process with complete temporary
identity files but no startup notice was incorrectly accepted. Node reported
16 passed, 3 failed (including the parent of the failed subtest), 1 skipped.

The corrected source passed this focused command:

```sh
node --test scripts/tor/hosting-config.test.mjs scripts/tor/identity.test.mjs \
  tools/portable-hosting-kit/test/config/host-config.test.mjs \
  tools/portable-hosting-kit/test/adapters/tor.test.mjs \
  tools/portable-hosting-kit/test/serve/headers.test.mjs
```

Result: **75 passed, 0 failed, 2 explicitly skipped**. The skips identify absent
Docker Compose and the actual Tor binary. Deterministic doubles test process
orchestration; they do not qualify Tor key loading or container behavior.
The new cases cover delayed readiness, an absent marker despite successful
termination, failure before readiness and nonzero shutdown after readiness.
They exercise both initialization and verification and check retained bytes,
empty failed initialization state and absence of synthetic private output.

`sh -n deploy/tor-static/identity-check.sh`, `node --check` for the modified test,
and whitespace validation passed. Supplemental ESLint recommended JavaScript
rules with Node's `process` and `URL` globals passed with zero warnings or
errors; the repository's typed project-service configuration excludes these
standalone scripts, so no repository-wide typed-lint result is claimed here.

| Evidence | SHA-256 |
| --- | --- |
| `/tmp/ghostpay-tor-readiness-red-expanded.log` | `fcb7cf5a9f03442e26dc0a2e80901613cd70c3c5be5d666eb7a79fdf4d49d13f` |
| `/tmp/ghostpay-tor-readiness-green-final.log` | `931f170dcaf2a46f4afcffebcdf465f454887d4933909b636b6e45f03a73174f` |

Candidate product/test Git blobs:

- `deploy/tor-static/identity-check.sh`: `a7b0c89e2d9d062ca1468c3f283e4050d076d771`.
- `scripts/tor/identity.test.mjs`: `b90969ae249d25188969e4ba963e8448800cd050`.

The independent startup-race reviewer inspected these exact product/test blobs
and reran the new regression groups (5 passed, 0 failed), including the requested
zero-exit/no-marker case. No blocking source finding was identified. Hosted CI
and integration ownership remain coordinator-managed gates.
