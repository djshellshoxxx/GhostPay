"""Bounded local fixture/readback evidence. Does not run or qualify a browser.

Usage: python devnet-fixture-native-replay.py <worktree> <red|green>
The public Anvil key and fee recipient are read from the actual browser runner.
All RPCs use a newly owned loopback Anvil; original contract scripts are unmodified.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

root = Path(sys.argv[1]).resolve()
phase = sys.argv[2]
assert phase in ("red", "green")
evidence = Path(__file__).resolve().parent
work = Path(tempfile.mkdtemp(prefix=f"devnet-fixture-native-{phase}-", dir=evidence))
node = Path("/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node")
tools = Path("/workspace/scratch/75c78c17e2fc/contract-tools")
contracts = root / "packages/contracts"
runner = (root / "scripts/beta/browser-devnet.sh").read_text()
dev_key = re.search(r'^DEV_DEPLOYER_KEY="([^"]+)"', runner, re.M).group(1)
fee_recipient = re.search(r'^DEV_FEE_RECIPIENT="([^"]+)"', runner, re.M).group(1)
oracle = re.search(r'^OP_GAS_PRICE_ORACLE="([^"]+)"', runner, re.M).group(1)
oracle_code = re.search(r'^ZERO_WORD_CODE="([^"]+)"', runner, re.M).group(1)
helper = root / "apps/web/e2e/devnet/prepare-devnet-manifest.mjs"

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

source_paths = [
    "scripts/beta/browser-devnet.sh",
    "apps/web/e2e/devnet/prepare-devnet-manifest.mjs",
    "scripts/testnet/make-manifest.test.mjs",
    "packages/chain-adapters/src/deploymentsVerify.ts",
    "packages/chain-adapters/dist/deploymentsVerify.js",
    "packages/contracts/script/Deploy.s.sol",
    "packages/contracts/script/devnet/DeployDevnet.s.sol",
    "packages/contracts/test/utils/ERC5564Announcer.sol",
]
proof = {
    "phase": phase,
    "source_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "source_sha256": {path: digest(root / path) for path in source_paths},
    "replay_sha256": digest(__file__),
    "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "work_directory": str(work),
    "acceptance_scope": "native local fixture/readback/signature only; no browser or public-chain acceptance",
    "public_test_signer_source": "scripts/beta/browser-devnet.sh DEV_DEPLOYER_KEY (public Anvil account 0)",
}
with socket.socket() as port_probe:
    port_probe.bind(("127.0.0.1", 0))
    port = port_probe.getsockname()[1]
assert port != 8545
url = f"http://127.0.0.1:{port}"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
rpc_id = 0

def rpc(method, params=None):
    global rpc_id
    rpc_id += 1
    payload = json.dumps({"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": [] if params is None else params}).encode()
    req = urllib.request.Request(url, data=payload, headers={"content-type": "application/json"})
    with opener.open(req, timeout=10) as reply:
        result = json.load(reply)
    if "error" in result:
        raise RuntimeError(f"{method}: {result['error']}")
    return result["result"]

def run_step(name, args, cwd=root, env=None, timeout=180, input_text=None):
    print(f"{phase}: {name}", flush=True)
    start = time.monotonic()
    log = work / f"{name}.log"
    with log.open("w") as output:
        result = subprocess.run([str(arg) for arg in args], cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=timeout, input=input_text, text=input_text is not None)
    proof.setdefault("steps", []).append({"name": name, "exit_code": result.returncode, "seconds": round(time.monotonic() - start, 3), "log": str(log), "sha256": digest(log)})
    return result.returncode, log

def deploy(script, name, env):
    status, log = run_step(name, [tools / "forge", "script", script, "--offline", "--rpc-url", url, "--broadcast", "--private-key", dev_key, "--slow"], cwd=contracts, env=env)
    if status != 0:
        raise AssertionError(f"{name} failed ({status}): {log.read_text()[-6000:]}")

anvil_log = (work / "anvil.log").open("w")
anvil = subprocess.Popen([tools / "anvil", "--host", "127.0.0.1", "--port", str(port), "--chain-id", "31337", "--silent"], stdout=anvil_log, stderr=subprocess.STDOUT)
try:
    for attempt in range(100):
        assert anvil.poll() is None, "owned Anvil exited during startup"
        try:
            if rpc("eth_chainId") == "0x7a69":
                break
        except (OSError, ValueError):
            pass
        time.sleep(0.1)
    else:
        raise AssertionError("owned Anvil did not start")
    assert rpc("web3_clientVersion").lower().startswith("anvil/")
    env = os.environ.copy()
    for variable in ("ANNOUNCER", "ALLOW_CUSTOM_ANNOUNCER", "EXPECTED_ANNOUNCER_CODEHASH"):
        env.pop(variable, None)
    env.update({
        "FOUNDRY_SOLC": str(tools / "solc-0.8.28"),
        "FOUNDRY_OUT": str(work / "forge-out"),
        "FOUNDRY_CACHE_PATH": str(work / "forge-cache"),
        "FOUNDRY_BROADCAST": str(work / "broadcast"),
        "FEE_RECIPIENT": fee_recipient,
        "RAYON_NUM_THREADS": "2",
    })
    deploy("script/devnet/DeployDevnet.s.sol:DeployDevnet", "deploy-devnet-31337", env)
    original = work / "broadcast/DeployDevnet.s.sol/31337/run-latest.json"
    original_hash = digest(original)
    original_json = json.loads(original.read_text())
    assert int(original_json["chain"]) == 31337
    tokens = [tx["contractAddress"] for tx in original_json["transactions"] if tx["transactionType"] == "CREATE" and tx["contractName"] in ("DevPermitStablecoin", "DevPlainStablecoin")]
    assert len(tokens) == 3
    rpc("anvil_setChainId", [84532])
    assert rpc("eth_chainId") == "0x14a34"
    assert rpc("web3_clientVersion").lower().startswith("anvil/")
    assert int(rpc("anvil_nodeInfo")["environment"]["chainId"]) == 84532
    rpc("anvil_setCode", [oracle, oracle_code])
    broadcast = original

    if phase == "green":
        canonical = subprocess.check_output([node, "--input-type=module", "-e", "import { CANONICAL_ANNOUNCER } from '@ghostpay/chain-adapters'; process.stdout.write(CANONICAL_ANNOUNCER);"], cwd=root, text=True)
        artifact_path = work / "forge-out/ERC5564Announcer.sol/ERC5564Announcer.json"
        runtime = json.loads(artifact_path.read_text())["deployedBytecode"]["object"]
        assert re.fullmatch(r"0x(?:[0-9a-fA-F]{2})+", runtime)
        assert rpc("eth_getCode", [canonical, "latest"]) == "0x"
        # Execute the exact inline seeding program from the runner, without adding a runner skip or mode.
        seed_source = re.search(r"node --input-type=module - \"\$RPC_URL\" \"\$WORK/forge-out\" <<'NODE'\n(.*?)\nNODE", runner, re.S).group(1)
        status, seed_log = run_step("seed-canonical-runtime", [node, "--input-type=module", "-", url, work / "forge-out"], input_text=seed_source)
        assert status == 0, seed_log.read_text()
        assert seed_log.read_text() == canonical
        assert rpc("eth_getCode", [canonical, "latest"]).lower() == runtime.lower()
        proof["canonical_announcer"] = canonical
        proof["runner_seed_source_sha256"] = hashlib.sha256(seed_source.encode()).hexdigest()
        proof["canonical_runtime_artifact_sha256"] = digest(artifact_path)
        env["ANNOUNCER"] = canonical
        deploy("script/Deploy.s.sol:Deploy", "deploy-canonical-84532", env)
        broadcast = work / "broadcast/Deploy.s.sol/84532/run-latest.json"
        assert int(json.loads(broadcast.read_text())["chain"]) == 84532

    status, helper_log = run_step("prepare-manifest", [node, helper, "--rpc", url, "--broadcast", broadcast, "--artifacts", work / "forge-out", "--out-dir", work / "deployments", "--state", work / "devnet.json"], env=env)
    proof["prepare_exit_code"] = status
    if phase == "red":
        assert status == 1
        assert "manifest announcer is not the canonical announcer" in helper_log.read_text()
        assert not (work / "deployments").exists()
        assert not (work / "devnet.json").exists()
        proof["expected_failure"] = "old 31337 custom-announcer fixture refused by the stronger 84532 canonical verifier before signing/output"
    else:
        assert status == 0, helper_log.read_text()
        validate = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CANONICAL_ANNOUNCER, loadDeployment, verifyManifestOnChain, verifyObjectManifestSignature } from '@ghostpay/chain-adapters';
const [helper, stateFile, manifestFile] = process.argv.slice(1);
const { assertLocalAnvil, loopbackRpc } = await import(pathToFileURL(helper));
const state = JSON.parse(readFileSync(stateFile, 'utf8'));
const rpc = loopbackRpc(state.rpcUrl);
await assertLocalAnvil(rpc);
const manifest = loadDeployment(readFileSync(manifestFile, 'utf8'), 84532);
assert.equal(manifest.announcer.toLowerCase(), CANONICAL_ANNOUNCER.toLowerCase());
assert.equal(verifyObjectManifestSignature(manifest, [state.publicKey]).status, 'valid');
await verifyManifestOnChain(manifest, { chainId: 84532, request: rpc });
process.stdout.write(JSON.stringify({ chainId: state.chainId, announcer: manifest.announcer, router: manifest.router, sweepRelayer: manifest.sweepRelayer, signature: 'valid', readback: 'passed' }) + '\\n');
"""
        status, validation_log = run_step("independent-manifest-readback", [node, "--input-type=module", "-e", validate, helper, work / "devnet.json", work / "deployments/84532.json"])
        assert status == 0, validation_log.read_text()
        proof["manifest_result"] = json.loads(validation_log.read_text())
        proof["signed_manifest_sha256"] = digest(work / "deployments/84532.json")

    assert digest(original) == original_hash, "Pages c2 original token broadcast changed"
    assert all(rpc("eth_getCode", [token, "latest"]) != "0x" for token in tokens)
    proof["original_31337_broadcast_sha256"] = original_hash
    proof["original_31337_broadcast_preserved"] = True
    proof["stand_in_tokens"] = tokens
    proof["stand_in_token_code_preserved"] = True
    proof["browser_executed"] = False
    proof["result"] = "expected old-fixture failure reproduced" if phase == "red" else "native fixture/readback passed"
finally:
    anvil.terminate()
    try:
        anvil.wait(timeout=10)
    except subprocess.TimeoutExpired:
        anvil.kill()
        anvil.wait(timeout=10)
    anvil_log.close()
    proof["owned_anvil_stopped"] = anvil.poll() is not None
    (evidence / f"devnet-fixture-native-{phase}-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps(proof, indent=2), flush=True)
