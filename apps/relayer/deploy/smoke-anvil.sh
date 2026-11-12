#!/usr/bin/env bash
# REAL container smoke test against a LOCAL anvil (never a public network).
#
# Builds apps/relayer/Dockerfile and runs it exactly as documented: --read-only, --cap-drop ALL, no-new-privileges,
# state volume, host network. Checks /healthz, /v1/info, the ops CLI inside the (distroless) image, the Docker
# HEALTHCHECK, and a graceful SIGTERM stop (exit 0 within shutdownGraceSeconds).
#
# Needs: docker (running daemon), anvil (ANVIL_BIN, default /home/user/tools/foundry/anvil), node + curl on the host,
# built contracts (packages/contracts/out), root or sudo (secret files must be owned by the image uid 65532).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
anvil_bin="${ANVIL_BIN:-/home/user/tools/foundry/anvil}"
anvil_port="${SMOKE_ANVIL_PORT:-18545}"
relayer_port="${SMOKE_RELAYER_PORT:-18787}"
grace=10
image="ghostpay-relayer:smoke"
name="ghostpay-relayer-smoke-$$"
vol="ghostpay-relayer-smoke-state-$$"
tmp="$(mktemp -d)"
sudo=""; [[ "$(id -u)" = 0 ]] || sudo="sudo"
anvil_pid=""
fails=0
ok() { echo "ok:   $*"; }
bad() { echo "FAIL: $*" >&2; fails=$((fails + 1)); }
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm -f "$vol" >/dev/null 2>&1 || true
  if [[ -n "$anvil_pid" ]]; then kill "$anvil_pid" 2>/dev/null || true; fi
  $sudo rm -rf "$tmp"
}
trap cleanup EXIT

