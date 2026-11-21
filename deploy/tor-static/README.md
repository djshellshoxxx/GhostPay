# Static GhostPay over Tor

This recipe prepares a static nginx site and a Tor sidecar. It reuses the portable
hosting kit's verified archive extraction, header policy, v3 onion configuration,
network isolation and identity-volume contract. It starts no relayer or application
backend. Preparation makes no network requests and starts no services.

The legacy `deploy/docker-compose.yml --profile onion` includes a relayer. Use this
directory for the static browser application.

## 1. Supply a verified static artifact

Use the reviewed lean web build with its matching `_headers` file. Relative asset
URLs allow the same application to run at HTTPS and onion origins. Keys, settings,
storage and permissions remain separate for each browser origin.

The portable hosting kit creates the archive. From the repository root:

```sh
node tools/portable-hosting-kit/bin/ghostpay-host.mjs validate /absolute/reviewed/site
node tools/portable-hosting-kit/bin/ghostpay-host.mjs package /absolute/reviewed/site \
  --out /absolute/releases/ghostpay-web.zip --label reviewed-build
```

The canonical Pages build removes `_headers`, because GitHub Pages cannot apply it.
A static nginx/onion artifact must preserve the matching build's response-header
policy; preparation refuses an archive without `_headers`. The hosting kit derives
nginx configuration from it. Do not loosen policy
to make an unsupported RPC endpoint work. Nginx does not serve `_headers` itself.

Publish the archive SHA-256 through the release's signed or otherwise independent
trusted channel. Preparation requires that value. A checksum obtained only beside
an untrusted download does not authenticate the publisher. Existing signed
deployment manifests and payment-enabling gates remain required.

## 2. Prepare without starting anything

Requirements: Node.js 22 or newer. Docker is not needed for preparation.

```sh
node deploy/tor-static/prepare.mjs \
  --archive /absolute/releases/ghostpay-web.zip \
  --expect-sha256 TRUSTED_64_CHARACTER_LOWERCASE_SHA256 \
  --out /absolute/deployments/ghostpay-onion-release
```

Replace the placeholder with the independently obtained hash. A missing or
mismatched hash refuses preparation. The output must be a new directory; existing
deployments are never replaced. Failed generation leaves no deployable output.
Review the resulting `START.md`, `host-config.json` and `container/` files.

The default `publicOrigin` is `null`: no onion address is invented. Explicit offline
initialization creates the identity; normal startup refuses to generate one. Once
known, set the public hostname in a copy of `host.example.json` and pass
`--config host.json` to prepare a new directory. Keep the same `mirrorLabel` so
Compose finds the same private identity volume. The generated read-only
`tor/expected-hostname` file pins the configured hostname separately from the image.
The shared validator requires a canonical v3 onion origin with a valid checksum.
The checksum catches malformed addresses; it does not establish service ownership.
Publish the intended address through a trusted signed channel.

Use `/` unless a dedicated origin needs a subpath. A different `basePath` requires
`--allow-subpath`; the entire origin must still serve only GhostPay. A subpath does
not isolate browser storage from other applications on the same host.

## 3. Review and validate containers

