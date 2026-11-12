# Tor v3 onion service profile

`src/adapters/tor.mjs` turns a validated host configuration into tor configuration files plus a short
generated README. It is a **pure generator**: it never starts tor, never creates, copies or reads keys or
directories, and never touches system configuration. An operator reviews the output and activates it by hand.

All sources were retrieved on **2026-10-27**; they are listed per directive family in [Sources](#sources).
Anything not confirmed in a fetched source or by running a tool is marked **unverified**.

## API

```js
generateTorProfile({
  hostConfig,          // HostConfig with transport "onion"
  hiddenServiceDir,    // absolute path; identity directory (see "Identity")
  target,              // "host-listener" | "compose-service"
  virtualPort,         // onion-side port, default 80
  instance,            // { mode: "system" } (default) | { mode: "dedicated", dataDirectory } | { mode: "container", baseImage? }
  powDefense,          // true (default) | false | { queueRate, queueBurst }
  forbiddenRoots,      // absolute site / export / archive directories
}) -> { files: [{ name, data: Uint8Array }], warnings: string[] }
```

| Mode | Files | Use when |
|---|---|---|
| `system` | `tor/onion-service.torrc`, `tor/README-TOR.md` | A packaged tor already runs on the host; the fragment is added with `%include`. |
| `dedicated` | `tor/torrc`, `tor/README-TOR.md` | A separate tor process only for this service (`SocksPort 0`, `ControlPort 0`, own `DataDirectory`). |
| `container` | `tor/torrc`, `tor/Dockerfile`, `tor/compose.tor.yml`, `tor/README-TOR.md` | Tor runs as a sibling container next to the container profile's `web` service. |

Errors are `KitError`s: `E_CONFIG` (wrong transport, malformed host config), `E_PATH` (unsafe path, overlap with a
forbidden root), `E_UNSUPPORTED` (management port as target, impossible topology), `E_NETWORK_SCOPE` (non-loopback
listener), `E_USAGE` (bad arguments).

## Network namespaces: which target is reachable

`127.0.0.1` means "this network namespace". Inside a container it is that container only.

| Tor runs | Web server runs | Target | Generated `HiddenServicePort` |
|---|---|---|---|
| on the host (system or dedicated) | on the host | `host-listener` | `80 127.0.0.1:<port>`, `80 [::1]:<port>` or `80 unix:/path` |
| on the host | in a container, port published on host loopback (`127.0.0.1:8080:8080`) | `host-listener` with `listen` = the published port | `80 127.0.0.1:8080` |
| in a sibling container on the compose network `site_internal` | `web` container | `compose-service` | `80 web:8080` |
| on the host | in a container, port not published | refused (`E_UNSUPPORTED`): a host tor cannot resolve or reach a compose service name |
| in a container | "127.0.0.1" | refused (`E_UNSUPPORTED`): that would be the tor container itself |

Notes for the container topology:

- tor resolves the target host name **once, while parsing its configuration** (`hs_parse_port_config()` calls
  `tor_addr_port_lookup()`, which uses the system resolver). Observed with tor 0.4.9.11: with no resolvable `web`,
  `--verify-config` fails with "Unparseable address in hidden service port configuration". The compose override
  therefore uses `depends_on: web (service_started)`. If the `web` container is recreated with a new address,
  restart the tor container.
- The container profile may make `site_internal` an `internal: true` network. Tor needs egress to the Tor network,
  so the override adds a second network, `tor_egress`, to the tor service only. No ports are published.
- In compose, relative paths in an override file resolve against the directory of the **first** `-f` file
  (observed with `docker compose config`, Compose v5.6.1). Run from the directory that contains both the container
  profile's compose file and `tor/`.

## What is generated, and why

Per-service options must follow `HiddenServiceDir` (tor manual, "per service options").

| Directive | Value | Reason / source family |
|---|---|---|
| `HiddenServiceDir` | operator path | Identity directory; tor creates it (0700) and the keys on first start. [T-MAN], [T-SETUP] |
| `HiddenServiceVersion` | `3` | Only version 3 is supported; written explicitly so tor never inspects existing keys to guess. [T-MAN] |
| `HiddenServicePort` | `<virt> <target>` | `addr:port`, `[ipv6]:port` or `unix:path`. [T-MAN], [T-SETUP] |
| `HiddenServiceEnableIntroDoSDefense` | `1` | Rate limit at the introduction points; protects the network and the host. Off by default in tor. [T-MAN], [T-DOS] |
| `HiddenServiceEnableIntroDoSRatePerSec` / `BurstPerSec` | `25` / `200` | tor's documented defaults, written explicitly. [T-MAN] |
| `HiddenServicePoWDefensesEnabled` | `1` (default) or `0` | Adaptive proof-of-work; puzzle is disabled when the service is not overloaded. Off by default in tor. [T-MAN], [T-DOS], [T-POW] |
| `HiddenServicePoWQueueRate` / `QueueBurst` | `250` / `2500` (default) | tor's defaults; tor rejects burst < rate (`hs_config.c`), so the generator does too. [T-MAN], [T-SRC] |
| `HiddenServiceMaxStreams` | `32` | Kit choice (tor default 0 = unlimited). A browser opens only a handful of parallel connections per site. [T-MAN], [T-DOS] |
| `HiddenServiceMaxStreamsCloseCircuit` | `1` | Close circuits that exceed the cap. [T-MAN], [T-DOS] |
| `DataDirectory` | dedicated/container only | The instance's own state. [T-MAN] |
| `SocksPort 0`, `ControlPort 0` | dedicated/container only | No client SOCKS port, no control port on a publishing-only instance. [T-MAN] |
| `RunAsDaemon 0`, `Log notice stderr`, `SafeLogging 1` | dedicated/container only | Foreground under a supervisor; scrubbed logs. [T-MAN] |

Never generated: `HiddenServiceSingleHopMode` / `HiddenServiceNonAnonymousMode`. The manual describes them as
"Experimental - Non Anonymous": single onion servers are "easily locatable". [T-MAN]

PoW requirements: tor >= 0.4.8 with the `pow` module (`tor --list-modules` shows `pow: yes`), and the Equi-X/HashX
puzzle libraries are only enabled when tor is built with `--enable-gpl` (`tor --version` then prints "covered by
the GNU General Public License"). If the module is missing, tor refuses the configuration (`hs_config.c`:
"this build of tor does not include the required 'pow' module"). Then pass `powDefense: false`. [T-DOS], [T-SRC]
The test machine's Ubuntu 24.04 package `tor 0.4.9.11-0ubuntu0.24.04.1` shows `pow: yes` and the GPL line.

### Tor version

Use tor **0.4.9.x or newer**. The Tor Project announced that 0.4.8 and earlier stop working on the network after
the target date of 2026-09-01. [T-SUNSET] Debian ships 0.4.9.11 to trixie and bookworm through the security
archive (`0.4.9.11-0+deb13u1`, `0.4.9.11-0+deb12u1`). [T-DEB] The Debian tracker lists CVE-2026-87724 (remote
crash, fixed in 0.4.9.12) as open for trixie on the retrieval date: keep tor updated. [T-DEB]

## Identity: location, permissions, backup

- `hiddenServiceDir` must be an absolute, normalized path using only `A-Z a-z 0-9 . _ - /` (so it cannot inject
  torrc lines), and it must not equal, contain or lie inside any `forbiddenRoots` entry (site, export, archive
  output). The comparison is lexical; the generator does not resolve symlinks, so do not point a symlink from a
  site directory into the identity directory.
- Tor writes `hostname`, `hs_ed25519_public_key`, `hs_ed25519_secret_key` (file prefix `hs_ed25519` in
  `hs_service.c`) and, if client authorization is used, `authorized_clients/`. [T-SRC] (The tor manual's FILES
  section and the community setup page still name the old v2 file `private_key`.)
- The directory must be owned by the user tor runs as, mode 0700. Observed: `--verify-config` rejects a 0755
  directory ("Permissions on directory ... are too permissive").
- **Backup**: stop tor or copy atomically; copy the three files to offline, encrypted storage with restrictive
  permissions. Restoring them on another host keeps the same `.onion` address. Anyone holding
  `hs_ed25519_secret_key` can impersonate the site ("If your keys leak, other people can impersonate your Onion
  Service"). [T-SETUP]
- **Never** add identity files to a site bundle, archive, repository, container image or build context. The kit's
  inclusion policy additionally denies `hs_ed25519_secret_key` (`tor-onion-identity` rule), but that is a last line
  of defence, not the mechanism.
- Container mode: the identity lives in the named volume `tor-data` at `/var/lib/tor/hidden_service`
  (`hiddenServiceDir` must be inside `/var/lib/tor/`). Back it up with e.g.
  `docker compose cp tor:/var/lib/tor/hidden_service ./onion-identity-backup` and move that copy offline.

## Never expose management ports

The generator refuses a target port that is a well-known Tor management port: 9050 (SocksPort default), 9051
(conventional ControlPort), 9150/9151 (Tor Browser). Targets on well-known I2P management ports produce a warning.
Never publish SocksPort, ControlPort, MetricsPort, router consoles, I2PControl or SAM as a website, and never point
`HiddenServicePort` at them. The manual warns that a ControlPort without authentication lets "any process on the
local host" control tor. [T-MAN]

## Installing (operator, by hand)

**System tor (Debian/Ubuntu package).** `/etc/tor/torrc` has no include directory by default. Add
`%include /etc/tor/torrc.d/*.conf` and copy the fragment there. Validate exactly as the packaged unit does
(`ExecStartPre` of `tor@default.service`):
`sudo tor --defaults-torrc /usr/share/tor/tor-service-defaults-torrc -f /etc/tor/torrc --verify-config`, then
`sudo systemctl reload tor`. The packaged unit confines tor with the AppArmor profile `system_tor`, which allows
writes only below `/var/lib/tor/` (observed in Ubuntu's `/etc/apparmor.d/system_tor`); the generator warns when
`hiddenServiceDir` is elsewhere. Whether AppArmor also blocks a `unix:` target outside `/run/tor/` is
**unverified** at runtime; the profile does not list such paths.

**Dedicated instance.** Run as a dedicated unprivileged user, `tor -f /path/to/torrc`, under a supervisor of your
choice. `DataDirectory` and `HiddenServiceDir` owned by that user, mode 0700.

**Container.** Review `tor/Dockerfile` (Debian `trixie-slim` pinned by digest; installs Debian's `tor`), the
override and the torrc. Validate with `docker compose -f <container compose file> -f tor/compose.tor.yml config`.
The digest pins the base image only: `apt-get` installs whatever `tor` package is current at build time, so the
image is not bit-reproducible. After building, check `tor --version` inside the image (>= 0.4.9, GPL line for PoW).
`DEFAULT_TOR_BASE_IMAGE` is the index digest observed with `docker buildx imagetools inspect debian:trixie-slim` on
2026-10-27; it was not built, scanned or run.

The onion address is in `<HiddenServiceDir>/hostname` after tor's first start. Publish it through a signed
channel; see limits below.

## Honest limits

- **Onion hosting does not anonymize the app's behaviour.** It hides the server's location and the visitor's IP
  from the server. Wallet extensions talk to their own RPC providers; RPC requests the app makes go wherever they
  are configured; public-chain transactions and their metadata are public. None of that is changed by serving the
  bundle over Tor (see `docs/remote/onion-i2p-research.md`, section 2.6).
- **Secure contexts.** By the W3C algorithm `http://*.onion` is not a potentially trustworthy origin, so stock
  browsers withhold secure-context APIs (`crypto.subtle`, `navigator.clipboard`, service workers). Tor Browser
  carries patches that treat `.onion` documents as secure contexts (Tor Browser bugs 21321 and 23247, Mozilla bug
  1382359 behind `dom.securecontext.allowlist_onions`). [TB-SC] This was **not tested** on a current Tor Browser
  release; test the app's WebCrypto and clipboard paths there before relying on it.
- **Separate origins.** The onion mirror is a different origin from the clearnet site and from any other mirror:
  local storage, IndexedDB, wallet-site permissions and saved settings do not carry over. Tell users.
- **No silent clearnet fallback.** The onion mirror must not redirect to, or load resources from, clearnet hosts.
  If something is unavailable over Tor, fail visibly.
- **Trust.** A v3 address authenticates the server key, not the bundle. Onion-Location on a clearnet site makes
  that site the trust anchor for the address; publish the address in signed release material as well. The host
  operator remains a trust point.

## Validation performed

Ran on 2026-10-27 in the kit's test environment (`test/adapters/tools.test.mjs` repeats it on every `npm test`;
tests skip with a reason when a tool is missing):

- `tor 0.4.9.11 --defaults-torrc <empty> --verify-config -f <file>` with all paths in a temp dir, for the dedicated
  torrc, a no-PoW variant with an IPv6 target, the system fragment through a `%include` wrapper with a `unix:`
  target, and the container torrc (with `web:8080` replaced by `127.0.0.1:8080` and paths moved into the temp
  dir): all "Configuration was valid". `HiddenServiceDir` and `DataDirectory` were **not created**, no keys were
  written, and tor exited by itself (no tor process left). Control: a burst smaller than the rate is rejected.
- Manually, inside `unshare -n` with a private mount namespace: the unmodified container torrc fails when `web`
  does not resolve and passes when a bind-mounted temporary `/etc/hosts` maps `web` (the host's `/etc/hosts` was
  not changed).
- `docker compose -f <stand-in base> -f tor/compose.tor.yml config --format json` (Compose v5.6.1; no daemon
  needed): accepted; `tor` is on `site_internal` + `tor_egress`, publishes no ports, read-only, `cap_drop: ALL`.
  The stand-in base file only defines `web` and an internal `site_internal`, because the real container profile
  is built by another module. No `up`, `build` or `pull` was run.

## Sources

| ID | Directive family | Source (retrieved 2026-10-27) |
|---|---|---|
| T-MAN | All torrc directives, defaults, per-service ordering, single-hop warnings, `%include`, `--verify-config` | tor manual `doc/man/tor.1.txt` at tag `tor-0.4.9.11` (commit f3d28b2e), https://gitlab.torproject.org/tpo/core/tor.git |
| T-SRC | Key file names, verify-mode does not create the dir, PoW validation, host name resolution of targets | tor 0.4.9.11 source: `src/feature/hs/hs_service.c`, `hs_config.c`, `hs_common.c`, `src/lib/net/resolve.c` (same tag) |
| T-SETUP | `HiddenServiceDir`/`HiddenServicePort` usage, unix-socket tip, key secrecy | https://community.torproject.org/onion-services/setup/ |
| T-DOS | Intro DoS, PoW, stream limits, `--list-modules`, `--enable-gpl` | https://community.torproject.org/onion-services/advanced/dos/ |
| T-POW | PoW behaviour and example configuration | https://onionservices.torproject.org/technology/security/pow/ (search excerpt) |
| T-SUNSET | 0.4.8 sunset date | https://blog.torproject.org/sunsetting-tor-048/ |
| T-DEB | Debian tor versions, open CVE | https://sources.debian.org/src/tor/ , https://tracker.debian.org/pkg/tor |
| TB-SC | Tor Browser secure-context patches | https://bugzilla.mozilla.org/show_bug.cgi?id=1382359 , tbb-commits "Bug 23247: Communicating security expectations for .onion" (lists.torproject.org) |
| PKG | Debian/Ubuntu unit, defaults torrc, AppArmor profile | installed package `tor 0.4.9.11-0ubuntu0.24.04.1`: `/lib/systemd/system/tor@default.service`, `/usr/share/tor/tor-service-defaults-torrc`, `/etc/apparmor.d/system_tor` |

## Corrections to existing repository material

- `docs/remote/onion-i2p-research.md` 1.1 marks the key file names as unverified: they are `hostname`,
  `hs_ed25519_public_key`, `hs_ed25519_secret_key` (tor source). The tor manual FILES section and the community
  setup page still mention the v2 name `private_key`.
- Research 1.4 / 4.6: PoW packaging "unverified" — the Ubuntu 0.4.9.11 package has `pow: yes` and a GPL build.
  Debian trixie/bookworm now ship 0.4.9.11 via security updates.
- Research 1.8: Tor Browser's secure-context behaviour is no longer without evidence (Tor Browser patches above),
  but it is still untested on a shipping release.
- Research and `deploy/` predate the 0.4.8 sunset: any tor < 0.4.9 no longer works on the network.
- `deploy/tor/torrc`: no PoW / intro DoS / stream limits; `web:8080` is resolved once at startup (restart tor if
  `web` gets a new address).
- `deploy/tor/Dockerfile`: the base defaults to the unpinned tag `debian:bookworm-slim` (only a comment asks for a
  digest); `ca-certificates` is unnecessary for tor.
- `infra/publish/torrc.example`: `Log notice file /dev/null` discards all logs including errors; it also lacks the
  DoS options.

## Unverified

- Real reachability of a generated onion service (nothing was started).
- Runtime behaviour of the container image (not built; Debian trixie's tor version, `pow` module and GPL build
  inside it).
- Tor Browser secure-context behaviour for `http://*.onion` on a current release; Chromium-family behaviour.
- AppArmor effect on `unix:` targets for the packaged system tor.
- Whether `HiddenServiceMaxStreams 32` is ever too low for a real page load.
