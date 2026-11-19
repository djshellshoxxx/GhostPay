#!/usr/bin/env python3
"""Verify the two action pin changes and archived review inputs without executing an action."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


SOURCE = "f42553ab44d2bf8f544f0287656bbc184679014d"
OLD = "22a9089034f40e5a961c8808d113e2c98fb63676"
NEW = "3ffccacd46053766916f087ce41d627c0b8cf2d1"
PATHS = (
    ".github/workflows/ghostpay-codex-cloud.yml",
    ".github/workflows/ghostpay-parallel-review.yml",
)
HERE = Path(__file__).resolve().parent


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def verify(repository):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(repository), *args])

    old = (HERE / "create-pr-old.action.yml").read_bytes()
    new = (HERE / "create-pr-new.action.yml").read_bytes()
    assert blob(old) == "9d28570cb5eeba6ff4850b6ea9a4bbe21bdbe46f"
    assert blob(new) == "e09c1f3ba9e9673bfbde34d7dbf2a9529cb1fef8"
    assert old.count(b"  using: 'node20'\n") == 1
    assert old.replace(b"  using: 'node20'\n", b"  using: 'node24'\n") == new
    ref = json.loads((HERE / "create-pr-v8.1.3-ref.json").read_bytes())
    assert ref["ref"] == "refs/tags/v8.1.3"
    assert ref["object"] == {"sha": NEW, "type": "commit", "url": "https://api.github.com/repos/peter-evans/create-pull-request/git/commits/" + NEW}
    assert set(git("diff", "--name-only", SOURCE + "^", SOURCE).decode().splitlines()) == set(PATHS)
    workflows = []
    input_names = set(re.findall(r"^  ([a-z][a-z-]*):", new.decode().split("inputs:\n", 1)[1].split("outputs:\n", 1)[0], re.M))
    output_names = set(re.findall(r"^  ([a-z][a-z-]*):", new.decode().split("outputs:\n", 1)[1].split("runs:\n", 1)[0], re.M))
    old_pin = ("peter-evans/create-pull-request@" + OLD + " # v7").encode()
    new_pin = ("peter-evans/create-pull-request@" + NEW + " # v8.1.3").encode()
    for path in PATHS:
        previous = git("show", SOURCE + "^:" + path)
        current = git("show", SOURCE + ":" + path)
        assert previous.count(old_pin) == current.count(new_pin) == 1
        assert previous.replace(old_pin, new_pin) == current
        text = current.decode()
        tail = text.split(new_pin.decode(), 1)[1]
        block = re.search(r"(?m)^        with:\n((?: {10}.*\n|\n)*)", tail).group(1)
        used = set(re.findall(r"^ {10}([a-z][a-z-]*):", block, re.M))
        used_outputs = set(re.findall(r"steps\.pr\.outputs\.([a-z-]+)", text))
        assert used <= input_names and used_outputs <= output_names
        assert set(re.findall(r"runs-on: (.+)", text)) == {"ubuntu-24.04"}
        workflows.append({"path": path, "beforeSha256": sha(previous), "afterSha256": sha(current),
                          "onlyChange": "one exact action SHA/version-comment replacement",
                          "usedInputs": sorted(used), "usedOutputs": sorted(used_outputs),
                          "runner": "ubuntu-24.04"})
    receipt = json.loads((HERE / "results.json").read_bytes())
    assert receipt["source"] == SOURCE
    assert {x["name"] for x in receipt["commands"]} == {"workflow-regressions", "action-pins", "secrets", "diff"}
    assert all(x["exit_code"] == 0 for x in receipt["commands"])
    log = (HERE / "workflow-regressions.log").read_text()
    assert "# tests 33\n" in log and "# pass 33\n" in log and "# fail 0\n" in log
    assert "# skipped 0\n" in log and not re.search(r"^not ok ", log, re.M)
    assert "114 'uses:' reference(s) checked" in (HERE / "action-pins.log").read_text()
    paths = [p for p in HERE.iterdir() if p.is_file()] + [HERE.parent.parent / "ACTION_RUNTIME_CROSS_REVIEW_20261119.md"]
    return {
        "schemaVersion": 1, "reviewer": "contract_security", "reviewDate": "2026-11-19",
        "verdict": "PASS for scoped source/interface review", "reviewedSourceCommit": SOURCE,
        "reviewedSourceParent": git("rev-parse", SOURCE + "^").decode().strip(),
        "workflowChanges": workflows,
        "upstream": {
            "repository": "peter-evans/create-pull-request", "oldCommit": OLD, "newCommit": NEW,
            "oldManifestGitBlob": blob(old), "newManifestGitBlob": blob(new),
            "oldManifestSha256": sha(old), "newManifestSha256": sha(new),
            "runtimeChange": ["node20", "node24"], "allOtherManifestBytesIdentical": True,
            "inputsIncludingDefaultsIdentical": True, "outputsIdentical": True,
            "v8_1_3RefResolvesToNewCommit": True,
            "sourceUrls": ["https://github.com/peter-evans/create-pull-request/blob/" + commit + "/action.yml" for commit in (OLD, NEW)] + [ref["url"]],
        },
        "coordinatorQualification": {"source": SOURCE, "tests": 33, "passed": 33, "failed": 0,
                                     "allFourCommandsExitZero": True, "reviewerReranSuites": False},
        "scopeLimits": [
            "This review does not execute the upstream action, dispatch a live workflow or create a pull request.",
            "The two changes do not modify triggers, permissions, token expressions, filters, draft behavior, paid activation or approval/check gates.",
            "Interface compatibility is checked; this is not a full audit of the upstream bundled JavaScript or a live hosted-runner qualification.",
            "The unchanged strict analyzer failure and required hosted release/merge decisions are outside this maintenance review.",
        ],
        "artifacts": [{"path": str(p.relative_to(HERE.parent.parent.parent.parent.parent)), "bytes": len(p.read_bytes()), "sha256": sha(p.read_bytes())} for p in sorted(paths)],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = verify(args.repository)
    if args.output:
        args.output.write_text(json.dumps(result, indent=2) + "\n")
    print("PASS: only two pin replacements; upstream interface unchanged except runtime; v8.1.3 ref bound; coordinator 33/33 retained; no action run.")