Use Docker Compose **2.24.4 or newer**. The final file uses documented `!reset` and
`!override` operators to remove published web ports and the web publishing network.
Older Compose must fail; do not omit this file. Docker's
[merge documentation](https://docs.docker.com/reference/compose-file/merge/)
defines these operators and their version requirement.

From the generated `container/` directory:

```sh
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml config
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml build --pull tor
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml run --rm --no-deps tor --check-runtime
```

The combined model has exactly the web and Tor services, without host-published
ports. Web joins only the internal `site_internal` network. Tor joins it and a
separate egress network. Site files are read-only; only Tor mounts the identity
volume. Both containers use non-root users, read-only filesystems, dropped
capabilities and `no-new-privileges`. Tor waits for nginx's health check.

The Tor image builds fixed source release **0.4.9.17**, with GPL puzzle support,
instead of relying on an older distribution Tor package. It checks the source
archive before extraction. Image construction and every start check the stable
version floor, PoW module and GPL support. Normal startup also requires a data
directory owned by the non-root user with mode `0700`, a complete private identity
matching the configured hostname, and valid torrc before connecting. Identity
verification uses Tor's key loader against a private temporary copy with
`DisableNetwork 1`; the live key files are never repaired or replaced. Failures do
not downgrade the transport or disable defenses.

The generated torrc enables v3 services, introduction rate limiting, adaptive PoW
and per-circuit stream limits. It exposes no SOCKS, control or relay port. These
mitigations do not guarantee availability under denial of service. Tor's
[DoS guidance](https://community.torproject.org/onion-services/advanced/dos/)
documents the capability checks and required GPL puzzle libraries.

The Docker build context allowlists only the Dockerfile and three startup scripts.
Accidental identity backups or other files in `tor/` are excluded. The identity is
generated later in a named volume, outside the image and web root.

## 4. Initialize and pin the identity offline

Run this only for a new service whose `publicOrigin` is still `null`:

```sh
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml -f compose.identity.yaml config
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml -f compose.identity.yaml run --rm --no-deps tor --initialize-identity
```

The offline override sets the Tor container's `network_mode` to `none`. The
initializer additionally uses a minimal torrc with `DisableNetwork 1`, numeric
loopback targets and no listener or control endpoint. Expected result: one public
hostname with a 56-character label ending in `.onion`, exit zero, and no running service.
Private files stay in the named volume. Any existing identity directory causes
refusal; initialization never overwrites a backup or creates a replacement for an
already configured origin.

Set `publicOrigin` in the reviewed host JSON to `http://` plus that hostname, with
no trailing slash. Keep `mirrorLabel` unchanged and prepare a new release directory
using `--config /absolute/reviewed/host.json`. From its `container/` directory:

```sh
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml -f compose.identity.yaml run --rm --no-deps tor --check-identity
```

Expected result: exit zero and no private output. A missing, malformed, wrong,
incomplete or mixed identity refuses startup. A copied `hostname` file alone cannot
pass: Tor derives the hostname from the copied keys, verifies the split keypair,
and the guard checks that Tor has not repaired or replaced either key file.
The expected hostname is the operator's public configuration, not a secret.

The implementation uses Tor's documented source behavior:
[`load_service_keys()`](https://tpo.pages.torproject.net/core/doc/tor/hs__service_8c_source.html)
loads onion keys and writes their derived hostname;
[`ed_key_init_from_file()`](https://tpo.pages.torproject.net/core/doc/tor/loadkey_8c_source.html)
derives and compares the public key against the secret. Tor's
[`DisableNetwork` manual](https://manpages.debian.org/unstable/tor/tor.1.en.html)
notes that configuration-time DNS may still occur, which is why the isolated
verification torrc uses numeric targets instead of the production `web` hostname.
The pinned binary must pass the real-container identity acceptance below; source
review and a mocked Tor process are not sufficient runtime evidence.

## 5. Authorized activation, backup and recovery

After reviewing the exact build and obtaining deployment authorization:

```sh
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml up -d
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml logs --tail=40 tor
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml exec tor cat /var/lib/tor/ghostpay/hostname
```

Use the normal **three** Compose files for activation; `compose.identity.yaml`
deliberately prevents network access and belongs only to offline identity commands.
Only `hostname` is public. Back up the `tor-data` volume while Tor is stopped, to
encrypted offline storage outside the repository, deployment output, build context
and web artifacts. Its private identity key permits impersonating the onion service.
The [Tor setup guide](https://community.torproject.org/onion-services/setup/)
explains identity directories, web targets and the hostname file.

Preserve the Compose project name in `container/compose.yaml` when changing output
directories. Compose uses that name to find the existing named volume. Restore the
same identity files with the restrictive owner/mode. Do not use `down --volumes`
for routine updates: it deletes the identity volume. Roll out updates with a new
image build, health checks and a retained identity backup.
Recreate/restart the Tor sidecar when recreating the web container: Tor resolves
the `web` target on startup and does not track a later container-address change.

### Encrypted backup and a separate restore test

These Bash commands require the `age` encryption tool and an offline backup
directory. They assume the default `mirrorLabel: ghostpay-onion`, no Compose
project-name override and the reviewed image shown above. Confirm the actual
`tor-data` volume name with `docker compose ... config` before substituting it.
The default volume name is `hk-ghostpay-onion_tor-data`.

```bash
set -o pipefail
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml stop tor
docker run --rm --pull never --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount type=volume,source=hk-ghostpay-onion_tor-data,target=/var/lib/tor,readonly \
  --entrypoint tar ghostpay-static-tor:0.4.9.17 \
  -C /var/lib/tor -cf - ghostpay/hostname ghostpay/hs_ed25519_public_key ghostpay/hs_ed25519_secret_key \
  | age --passphrase -o /offline/ghostpay-onion-identity.tar.age
```

Expected result: both commands exit zero and the encrypted backup is created
outside every repository, deployment output and image context. Enter the
passphrase at `age`'s prompt; do not place it in a command or log. Record the public
hostname separately through the trusted operator channel.

Test restoration into a fresh, separate volume while the production identity
remains untouched:

```bash
docker volume create hk-ghostpay-onion-restore-test
age --decrypt /offline/ghostpay-onion-identity.tar.age \
  | docker run --rm -i --pull never --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --mount type=volume,source=hk-ghostpay-onion-restore-test,target=/var/lib/tor \
      --entrypoint /bin/sh ghostpay-static-tor:0.4.9.17 -c \
      'set -eu; umask 077; test ! -e /var/lib/tor/ghostpay; tar --no-same-owner --no-same-permissions -C /var/lib/tor -xf - ghostpay/hostname ghostpay/hs_ed25519_public_key ghostpay/hs_ed25519_secret_key; chmod 700 /var/lib/tor/ghostpay; chmod 600 /var/lib/tor/ghostpay/hostname /var/lib/tor/ghostpay/hs_ed25519_public_key /var/lib/tor/ghostpay/hs_ed25519_secret_key'
```

Use this public configuration in a local `compose.restore-test.yaml`:

```yaml
volumes:
  tor-data:
    name: hk-ghostpay-onion-restore-test
    external: true
```

Check the restored keys against the already pinned original origin:

```sh
docker compose -f compose.yaml -f tor/compose.tor.yml -f compose.onion.yaml -f compose.identity.yaml -f compose.restore-test.yaml run --rm --no-deps tor --check-identity
```

Expected result: exit zero, with no running service and no key output. A failed
restore check is not repaired by initializing a new identity. Preserve the backup,
check that all three files belong to the same service, and restore their ownership
to the container UID/GID `10001:10001`, directory mode `0700` and file modes `0600`.
This recipe refuses symlinks, hardlinked identity files and permissive modes.

If an interrupted operation leaves `.ghostpay-identity-lock`, first stop the Tor
service and confirm that no `docker compose run` identity check or initializer is
still active. Only then remove that **empty** lock directory with `rmdir` in an
offline container using the same volume. Never delete identity files to clear a
lock. Any `.ghostpay-identity-init.*` staging directory contains private material:
keep it private, inspect the completed `ghostpay` identity and retained backup,
and resolve the interrupted initialization explicitly. Normal startup does not
guess which incomplete identity to use.

## 6. Offline runtime qualification

After building the reviewed image, from the repository root:

```sh
node --test scripts/tor/hosting-config.test.mjs scripts/tor/identity.test.mjs
node scripts/tor/identity-container.mjs ghostpay-static-tor:0.4.9.17 /absolute/evidence/identity.json
```

The container check creates disposable private volumes; every container has
`--network none`, and actual Tor processes also receive `DisableNetwork 1`. It
checks first initialization, the normal entrypoint, restart, recreation using the
same image, empty and wrong replacement volumes, a separate backup/restore copy,
mismatched keypairs and partial restores. It removes its private volumes before
success and records only pass/fail results and the image digest. It does not
publish an onion service. A new Tor binary/image still needs this check again;
recreation with an unchanged image is not an upgrade test for a different binary.

`--verify-config` remains syntax/topology validation and does not certify identity
loading. `--check-identity` is offline identity validation and does not certify Tor
bootstrap, real Tor Browser access, production recovery or payment behavior.

## 7. Browser acceptance and boundaries

Use current Tor Browser. Verify secure-context and WebCrypto availability on the
actual onion page before key or backup operations. Exercise the intended root or
subpath, record browser requests and confirm visible failure without a clearnet
redirect. A local hostname mapping, generic Chromium or fake SOCKS test is not
real-Tor proof.

Onion delivery does not establish privacy for external wallets, RPC services or
public-chain transactions. GhostPay cannot force an external wallet onto Tor or
prove its route. Existing RPC validation, consent and signed-manifest payment
refusals remain intact. This recipe does not silently enable HTTP onion RPC.

## Source pin and remaining qualification

Research date: **2026-11-19**. Tor's official download page and
[0.4.9.17 announcement](https://forum.torproject.org/t/security-release-0-4-9-17/22454)
identify that stable release. Tor's
[0.4.8 sunset announcement](https://blog.torproject.org/sunsetting-tor-048/)
documents that older series' end of life and planned compatibility cutoff.

| Input | Pin / provenance |
|---|---|
| Source URL | `https://dist.torproject.org/tor-0.4.9.17.tar.gz` |
| Source SHA-256 | `ff372c41ee7013557fe5b7acd96c909950b27a7959c59fcb87c02591682fabe2` |
| Hash source | [Buildroot maintainer's update](https://lists.busybox.net/pipermail/buildroot/2026-November/816677.html), explicitly copied from Tor's upstream checksum |
| Debian base | Existing hosting-kit `trixie-slim` digest; review/update it with the generated recipe |
| Runtime floor | Stable Tor `>= 0.4.9.17`, `pow: yes` and GPL puzzle support |

The official checksum and signature links were identified, but their bodies could
not be retrieved here: the web reader rejected their content types and normal
download returned HTTP 403. No local upstream signature verification is claimed.
The hash was cross-checked against downstream packaging evidence. Docker enforces
it on official HTTPS source bytes before compilation. Verify Tor's signed checksum
independently before a production image build and record the resulting image digest.

The base and Tor source are pinned; distribution compiler/runtime packages are
installed at build time. The complete image is not bit-reproducible. Review newer
Tor security releases before rollout: a version floor cannot predict future fixes.
Local tests do not imply Docker execution, live onion reachability, Tor Browser
payment acceptance, external-wallet routing or a professional audit.
