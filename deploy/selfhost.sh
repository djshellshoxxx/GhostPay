#!/usr/bin/env bash
# One-command GhostPay self-host helper: validates prerequisites, prints the plan, and (only when you confirm)
# runs `docker compose up -d`. It never downloads anything, never generates or prints secrets, and never touches
# anything outside deploy/. Use --dry-run to only validate and print the plan.
#
# Usage: deploy/selfhost.sh [--dry-run] [--onion] [--yes] [--env-file FILE]
#                           [--tarball FILE --sums FILE --commit SHA40]
#   --dry-run    validate + print plan, change nothing, never start containers
#   --onion      also start the Tor onion service (compose profile "onion")
#   --yes        do not ask for interactive confirmation
#   --env-file   env file (default: deploy/.env)
#   --tarball/--sums/--commit  verify a release tarball with scripts/verify-release.sh and extract it into the
#                web bundle directory (skipped, with a note, in --dry-run)
# Exit codes: 0 ok, 1 prerequisite failed, 2 usage error.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
dry=0; onion=0; yes=0; envfile="$here/.env"; tarball=""; sums=""; commit=""

usage() { sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }
die() { echo "ERROR: $*" >&2; exit 1; }
need_arg() { [ "$#" -ge 2 ] || { echo "missing value for $1" >&2; exit 2; }; }

# Check archive member types and normalized names before extracting: a checksum-valid tar can still contain symlink
# pivots or path traversal entries. The bundle is intentionally bounded for a static web release.
validate_web_tarball() {
  python3 - "$1" <<'PY'
import pathlib, sys, tarfile

archive = sys.argv[1]
max_members = 20000
max_unpacked = 2 * 1024 * 1024 * 1024
try:
    with tarfile.open(archive, "r:gz") as tf:
        roots, paths = set(), set()
        total = 0
        count = 0
        has_index = False
        for m in tf:
            count += 1
            if count > max_members:
                raise ValueError("archive exceeds the 20,000-member limit")
            name = m.name
            if not name or name.startswith("/") or "\\" in name or "\x00" in name:
                raise ValueError("archive contains an absolute or invalid path")
            parts = pathlib.PurePosixPath(name).parts
            if not parts or any(p in ("", ".", "..") for p in parts):
                raise ValueError("archive contains a traversal or non-normalized path")
            roots.add(parts[0])
            normalized = "/".join(parts)
            if normalized in paths:
                raise ValueError("archive contains duplicate paths")
            paths.add(normalized)
            if not (m.isdir() or m.isfile()):
                raise ValueError("archive contains a link or special file")
            if m.mode & 0o7000:
                raise ValueError("archive contains setuid, setgid, or sticky permissions")
            if m.isfile():
                total += m.size
                if total > max_unpacked:
                    raise ValueError("archive exceeds the 2 GiB unpacked limit")
                if len(parts) == 2 and parts[1] == "index.html":
                    has_index = True
    if count == 0:
        raise ValueError("archive has no entries")
    if len(roots) != 1:
        raise ValueError("archive must contain one top-level directory")
    if not has_index:
        raise ValueError("archive has no top-level index.html")
except Exception as e:
    print("invalid web bundle archive: " + str(e), file=sys.stderr)
    sys.exit(1)
PY
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1 ;;
    --onion) onion=1 ;;
    --yes) yes=1 ;;
    --env-file) need_arg "$@"; envfile="$2"; shift ;;
    --tarball) need_arg "$@"; tarball="$2"; shift ;;
    --sums) need_arg "$@"; sums="$2"; shift ;;
    --commit) need_arg "$@"; commit="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

fails=0
ok()   { echo "  ok    $*"; }
bad()  { echo "  FAIL  $*"; fails=$((fails + 1)); }
warn() { echo "  warn  $*"; }

