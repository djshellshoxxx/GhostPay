#!/usr/bin/env bash
# Fails if any function, event or custom error of the production contracts lacks NatSpec
# (@notice or @dev) or has an undocumented parameter / return value.
# Usage: scripts/check-natspec.sh   (needs forge and python3 on PATH, or FORGE=/path/to/forge)
set -euo pipefail
cd "$(dirname "$0")/.."
FORGE="${FORGE:-forge}"
CONTRACTS=(GhostPayRouter GhostPaySweepRelayer)

"$FORGE" build >/dev/null
status=0
for c in "${CONTRACTS[@]}"; do
  abi=$("$FORGE" inspect "$c" abi --json)
  user=$("$FORGE" inspect "$c" userdoc --json)
  dev=$("$FORGE" inspect "$c" devdoc --json)
  ABI="$abi" USER_DOC="$user" DEV_DOC="$dev" CONTRACT="$c" python3 -I - <<'PY' || status=1
import json, os, sys
abi = json.loads(os.environ["ABI"]); user = json.loads(os.environ["USER_DOC"]); dev = json.loads(os.environ["DEV_DOC"])
c = os.environ["CONTRACT"]; errs = []
if not user.get("notice") and not dev.get("details"):
    errs.append("contract-level NatSpec missing")
if not dev.get("title"):
    errs.append("contract @title missing")
# Third-party (OpenZeppelin) members that appear in the ABI through inheritance.
THIRD_PARTY = {"eip712Domain", "SafeERC20FailedOperation", "ECDSAInvalidSignature", "ECDSAInvalidSignatureLength",
               "ECDSAInvalidSignatureS", "InvalidShortString", "StringTooLong", "ReentrancyGuardReentrantCall",
               "EIP712DomainChanged"}
def ty(x):
    if x["type"].startswith("tuple"):
        return "(" + ",".join(ty(c) for c in x["components"]) + ")" + x["type"][5:]
    return x["type"]
def key(i):
    return f'{i["name"]}({",".join(ty(x) for x in i.get("inputs", []))})' if i["type"] != "constructor" else "constructor"
for item in abi:
    t = item["type"]
    if item.get("name") in THIRD_PARTY:
        continue
    if t == "function" and item["name"] in dev.get("stateVariables", {}) | user.get("stateVariables", {}):
        sv = dev.get("stateVariables", {}).get(item["name"], {}); su = user.get("stateVariables", {}).get(item["name"], {})
        if not (su.get("notice") or sv.get("details")): errs.append(f"public variable {item['name']}: no @notice/@dev")
        continue
    if t == "function":
        k = key(item); u = user.get("methods", {}).get(k, {}); d = dev.get("methods", {}).get(k, {})
        if not (u.get("notice") or d.get("details")): errs.append(f"function {k}: no @notice/@dev")
        for p in item["inputs"]:
            if p["name"] and p["name"] not in d.get("params", {}): errs.append(f"function {k}: @param {p['name']} missing")
        outs = item.get("outputs", [])
        # solc does not export @return for public constants/immutables; zero-argument getters with a
        # @notice are accepted.
        getter = not item["inputs"] and u.get("notice")
        if outs and not d.get("returns") and not getter: errs.append(f"function {k}: @return missing")
    elif t == "event":
        k = key(item); u = user.get("events", {}).get(k, {}); d = dev.get("events", {}).get(k, {})
        if not (u.get("notice") or d.get("details")): errs.append(f"event {k}: no @notice/@dev")
        for p in item["inputs"]:
            if p["name"] not in d.get("params", {}): errs.append(f"event {k}: @param {p['name']} missing")
    elif t == "error":
        k = key(item); u = user.get("errors", {}).get(k, [{}]); d = dev.get("errors", {}).get(k, [{}])
        if not (u[0].get("notice") or d[0].get("details")): errs.append(f"error {k}: no @notice/@dev")
        for p in item["inputs"]:
            if p["name"] not in d[0].get("params", {}): errs.append(f"error {k}: @param {p['name']} missing")
    elif t == "constructor":
        d = dev.get("methods", {}).get("constructor", {})
        for p in item["inputs"]:
            if p["name"] not in d.get("params", {}): errs.append(f"constructor: @param {p['name']} missing")
if errs:
    print(f"[natspec] {c}: {len(errs)} problem(s)"); [print("  -", e) for e in errs]; sys.exit(1)
print(f"[natspec] {c}: OK ({len(abi)} ABI entries)")
PY
done
exit $status
