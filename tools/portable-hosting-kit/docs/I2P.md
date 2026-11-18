# I2P server tunnel profile (i2pd and Java I2P)

`src/adapters/i2p.mjs` turns a validated host configuration into an I2P HTTP server tunnel ("eepsite") for the
selected router, plus a short generated README. It is a **pure generator**: it never starts a router, never creates,
copies or reads keys, and never touches system configuration. An operator reviews and installs the output by hand.

i2pd and Java I2P are different programs with different file formats, locations, key handling and HTTP options.
The renderers are separate (`i2p-i2pd.mjs`, `i2p-java.mjs`). All sources were retrieved on **2026-10-27** and are
listed in [Sources](#sources). Unconfirmed points are marked **unverified**.

## API

```js
generateI2pProfile({
  hostConfig,       // HostConfig with transport "i2p"
  router,           // "i2pd" | "java-i2p"
  tunnelName,       // [A-Za-z0-9][A-Za-z0-9._-]{0,63}
  target,           // "host-listener" | "compose-service"
  keysFile,         // router-relative path ending in .dat, e.g. "ghostpay-site.dat"
  inport,           // I2P-side port for i2pd, default 80 (Java I2P accepts every I2P port; warning if given)
  forbiddenRoots,   // absolute site / export / archive directories
  routerDataDir,    // optional: absolute i2pd datadir / Java I2P config dir, enables the forbiddenRoots check
}) -> { files: [{ name, data: Uint8Array }], warnings: string[] }
```

| Router | Generated files |
|---|---|
| `i2pd` | `i2p/i2pd/tunnels.d/<tunnelName>.conf`, `i2p/README-I2P.md` |
| `java-i2p` | `i2p/java-i2p/i2ptunnel.config.d/90-<tunnelName>-i2ptunnel.config`, `i2p/README-I2P.md` |

Errors: `E_CONFIG` (wrong transport, malformed host config), `E_PATH` (unsafe key path, overlap with a forbidden
root), `E_UNSUPPORTED` (unix-socket listener, management port as target), `E_NETWORK_SCOPE`, `E_USAGE`.

## Targets and network namespaces

Both routers' server tunnels connect to a **TCP host:port**. Neither supports a unix-socket target: i2pd builds a TCP
endpoint from `host`/`port` (`ClientContext.cpp`, 2.49.0 and current master), Java I2P's `I2PTunnelServer` connects
to an `InetAddress` + port. A unix-socket listener is therefore refused with `E_UNSUPPORTED`: let the web server also
listen on `127.0.0.1:<port>`.

| Router runs | Web server runs | Target | host:port |
|---|---|---|---|
| on the host | on the host, or in a container with the port published on host loopback | `host-listener` | `127.0.0.1:<port>` / `::1` |
| in a sibling container attached to `site_internal` | `web` container | `compose-service` | `web:8080` (warning: only resolvable on that network) |

`127.0.0.1` inside a container is that container only. A router on the host reaches a containerized web server only
through a port published on host loopback. This kit does not generate an I2P router container.

## i2pd format

INI file in the tunnels directory (`tunnelsdir`; all `*.conf` files are loaded, `ClientContext.cpp` skips other
names). Debian/Ubuntu packages pass `--tunnelsdir=/etc/i2pd/tunnels.conf.d` (a symlink to `tunnels.d`) and run with
`--service`, so the datadir is `/var/lib/i2pd` (observed in the installed `i2pd 2.49.0-1build3` unit file). Defaults
otherwise: `~/.i2pd/tunnels.d` or `/var/lib/i2pd/tunnels.d`. [D-CONF] Comments are on their own lines: boost's INI
parser has no inline comments.

| Key | Value | Reason / source |
|---|---|---|
| `type` | `http` | HTTP server tunnel (rewrites `Host:`). [D-TUN], [D-SRC] |
| `host`, `port` | target | Mandatory. [D-TUN], [D-SRC] |
| `inport` | `80` (default) | I2P-side port; defaults to `port` if absent, so without it visitors would need `:8080`. [D-TUN], [D-SRC] |
| `keys` | `keysFile` | Mandatory for server tunnels. Created if missing. Resolved as `<datadir>/<keys>` by string concatenation (`FS.h DataDirPath`), so an absolute path is not honoured: keys are router-relative. A name starting with `transient` would create throwaway keys and is refused. [D-TUN], [D-SRC] |
| `signaturetype` | `7` | EdDSA-SHA512-Ed25519, i2pd's default, written explicitly. [D-TUN] |
| `inbound.length`, `outbound.length` | `3` | Default; "lower value is faster but have more deanonimize risks". [D-TUN] |
| `enableuniquelocal` | `false` | Default `true` maps every visitor to a distinct `127.x.y.z` source address (first 3 bytes of their ident hash): a per-visitor handle in web logs. Only applies to 127.x targets. [D-TUN], [D-SRC] |
| `i2pheaders` | `false` | Suppresses `X-I2P-DestHash`/`X-I2P-DestB64`/`X-I2P-DestB32`. **Only i2pd >= 2.59.0** ("Ability to suppress X-I2P-* headers"); older versions silently ignore the key and always send the headers. [D-TUN], [D-CHANGES] |
| `hostoverride` | `<b32>.b32.i2p` if known | `Host:` sent to the web server (default: the `host` value). [D-TUN] |

Inbound limits in i2pd: `i2p.streaming.maxConcurrentStreams` exists since 2.55.0 (default 2048) and
`i2p.streaming.maxConnsPerMinute` since 2.59.0 (default 0 = unlimited). The kit leaves them unset because the
targeted/tested i2pd 2.49 does not know them; set them yourself on current i2pd. [D-TUN], [D-CHANGES]
There is no i2pd option to reject inproxy traffic.

i2pd < 3.0.0 creates key files with the process umask (observed: `0644` with i2pd 2.49); 3.0.0 "Create keys files
readable by owner only". `chmod 600` the key file. [D-CHANGES]

## Java I2P format

Since 0.9.42 the router splits `i2ptunnel.config` into one file per tunnel in `i2ptunnel.config.d/`, and in split
files the properties are **not** prefixed with `tunnel.N.`. [J-SPEC] Confirmed in `TunnelControllerGroup.java`
(i2p.i2p master, commit b21f0c5e, 2026-10-25):

- only `*.config` files in `<config dir>/i2ptunnel.config.d/` are loaded, sorted by name; the router's own naming is
  `NN-<name>-i2ptunnel.config` (the kit uses `90-`);
- `loadConfig()` looks at the first key it iterates: if it starts with `tunnel.` the file is parsed as monolithic
  (`tunnel.N.` blocks), otherwise as one split tunnel. The generated file has no prefixed key at all. (The site's
  mirroring guide shows `tunnel.0.`-prefixed keys inside a `config.d` file; that parses only via the monolithic
  fallback and contradicts the spec.)
- the split directory is used only when the router's config dir differs from its install dir and the platform is
  not Android (`shouldMigrate()`); a portable install keeps the monolithic `i2ptunnel.config`. Then use the console
  wizard with the same values instead of this file.

Properties file rules (spec "General Format"): UTF-8, no escapes, `#` starts a comment anywhere, values are trimmed.
The kit strips `#` from the description and allows only safe characters elsewhere.

| Property | Value | Reason / source |
|---|---|---|
| `type` | `httpserver` | HTTP server tunnel. [J-SPEC] |
| `name`, `description` | tunnel name, mirror label | UI. [J-SPEC] |
| `targetHost`, `targetPort` | target | [J-SPEC] |
| `privKeyFile` | `keysFile` | "Absolute path or relative to config directory" (`TunnelController.filenameToFile`). Created if missing, **and a copy is written to `<config dir>/i2ptunnel-keyBackup/<b32>-<time>.dat`** (`TunnelController.createPrivateKey`). [J-SPEC], [J-SRC] |
| `spoofedHost` | `<b32>.b32.i2p` if known | `Host:` passed to the server; Java's default already is the b32 name. [J-SPEC], [J-SRC] |
| `startOnLoad` | `false` | The tunnel does not start until the operator enables it (set `true` after review). [J-SPEC] |
| `option.enableUniqueLocal` | `false` | Default false in Java; written explicitly. [J-SPEC] |
| `option.rejectInproxy` | `true` | Reject requests arriving via a clearnet inproxy: this is an I2P-only mirror. [J-SPEC] |
| `option.inbound.length`, `option.outbound.length` | `3` | Passed to I2CP (`option.` prefix stripped). [J-SPEC] |
| `option.i2p.streaming.maxConnsPerMinute/Hour/Day`, `maxTotalConnsPerMinute`, `maxConcurrentStreams` | `30/80/200`, `50`, `30` | Exactly the defaults `TunnelController` applies to a server tunnel without limits (`DEFAULT_MAX_*`). The HTTP server tunnel forces `Connection: close`, so every request is a new stream: raise them if page loads are refused. [J-SRC] |

Java's HTTP server tunnel **always** adds `X-I2P-DestHash`, `X-I2P-DestB64`, `X-I2P-DestB32` (no option) and strips
client-supplied copies (`I2PTunnelHTTPServer.java`). [J-SRC] Do not log these headers; nginx's default log format
does not. Never trust them on a web server that is reachable by any other path.

Not verified at runtime: Java I2P is not installed in the test environment, and it has no config-check mode.

## Identity: location, permissions, backup

- `keysFile` is relative to the router's data/config directory (i2pd ignores absolute paths, see above), must end in
  `.dat`, and may contain only `A-Z a-z 0-9 . _ -` segments without `.`/`..`. It therefore stays inside the router
  directory. Pass `routerDataDir` so the generator can check that this directory does not equal, contain or lie
  inside any `forbiddenRoots` entry (lexical comparison, symlinks not resolved); without it you get a warning.
- The key file **is** the I2P destination (private keys). Back it up offline and encrypted, with restrictive
  permissions. With Java I2P also secure or delete the automatic copy in `i2ptunnel-keyBackup/`.
- **Never** add key files to a site bundle, archive, repository, container image or build context. The kit's
  inclusion policy also denies every `*.dat` file and router directories (`i2p-destination-keys` rule) as a last
  line of defence, not as the mechanism.
- The b32 address: i2pd web console (127.0.0.1:7070, local only) or Java console tunnel page
  (127.0.0.1:7657/i2ptunnel/). Put it into `hostConfig.publicOrigin` and regenerate to set the Host header.

## Never expose management ports

Refused as targets (selected router): i2pd 7070 (web console), 4444/4447 (HTTP/SOCKS proxy), 7656/7655 (SAM),
7654 (I2CP), 7650 (I2PControl), 2827 (BOB) [D-CONF]; Java I2P 7657/7667 (console), 4444/4445 (proxies), 7650
(I2PControl), 7652/7653 (UPnP), 7654 (I2CP), 7655/7656 (SAM), 6668 (IRC proxy), 2827 (BOB), 7644/7647 (browser
mode) [J-PORTS]. Ports of the other router and Tor produce a warning. Java's 7658 (bundled eepsite web server) is a
website and allowed. Never publish consoles, proxies, I2CP, SAM or I2PControl as website ports.

## Honest limits

- I2P hosting does not anonymize wallet behaviour, RPC requests or public-chain transactions; it only hides who
  connects to the mirror and where the mirror runs (`docs/remote/onion-i2p-research.md` 2.6, 3.5).
- `http://*.b32.i2p` is not a potentially trustworthy origin under the W3C Secure Contexts algorithm, and no
  browser allowlist for `.i2p` is known (research 3.4; **unverified** for I2P-specific browser bundles). Expect
  `crypto.subtle`, `navigator.clipboard` and service workers to be unavailable; GhostPay features using them will
  fail on this mirror.
- Each mirror is a separate origin: storage, settings and wallet permissions do not carry over.
- No silent clearnet fallback: the mirror must not redirect to or load from clearnet; `rejectInproxy` (Java) keeps
  clearnet inproxies out.
- The server key authenticates the destination, not the bundle; the host operator remains a trust point.

## Validation performed

- i2pd 2.49.0 (Ubuntu package): started only inside `unshare -n` (no network), with a temp datadir and temp
  tunnels dir, all client services disabled, and killed with SIGKILL as soon as the log showed the tunnels were
  loaded (repeated by `test/adapters/tools.test.mjs`). Observed: "Tunnels extra config file: ...ghostpay-site.conf",
  "Disabling loopback address mapping" (`enableuniquelocal = false` honoured), "1 I2P server tunnels created", the
  unknown key `i2pheaders` silently ignored, the key file created as `<temp datadir>/ghostpay-site.dat` (mode 0644,
  confirming router-relative keys), and a control file without `port` rejected with "Can't read tunnel broken
  params: No such node (port)". As expected it also created router identity files (`router.keys`, `ntcp2.keys`,
  ...) in the temp datadir; the directory was deleted afterwards and no i2pd process remained.