# Read KEY=VALUE from the env file without sourcing it (no code execution from a config file).
envval() {
  local k="$1" def="$2" v=""
  if [ -f "$envfile" ]; then
    v="$(grep -E "^${k}=" "$envfile" | tail -n 1 | cut -d= -f2- || true)"
    v="${v%\"}"; v="${v#\"}"
  fi
  echo "${v:-$def}"
}

# Portable file mode and owner uid.
file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
file_uid()  { stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"; }

echo "== GhostPay self-host: prerequisite check (dry-run=$dry onion=$onion)"

# 1. Tooling
if command -v docker >/dev/null 2>&1; then ok "docker found"; else bad "docker not found"; fi
if docker compose version >/dev/null 2>&1; then ok "docker compose plugin found"; else bad "docker compose v2 plugin not found"; fi
if [ "$(id -u)" = "0" ]; then warn "running as root; the containers themselves are non-root, but prefer a normal user in the docker group"; fi

# 2. Env file
if [ -f "$envfile" ]; then ok "env file $envfile"; else bad "env file missing: copy deploy/.env.example to deploy/.env and edit"; fi
origin="$(envval GHOSTPAY_PUBLIC_ORIGIN '')"
case "$origin" in
  https://*) ok "public origin $origin" ;;
  "") bad "GHOSTPAY_PUBLIC_ORIGIN not set" ;;
  http://localhost*|http://127.0.0.1*) warn "public origin $origin is plain http (fine for local testing only)" ;;
  *) bad "GHOSTPAY_PUBLIC_ORIGIN must be https:// (got: $origin)" ;;
esac
port="$(envval GHOSTPAY_HTTP_PORT 8080)"
case "$port" in *[!0-9]*|"") bad "GHOSTPAY_HTTP_PORT must be numeric" ;; *) ok "host port 127.0.0.1:$port" ;; esac
uid="$(envval GHOSTPAY_API_UID 65532)"
case "$uid" in *[!0-9]*|"") bad "GHOSTPAY_API_UID must be numeric" ;; esac

# 3. Web bundle
dist="$(envval GHOSTPAY_WEB_DIST ./web-dist)"
if distdir="$(python3 - "$here" "$dist" <<'PY'
import os, sys
base = os.path.realpath(sys.argv[1])
target = os.path.realpath(os.path.join(base, sys.argv[2]))
if target == base or os.path.commonpath((base, target)) != base:
    sys.exit(1)
print(target)
PY
)"; then
  :
else
  bad "GHOSTPAY_WEB_DIST must resolve to a child of deploy/"
  distdir="$here/web-dist"
fi
if [ -e "$distdir" ] && [ ! -d "$distdir" ]; then bad "web bundle path is not a directory: $distdir"; fi
if [ -n "$tarball" ]; then
  [ -n "$sums" ] && [ -n "$commit" ] || die "--tarball needs --sums and --commit"
  [ -f "$tarball" ] || bad "tarball not found: $tarball"
  [ -f "$sums" ] || bad "SHA256SUMS not found: $sums"
  case "$commit" in *[!0-9a-f]*) bad "--commit must be a 40-hex SHA" ;; esac
  [ "${#commit}" = 40 ] || bad "--commit must be a 40-hex SHA"
  if [ -f "$tarball" ]; then
    if validate_web_tarball "$tarball"; then ok "tarball contains only safe web files"; else bad "tarball structure is unsafe"; fi
  fi
fi
if [ -f "$distdir/index.html" ]; then ok "web bundle present: $distdir"
elif [ -n "$tarball" ]; then ok "web bundle will be extracted from the verified tarball into $distdir"
else bad "no web bundle at $distdir/index.html (see deploy/BUILD-WEB.md, or pass --tarball)"; fi
if [ -d "$distdir" ] && find "$distdir" -name '*.map' -print -quit 2>/dev/null | grep -q .; then bad "source maps found in web bundle"; fi