[[ -x "$anvil_bin" ]] || { echo "anvil not found: $anvil_bin" >&2; exit 1; }
[[ -f "$root/packages/contracts/out/GhostPaySweepRelayer.sol/GhostPaySweepRelayer.json" ]] || { echo "build contracts first (forge build)" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon not reachable" >&2; exit 1; }

# 1. anvil + contracts
"$anvil_bin" --host 127.0.0.1 --port "$anvil_port" --chain-id 31337 >"$tmp/anvil.log" 2>&1 &
anvil_pid=$!
for _ in $(seq 1 50); do
  curl -fsS -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "http://127.0.0.1:$anvil_port" >/dev/null 2>&1 && break
  sleep 0.2
done
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" >"$tmp/hot.key"
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" >"$tmp/quote.secret"
dep="$(node "$root/apps/relayer/deploy/smoke-anvil-deploy.mjs" "http://127.0.0.1:$anvil_port" "$tmp/hot.key")"
sweep="$(node -p "JSON.parse(process.argv[1]).sweepRelayer" "$dep")"
token="$(node -p "JSON.parse(process.argv[1]).token" "$dep")"
ok "deployed sweepRelayer=$sweep token=$token"

# 2. config + secrets (owned by the image's runtime uid; secrets mode 600)
cat >"$tmp/relayer.config.json" <<JSON
{
  "listen": { "host": "127.0.0.1", "port": $relayer_port },
  "allowedOrigins": ["http://localhost:5173"],
  "allowDevChain": true,
  "allowInsecureLocalhostRpc": true,
  "shutdownGraceSeconds": $grace,
  "state": { "file": "/var/lib/ghostpay-relayer/state.json" },
  "chains": [{
    "chainId": 31337,
    "rpcUrl": "http://127.0.0.1:$anvil_port",
    "sweepRelayer": "$sweep",
    "feeTo": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "tokens": [{ "address": "$token", "symbol": "PMT", "decimals": 6, "permit": true, "usdStable": true }],
    "nativeUsdPrice": "3000",
    "gasUnits": { "sweep": "150000", "sweepWithPermit": "200000" },
    "maxGasLimit": "1000000",
    "maxGasPriceWei": "1000000000000",
    "dailyBudgetWei": "1000000000000000000",
    "minBalanceWei": "1000000000000000"
  }]
}
JSON
mkdir "$tmp/deployments"
chmod 755 "$tmp"; chmod 644 "$tmp/relayer.config.json"; chmod 600 "$tmp/hot.key" "$tmp/quote.secret"
$sudo chown 65532:65532 "$tmp/hot.key" "$tmp/quote.secret"

# 3. build + run
# SMOKE_DOCKERFILE / SMOKE_BUILD_FLAGS exist only for sandboxes whose build containers need an egress proxy.
# shellcheck disable=SC2086
docker build -q ${SMOKE_BUILD_FLAGS:-} -f "${SMOKE_DOCKERFILE:-$root/apps/relayer/Dockerfile}" -t "$image" "$root" >"$tmp/build.id"
ok "image built: $(cat "$tmp/build.id")"
docker volume create "$vol" >/dev/null
docker run -d --name "$name" --network host --read-only --cap-drop ALL --security-opt no-new-privileges \
  --health-interval 2s --health-start-period 1s --health-retries 3 \
  -v "$vol:/var/lib/ghostpay-relayer" -v "$tmp:/cfg:ro" \
  -e RELAYER_CONFIG=/cfg/relayer.config.json -e DEPLOYMENTS_DIR=/cfg/deployments \
  -e RELAYER_KEY_FILE=/cfg/hot.key -e QUOTE_SECRET_FILE=/cfg/quote.secret \
  -e RELAYER_HEALTH_URL="http://127.0.0.1:$relayer_port" "$image" >/dev/null
base="http://127.0.0.1:$relayer_port"
up=0
for _ in $(seq 1 50); do
  if curl -fsS "$base/healthz" >"$tmp/healthz.json" 2>/dev/null; then up=1; break; fi
  [[ "$(docker inspect -f '{{.State.Running}}' "$name")" = true ]] || break
  sleep 0.5
done
if [[ "$up" = 1 ]]; then ok "GET /healthz -> $(cat "$tmp/healthz.json")"; else bad "relayer did not come up"; docker logs "$name" 2>&1 | tail -5 >&2; fi

if [[ "$up" = 1 ]]; then
  info_code="$(curl -s -o "$tmp/info.json" -w '%{http_code}' "$base/v1/info")"
  got="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).chains[0].sweepRelayer.toLowerCase()" "$tmp/info.json")"
  if [[ "$info_code" = 200 && "$got" = "${sweep,,}" ]]; then ok "GET /v1/info 200 and matches the deployed sweepRelayer"; else bad "/v1/info unexpected ($info_code)"; fi
  node_bin=/nodejs/bin/node
  for cmd in check-config state health; do
    if docker exec "$name" $node_bin dist/ops.js "$cmd" >"$tmp/o.$cmd" 2>&1; then ok "ops $cmd: $(tr '\n' ';' <"$tmp/o.$cmd")"; else bad "ops $cmd"; cat "$tmp/o.$cmd" >&2; fi
  done
  for _ in $(seq 1 15); do [[ "$(docker inspect -f '{{.State.Health.Status}}' "$name")" = healthy ]] && break; sleep 1; done
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$name")" = healthy ]]; then ok "docker HEALTHCHECK healthy"; else bad "docker HEALTHCHECK not healthy"; fi
  if docker exec "$name" $node_bin -e "require('fs').writeFileSync('/repo/x','1')" >/dev/null 2>&1; then bad "root filesystem is writable"; else ok "root filesystem is read-only"; fi
  if [[ "$(docker exec "$name" $node_bin -e "process.stdout.write(String(process.getuid()))")" = 65532 ]]; then ok "runs as uid 65532"; else bad "unexpected uid"; fi
fi

# 4. graceful stop
start=$(date +%s)
docker stop -t $((grace + 5)) "$name" >/dev/null
elapsed=$(( $(date +%s) - start ))
code="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
if [[ "$code" = 0 && "$elapsed" -le "$grace" ]]; then ok "SIGTERM: exit code 0 in ${elapsed}s (grace ${grace}s)"; else bad "SIGTERM: exit $code after ${elapsed}s"; fi
files="$(docker run --rm -v "$vol:/v:ro" --entrypoint ls node:22-bookworm-slim -A /v | tr '\n' ' ')"
if grep -q 'state.json.lock' <<<"$files"; then bad "lock left behind: $files"; else ok "state dir after stop: ${files:-empty} (no stale lock)"; fi

if [[ "$fails" = 0 ]]; then echo "SMOKE PASSED"; else echo "SMOKE FAILED ($fails)" >&2; exit 1; fi
