#!/usr/bin/env python3
"""Replay this source-pinned internal assessment without modifying the checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--forge", type=Path, required=True)
    parser.add_argument("--solc", type=Path, required=True)
    parser.add_argument("--scratch", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    forge = args.forge.resolve()
    solc = args.solc.resolve()
    scratch = args.scratch.resolve()
    here = Path(__file__).resolve().parent
    if scratch.exists():
        raise SystemExit("Choose a new scratch directory; existing files are never overwritten.")
    if sha256(solc) != "9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25":
        raise SystemExit("Compiler differs from the repository-pinned native solc 0.8.28.")
    version = subprocess.check_output([str(forge), "--version"], text=True)
    if "forge Version: 1.8.5\n" not in version:
        raise SystemExit("Use repository-pinned Forge 1.8.5.")
    archive = repo / "docs/engineering-handoffs/generation1-security/evidence/mythril-c993.zip"
    if sha256(archive) != "7ea2f0648d3ae777ede6aebb5e8c7de81ebe20e7746f24d9b1c290ffc45fceee":
        raise SystemExit("Unexpected source artifact.")
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("mythril-evidence/manifest.json"))
        for item in manifest["sourceFiles"]:
            if sha256(repo / item["path"]) != item["sha256"]:
                raise SystemExit("Source changed: " + item["path"])
    # Preserve original package configuration and dependencies. The only added Solidity
    # is the separate evidence harness, copied after the original suites complete.
    scratch.mkdir(parents=True)
    package = scratch / "contracts"
    shutil.copytree(repo / "packages/contracts", package,
                    ignore=shutil.ignore_patterns("out", "cache"))
    env = dict(os.environ)
    env["FOUNDRY_SOLC"] = str(solc)
    commands = [
        ("original-dispositions.log", "test/Mythril*Dispositions.t.sol"),
        ("current-replay.log", "test/CurrentMythrilArtifact.t.sol"),
    ]
    results = []
    for filename, pattern in commands:
        if filename == "current-replay.log":
            shutil.copyfile(here / "evidence/CurrentMythrilArtifact.t.sol",
                            package / "test/CurrentMythrilArtifact.t.sol")
        argv = [str(forge), "test", "--match-path", pattern, "--threads", "1", "-vv"]
        with (scratch / filename).open("w") as output:
            result = subprocess.run(argv, cwd=package, env=env,
                                    stdout=output, stderr=subprocess.STDOUT, check=False)
        results.append({"command": argv, "exit_code": result.returncode, "log": filename,
                        "sha256": sha256(scratch / filename)})
    (scratch / "run-results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
    raise SystemExit(0 if all(item["exit_code"] == 0 for item in results) else 1)


if __name__ == "__main__":
    main()