# 4. Config and secrets (existence, mode, owner; contents are never read or printed)
cfg="$here/config/relayer.config.json"
if [ -f "$cfg" ]; then ok "relayer config present"; else bad "missing deploy/config/relayer.config.json (see deploy/config/README.md)"; fi
if [ -f "$cfg" ] && [ -n "$origin" ] && ! grep -qF "\"$origin\"" "$cfg"; then bad "allowedOrigins in relayer config does not list $origin"; fi
# Behind this recipe's nginx the relayer must trust the backend subnet nginx connects from (audit L5-05); with any
# other list every client shares one bucket. The subnet is read from docker-compose.yml; when none can be read, the
# recipe's default 172.30.10.0/24 is assumed and the output says so.
if [ -f "$cfg" ]; then
  rc=0
  backend="$(python3 - "$cfg" "$here/docker-compose.yml" <<'PY'
import ipaddress, json, re, sys

def network(entry):
    net = ipaddress.ip_network(str(entry), strict=False)
    mapped = net.network_address.ipv4_mapped if net.version == 6 and net.prefixlen >= 96 else None
    if mapped is not None:
        net = ipaddress.ip_network(f"{mapped}/{net.prefixlen - 96}", strict=False)
    return net

backend = None
try:
    with open(sys.argv[2], encoding="utf-8") as f:
        lines = f.read().splitlines()
    for line in lines[lines.index("  backend:", lines.index("networks:")) + 1:]:
        if re.match(r"  \S", line):
            break
        # Only the CIDR token: quotes around it and a trailing comment are allowed.
        m = re.match(r"\s*(?:-\s+)?subnet:\s*['\"]?([0-9A-Fa-f:.]+/\d+)", line)
        if m:
            backend = ipaddress.ip_network(m.group(1), strict=False)
            break
except (OSError, ValueError):
    pass
if backend is None:
    backend = ipaddress.ip_network("172.30.10.0/24")
    print(backend, "assumed")
else:
    print(backend)
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        entries = json.load(f).get("trustedProxies", [])
    if not isinstance(entries, list):
        raise ValueError("not a list")
    nets = [network(e) for e in entries]
except Exception:
    sys.exit(2)
if all(n.is_loopback for n in nets):
    sys.exit(1)
sys.exit(0 if any(n.version == backend.version and n.overlaps(backend) for n in nets) else 3)
PY
)" || rc=$?
  read -r backend assumed <<<"$backend"
  subnet="the compose backend subnet $backend"
  if [ -n "$assumed" ]; then
    subnet="the assumed backend subnet $backend"
    warn "could not read the backend subnet from docker-compose.yml; checking trustedProxies against the recipe's default $backend instead"
  fi
  case "$rc" in
    0) ok "relayer trustedProxies covers $subnet" ;;
    1) warn "relayer trustedProxies is empty or loopback-only: behind nginx every client would share one rate-limit bucket; set it to [\"$backend\"] (deploy/config/README.md)" ;;
    3) warn "relayer trustedProxies does not cover $subnet that nginx connects from: every client would share one rate-limit bucket; add \"$backend\" (deploy/config/README.md)" ;;
    *) warn "could not read trustedProxies from the relayer config (the relayer validates it at startup)" ;;
  esac
fi
for s in relayer_key quote_secret; do
  f="$here/secrets/$s"
  if [ ! -f "$f" ]; then bad "missing secret file deploy/secrets/$s (see deploy/secrets/README.md)"; continue; fi
  m="$(file_mode "$f")"
  if [ "$m" = "600" ] || [ "$m" = "400" ]; then ok "secrets/$s mode $m"; else bad "secrets/$s must be mode 600 (is $m)"; fi
  o="$(file_uid "$f")"
  if [ "$o" = "$uid" ]; then ok "secrets/$s owned by uid $uid"; else warn "secrets/$s owned by uid $o, container runs as $uid (relayer may refuse to start)"; fi
