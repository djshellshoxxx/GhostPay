#!/usr/bin/env python3
"""Passive evidence for the strict runner; never accepts or dispositions findings."""
import hashlib
import importlib.util
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

TARGETS = ["GhostPayRouter", "GhostPaySweepRelayer", "GhostPayPolicyRouter", "PolicyAccount", "PolicyAccountFactory"]
ROOT = Path(__file__).resolve().parents[3]
FIXED_INPUTS = [
    ".github/workflows/contract-analysis.yml",
    "packages/contracts/foundry.toml",
    "packages/contracts/scripts/run-mythril.sh",
    "packages/contracts/scripts/mythril-compat.py",
    "packages/contracts/scripts/capture-mythril-evidence.py",
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def regular(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"not a regular input: {path}")
    return path.read_bytes()


def inventory():
    paths = list(FIXED_INPUTS)
    for directory in ["packages/contracts/src", "packages/contracts/lib/openzeppelin-contracts/contracts"]:
        base = ROOT / directory
        if base.is_symlink() or not base.is_dir():
            raise ValueError(f"missing source directory: {directory}")
        for current, dirs, files in os.walk(base, followlinks=False):
            for name in dirs + files:
                if (Path(current) / name).is_symlink():
                    raise ValueError(f"symlink in analysis sources: {name}")
            paths += [str((Path(current) / name).relative_to(ROOT)) for name in files if name.endswith(".sol")]
    return [{"path": path, "sha256": digest(regular(ROOT / path))} for path in sorted(set(paths))]


def version(command, timeout_seconds=30):
    executable = shutil.which(command[0])
    if not executable:
        return {"argv": command, "exitCode": 127, "stdout": "", "stderr": "executable not found"}
    try:
        run = subprocess.run(command, capture_output=True, timeout=timeout_seconds, check=False)
        return {"argv": command, "exitCode": run.returncode,
                "stdout": run.stdout.decode("utf-8", errors="strict"),
                "stderr": run.stderr.decode("utf-8", errors="strict"),
                "executableSha256": digest(Path(executable).resolve().read_bytes())}
    except (subprocess.TimeoutExpired, UnicodeError) as error:
        return {"argv": command, "exitCode": 124, "stdout": "", "stderr": type(error).__name__}


def compiler_identity():
    # Pinned Mythril 0.24.8 util.solc_exists(version) installs/selects that version and calls
    # solcx.install.get_executable(). Query the explicit same version AFTER analysis, when
    # Mythril has installed it; hashing PATH's solc-select launcher would not identify it.
    try:
        import solcx.install
        native = Path(solcx.install.get_executable("0.8.28")).resolve(strict=True)
        selected = version([str(native), "--version"])
        selected["selection"] = "solcx.install.get_executable(0.8.28)"
        selected["executablePath"] = str(native)
        selected["resolverSha256"] = digest(Path(solcx.install.__file__).read_bytes())
        spec = importlib.util.find_spec("mythril")
        selected["mythrilSelectorSha256"] = digest((Path(spec.origin).parent / "ethereum/util.py").read_bytes())
        return selected
    except Exception as error:
        return {"exitCode": 127, "stdout": "", "stderr": type(error).__name__,
                "selection": "solcx.install.get_executable(0.8.28)"}


def save(directory, manifest):
    temporary = directory / "manifest.pending.json"
    temporary.write_text(json.dumps(manifest, indent=2) + "\n")
    temporary.replace(directory / "manifest.json")


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def strict_json(data):
    def invalid_constant(value):
        raise ValueError(f"invalid JSON constant: {value}")
    return json.loads(data, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def complete_telemetry(value):
    expected = {"schemaVersion", "instrumentationReady", "reportCount", "executionTimeoutObserved",
                "creationTimeoutObserved", "exceptionCount", "errorLogObserved"}
    return (type(value) is dict and set(value) == expected and type(value["schemaVersion"]) is int
            and value["schemaVersion"] == 1 and value["instrumentationReady"] is True
            and type(value["reportCount"]) is int and value["reportCount"] == 1
            and value["executionTimeoutObserved"] is False and value["creationTimeoutObserved"] is False
            and type(value["exceptionCount"]) is int and value["exceptionCount"] == 0
            and value["errorLogObserved"] is False)


def main():
    operation, raw_dir, *args = sys.argv[1:]
    if operation in ("validate", "validate-completeness"):
        if args:
            raise ValueError("unexpected validation arguments")
        value = strict_json(regular(Path(raw_dir)))
        if operation == "validate-completeness" and not complete_telemetry(value):
            raise ValueError("missing or incomplete symbolic execution evidence")
        return
    directory = Path(raw_dir).resolve()
    if operation == "start":
        config_path, timeout = args
        if not re.fullmatch(r"[1-9][0-9]*", timeout):
            raise ValueError("execution timeout must be a positive integer")
        # A stale previous campaign can never supply a missing target in this one.
        directory.mkdir(parents=True, exist_ok=False)
        config_bytes = regular(Path(config_path))
        config = strict_json(config_bytes)
        remappings = config.get("remappings")
        expected_remappings = [f"@openzeppelin/contracts/={ROOT}/packages/contracts/lib/openzeppelin-contracts/contracts/"]
        if remappings != expected_remappings:
            raise ValueError("unexpected analyzer remappings")
        sources = inventory()
        git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=False)
        (directory / "config.json").write_bytes(config_bytes)
        manifest = {"schemaVersion": 1, "analyzer": "mythril", "completed": False,
                    "sourceCommit": git.stdout.strip() if git.returncode == 0 else None,
                    "sourceRoot": str(ROOT), "startedAt": datetime.now(timezone.utc).isoformat(),
                    "sourceFiles": sources, "sourceIdentity": digest(canonical(sources)),
                    "configuration": {"compilerVersion": "0.8.28", "optimizerEnabled": config["optimizer"]["enabled"],
                                      "optimizerRuns": config["optimizer"]["runs"], "evmVersion": config["evmVersion"],
                                      "transactionDepth": 3, "executionTimeoutSeconds": int(timeout), "modules": "default",
                                      "remappings": ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"]},
                    "configSha256": digest(config_bytes), "configPath": str(Path(config_path).resolve()),
                    # Native Mythril 0.24.8 imports took 32-37 seconds in qualification. This
                    # metadata-only bound does not alter the pinned 900-second symbolic budget.
                    "tools": {"mythril": version(["myth", "version"], timeout_seconds=60), "solc": version(["solc", "--version"])},
                    "analyses": []}
        save(directory, manifest)
        return
    manifest = strict_json(regular(directory / "manifest.json"))
    if manifest.get("completed"):
        raise ValueError("campaign is already finalized")
    if operation == "record":
        target, stdout_path, stderr_path, raw_rc, completeness_path, *argv = args
        if target not in TARGETS or target in [item["target"] for item in manifest["analyses"]]:
            raise ValueError("duplicate or unexpected target")
        if len(argv) != 12 or argv[0:2] != ["analyze", f"src/{target}.sol"]:
            raise ValueError("unexpected invocation")
        expected = ["analyze", f"src/{target}.sol", "--solv", "0.8.28", "--solc-json", manifest["configPath"],
                    "--execution-timeout", str(manifest["configuration"]["executionTimeoutSeconds"]), "-t", "3", "-o", "json"]
        if argv != expected or digest(regular(Path(manifest["configPath"]))) != manifest["configSha256"]:
            raise ValueError("analyzer invocation or compiler settings changed")
        if not re.fullmatch(r"[0-9]+", raw_rc):
            raise ValueError("invalid process outcome")
        stdout = regular(Path(stdout_path))
        stderr = regular(Path(stderr_path))
        completeness = regular(Path(completeness_path)) if Path(completeness_path).exists() else b""
        (directory / f"{target}.stdout.json").write_bytes(stdout)
        (directory / f"{target}.stderr.log").write_bytes(stderr)
        (directory / f"{target}.completeness.json").write_bytes(completeness)
        argv[5] = "config.json"
        manifest["analyses"].append({"target": target, "sourceFile": f"packages/contracts/src/{target}.sol",
                                     "argv": argv, "exitCode": int(raw_rc), "compiler": compiler_identity(),
                                     "completeness": {"path": f"{target}.completeness.json", "sha256": digest(completeness)},
                                     "stdout": {"path": f"{target}.stdout.json", "sha256": digest(stdout)},
                                     "stderr": {"path": f"{target}.stderr.log", "sha256": digest(stderr)}})
        save(directory, manifest)
        return
    if operation == "finish":
        [raw_rc] = args
        manifest["tools"]["mythrilCompiler"] = compiler_identity()
        manifest["runnerExitCode"] = int(raw_rc)
        manifest["completedAt"] = datetime.now(timezone.utc).isoformat()
        manifest["sourceUnchanged"] = inventory() == manifest["sourceFiles"]
        native = manifest["tools"]["mythrilCompiler"]
        compiler_valid = (native.get("exitCode") == 0 and
                          all(a.get("compiler") == native for a in manifest["analyses"]))
        manifest["completed"] = ([a["target"] for a in manifest["analyses"]] == TARGETS
                                 and manifest["sourceUnchanged"] and compiler_valid)
        save(directory, manifest)
        if not manifest["completed"]:
            raise ValueError("incomplete campaign or changed sources")
        return
    raise ValueError("unknown evidence operation")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"::error::mythril evidence capture failed: {error}", file=sys.stderr)
        sys.exit(1)