- Java I2P: format checked against the configuration spec and `TunnelControllerGroup.loadConfig()` semantics with
  a small reader in `test/adapters/i2p.test.mjs`. **Not run.**

## Sources

| ID | Directive family | Source (retrieved 2026-10-27) |
|---|---|---|
| D-TUN | i2pd tunnel types, server/http options, I2CP/streaming options, defaults | https://docs.i2pd.website/en/latest/user-guide/tunnels/ (canonical i2pd.readthedocs.io) |
| D-CONF | i2pd tunconf/tunnelsdir, service ports | https://docs.i2pd.website/en/latest/user-guide/configuration/ |
| D-SRC | i2pd 2.49.0 option parsing, key path, unique-local, X-I2P headers | https://github.com/PurpleI2P/i2pd tag 2.49.0 (commit dd32f1ed): `libi2pd_client/ClientContext.{h,cpp}`, `I2PTunnel.cpp`, `libi2pd/FS.h` |
| D-CHANGES | version of `i2pheaders`, `maxConnsPerMinute`, `maxConcurrentStreams`, key file permissions | i2pd `ChangeLog` on master (commit 0c52fc31, release 3.0.0 of 2026-10-19) |
| J-SPEC | i2ptunnel properties, split `i2ptunnel.config.d` format, properties syntax | https://i2p.net/en/docs/specs/configuration/ (geti2p.net/spec/configuration redirects to the i2p.net site) |
| J-SRC | split/monolithic loading, file naming, key creation + backup copy, default limits, X-I2P headers | https://github.com/i2p/i2p.i2p master (commit b21f0c5e): `apps/i2ptunnel/.../TunnelControllerGroup.java`, `TunnelController.java`, `I2PTunnelHTTPServer.java`, `I2PTunnelServer.java` |
| J-PORTS | Java I2P / i2pd port assignments | https://i2p.net/en/docs/overview/ports/ |
| PKG | Debian/Ubuntu i2pd paths and AppArmor | installed `i2pd 2.49.0-1build3`: `/lib/systemd/system/i2pd.service`, `/etc/i2pd/`, `/etc/apparmor.d/usr.sbin.i2pd` |

## Corrections to existing repository material

- `docs/remote/onion-i2p-research.md` 3.2 lists `i2pheaders` (default true) and `i2p.streaming.maxConnsPerMinute`
  as i2pd options without versions: they exist only since i2pd 2.59.0; `maxConcurrentStreams` since 2.55.0. The
  current i2pd release is 3.0.0 (2026-10-19), current Java I2P 2.14.0.
- Research 3.3: Java I2P's HTTP proxy port is 4444 (I2P FAQ and port registry), no longer unverified.
- Research 3.2 implies `enableuniquelocal` gives a useful per-client handle; it is also a tracking handle in web
  logs, which is why the kit disables it.

## Unverified

- Real reachability of a generated eepsite (no router was connected to the network).
- Java I2P runtime parsing of the generated file.
- Current i2pd (>= 2.59) behaviour of `i2pheaders = false` (source and docs only; tested binary is 2.49).
- Secure-context behaviour of any I2P-configured browser.