done
if [ -f "$here/secrets/rpc.env" ]; then
  m="$(file_mode "$here/secrets/rpc.env")"
  if [ "$m" = "600" ] || [ "$m" = "400" ]; then ok "secrets/rpc.env mode $m"; else bad "secrets/rpc.env must be mode 600 (is $m)"; fi
else warn "no secrets/rpc.env: RPC URLs must then be set in the relayer config or environment"; fi

# 5. Nothing secret tracked by git
if command -v git >/dev/null 2>&1 && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
  tracked="$(git -C "$repo" ls-files -- deploy/secrets deploy/.env deploy/config/relayer.config.json deploy/tor-data | grep -v '^deploy/secrets/README.md$' || true)"
  if [ -z "$tracked" ]; then ok "no secret or env files tracked by git"; else bad "tracked by git (remove them): $tracked"; fi
fi

# 6. Compose file validates (only if docker is usable)
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  prof=(); [ "$onion" = 1 ] && prof=(--profile onion)
  cargs=(-f "$here/docker-compose.yml"); [ -f "$envfile" ] && cargs+=(--env-file "$envfile")
  if docker compose "${cargs[@]}" ${prof[@]+"${prof[@]}"} config -q >/dev/null 2>&1; then ok "docker compose config validates"; else bad "docker compose config failed"; fi
fi

echo
echo "== Plan"
step=1
if [ -n "$tarball" ]; then
  echo "  $((step++)). verify $tarball with scripts/verify-release.sh (sums: $sums, commit: $commit); abort on any FAIL"
  echo "  $((step++)). extract it into $distdir (replacing old contents)"
  echo "     then complete the signed-tag and attestation checks it prints (see docs/operators/release-and-verify.md)"
fi
echo "  $((step++)). docker compose build api$([ "$onion" = 1 ] && echo ' tor')   (builds locally from apps/relayer/Dockerfile$([ "$onion" = 1 ] && echo ' and deploy/tor/Dockerfile'))"
echo "  $((step++)). docker compose $([ "$onion" = 1 ] && echo '--profile onion ')up -d   services: api, web (nginx, 127.0.0.1:$port)$([ "$onion" = 1 ] && echo ', tor')"
echo "  $((step++)). put a TLS terminator in front of 127.0.0.1:$port for ${origin:-your origin}; no secrets or ports are exposed otherwise"
if [ "$onion" = 1 ]; then echo "  $((step++)). read your address:  docker compose exec tor cat /var/lib/tor/ghostpay/hostname   (key stays in the tor-data volume)"; fi
echo "  $((step++)). verify: curl -sI http://127.0.0.1:$port/ and compare headers with apps/web/public/_headers"

if [ "$fails" -gt 0 ]; then
  echo; echo "$fails prerequisite check(s) failed. Fix them and re-run. Nothing was changed."
  exit 1
fi
if [ "$dry" = 1 ]; then echo; echo "dry-run: all checks passed; nothing was changed or started."; exit 0; fi

if [ "$yes" != 1 ]; then
  printf '\nProceed with the plan above? Type "yes" to continue: '
  read -r answer || answer=""
  [ "$answer" = "yes" ] || { echo "aborted; nothing was changed."; exit 0; }
fi

if [ -n "$tarball" ]; then
  bash "$repo/scripts/verify-release.sh" "$tarball" "$sums" "$commit" || die "release verification failed; aborting"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$tarball" -C "$tmp"
  top="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -f "$top/index.html" ] || die "extracted bundle has no index.html"
  mkdir -p "$distdir"
  find "$distdir" -mindepth 1 -delete
  cp -a "$top"/. "$distdir"/
fi
cd "$here"
args=(-f docker-compose.yml); [ -f "$envfile" ] && args+=(--env-file "$envfile")
[ "$onion" = 1 ] && args+=(--profile onion)
docker compose "${args[@]}" build
docker compose "${args[@]}" up -d
echo "started. See deploy/README.md for verification and operations."
