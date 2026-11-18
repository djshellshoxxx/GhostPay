#!/usr/bin/env python3
"""Read retained Mythril data and existing Git/build artifacts; never execute a trace.

This is an offline evidence parser, not a scanner. It writes only a scratch JSON
summary. It does not compile, invoke an analyzer, run a contract, or change Git.
"""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT / "GhostPay"
DIR = ROOT / "analysis-ci/main-mythril-dfc75ef2-14437897350"
MAIN = "dfc75ef2087fa6463ae59e0818abec01796c578d"
TESTED = "e8c77e7e8699dd16b86b7a1ff90b834594d07105"
PUBLISHED = "9bad95e5cc0ee73f5adb8d2c587161074b21e080"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def datahex(value):
    return bytes.fromhex(value.removeprefix("0x"))


def main():
    log = (DIR / "report.log").read_bytes()
    meta = json.loads((DIR / "metadata.json").read_text())
    # Decode directly from the raw log, not from a separately edited report list.
    content = log.decode("utf-8")
    decoder = json.JSONDecoder()
    reports = []
    pos = 0
    while pos < len(content):
        pos = content.find("{", pos)
        if pos < 0:
            break
        try:
            obj, end = decoder.raw_decode(content, pos)
        except json.JSONDecodeError:
            pos += 1
            continue
        if isinstance(obj, dict) and {"issues", "success", "error"} <= obj.keys():
            reports.append({"offset": pos, "end_offset": end, "report": obj})
        pos = end
    assert len(reports) == 5
    assert reports == json.loads((DIR / "parsed-reports.json").read_text())
    assert meta["fullReportBytes"] == meta["retainedBytes"] == len(log)
    assert meta["fullReportSha256"] == digest(log)
    assert meta["truncated"] is False
    assert meta["checkoutCommit"] == meta["requestedCommit"] == MAIN
    assert meta["runnerExitCode"] == 1
    assert all(x["report"]["success"] is True and x["report"]["error"] is None for x in reports)

    paths = [
        "packages/contracts/src", "packages/contracts/lib",
        "packages/contracts/src/PolicyAccountFactory.sol",
        "packages/contracts/src/PolicyAccount.sol",
        "packages/contracts/src/GhostPaySweepRelayer.sol",
        "packages/contracts/scripts/run-mythril.sh",
        "packages/contracts/scripts/mythril-compat.py",
        "packages/contracts/foundry.toml", "packages/contracts/remappings.txt",
        ".github/workflows/contract-analysis.yml",
        "packages/contracts/script/DeployPolicy.s.sol",
        "packages/contracts/test/MythrilFactoryDispositions.t.sol",
        "packages/contracts/test/MythrilExpiryDispositions.t.sol",
    ]
    local_head = git("rev-parse", "HEAD")
    identities = []
    for p in paths:
        item = {"path": p, "main": git("rev-parse", MAIN + ":" + p),
                "tested_candidate": git("rev-parse", TESTED + ":" + p),
                "current_local_head": git("rev-parse", local_head + ":" + p)}
        item["all_equal"] = len({item[k] for k in ("main", "tested_candidate", "current_local_head")}) == 1
        assert item["all_equal"]
        identities.append(item)

    artifact_path = REPO / "packages/contracts/out/PolicyAccountFactory.sol/PolicyAccountFactory.json"
    artifact_bytes = artifact_path.read_bytes()
    artifact = json.loads(artifact_bytes)
    runtime = datahex(artifact["deployedBytecode"]["object"])
    local_creation = datahex(artifact["bytecode"]["object"])
    historical = ["EXP-1", "EXP-2", "EXP-3", "R4", None, "R5", "R6", "R7", "R9", "R10", "R11"]
    issues = []
    order = 0
    for target, report in zip(
        ["GhostPayRouter", "GhostPaySweepRelayer", "GhostPayPolicyRouter", "PolicyAccount", "PolicyAccountFactory"], reports
    ):
        for issue_idx, issue in enumerate(report["report"]["issues"]):
            order += 1
            entry = {"id": f"H{order}", "analysis_target": target, "target_issue_index": issue_idx,
                     "historical_location_match": historical[order - 1]}
            entry.update({k: v for k, v in issue.items() if k != "tx_sequence"})
            if target == "PolicyAccountFactory":
                steps = issue["tx_sequence"]["steps"]
                raw_input = datahex(steps[0]["input"])
                calldata = datahex(steps[0]["calldata"])
                assert raw_input.endswith(calldata)
                creation = raw_input[:-len(calldata)]
                words = [int.from_bytes(calldata[n:n + 32], "big") for n in range(0, 128, 32)]
                runtime_offset = creation.find(runtime)
                assert words[0] == 1
                assert runtime_offset == 457
                assert len(creation) == 3807 and len(runtime) == 3296
                entry["retained_trace_checks"] = {
                    "constructor_implementation": f"0x{words[0]:040x}",
                    "constructor_fee_token": f"0x{words[1]:040x}",
                    "constructor_flat_fee": str(words[2]),
                    "constructor_fee_recipient": f"0x{words[3]:040x}",
                    "constructor_calldata_bytes": len(calldata),
                    "creation_bytes": len(creation), "creation_sha256": digest(creation),
                    "runtime_template_offset": runtime_offset,
                    "runtime_template_matches_existing_artifact": True,
                    "creation_matches_existing_artifact": creation == local_creation,
                    "first_creation_difference": next((i for i, pair in enumerate(zip(creation, local_creation)) if pair[0] != pair[1]), None),
                    "steps": len(steps),
                    "deploy_resolved_inputs": [s.get("resolved_input") for s in steps[1:]],
                    "deploy_input_sha256": [digest(datahex(s["input"])) for s in steps[1:]],
                    "two_deploy_inputs_identical": len(steps) == 3 and steps[1]["input"] == steps[2]["input"],
                    "executed_by_this_review": False,
                }
            issues.append(entry)
    assert len(issues) == 11
    assert sum(x["severity"] == "Medium" for x in issues) == 3
    assert sum(x["severity"] == "Low" for x in issues) == 8
    assert issues[4]["swc-id"] == "113" and issues[4]["address"] == 999
    assert issues[4]["retained_trace_checks"]["two_deploy_inputs_identical"]
    zip_path = DIR.with_suffix(".zip")
    result = {
        "schema_version": 1, "review_time_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Read-only parsing, source inspection and comparison of existing artifacts; no analyzer, compiler, trace replay or tests started.",
        "hosted_main_sha": MAIN, "local_tested_candidate_sha": TESTED,
        "published_candidate_sha": PUBLISHED, "current_local_head": local_head,
        "published_candidate_scope": "Prior GitHub readback verified published full tree equals local e8 full tree 81341de7972041b5f7ce53da76027846356fab90; hosted Mythril itself ran only on main dfc.",
        "run_id": 44297673763, "job_id": 134778851902,
        "job_url": "https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/job/134778851902",
        "artifact_id": 14437897350,
        "artifact_url": "https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/artifacts/14437897350",
        "artifact_zip_bytes": zip_path.stat().st_size, "artifact_zip_sha256": digest(zip_path.read_bytes()),
        "report_bytes": len(log), "report_sha256": digest(log), "metadata": meta,
        "finding_totals": {"total": 11, "medium": 3, "low": 8},
        "report_totals": [
            {"target": name, "success": r["report"]["success"], "error": r["report"]["error"], "issues": len(r["report"]["issues"])}
            for name, r in zip(["GhostPayRouter", "GhostPaySweepRelayer", "GhostPayPolicyRouter", "PolicyAccount", "PolicyAccountFactory"], reports)
        ],
        "existing_artifact": {
            "path": str(artifact_path), "artifact_sha256": digest(artifact_bytes),
            "runtime_template_bytes": len(runtime), "runtime_template_sha256": digest(runtime),
            "creation_bytes": len(local_creation), "creation_sha256": digest(local_creation),
            "comparison_limit": "Exact metadata-free deployed-bytecode template equality, including immutable placeholders. Not a live deployed-instance or full creation-bytecode equality claim.",
        },
        "source_objects": identities, "issues": issues,
        "historical_absent_finding": {"id": "R8", "swc_id": "113", "severity": "Low", "pc": 1781, "filename": "src/PolicyAccountFactory.sol", "line": 132, "code": "allowance"},
        "gate": {"conclusion": "failure", "exit_code": 1, "disposition_approval": False, "scanner_or_workflow_rerun": False},
        "limits": ["success:true/error:null do not expose Mythril internal report.exceptions or prove exhaustive symbolic coverage.",
                   "The constructor feasibility and byte equality checks apply to these retained traces. They do not by themselves prove the underlying patterns safe.",
                   "Historical fixture regressions were already executed inside the 490-test suite; no fresh artifact replay was performed.",
                   "Fee-token view failure and unexpected successful-transfer deltas can block fee-bearing counterfactual account deployment; that real conditional availability residual remains."]
    }
    out = ROOT / "analysis-ci/HOSTED_MYTHRIL_REVIEW_20261118.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(out), "findings": len(issues), "source_objects_equal": len(identities),
                      "all_factory_implementation_one": True, "new_pc999_duplicate_input": True,
                      "gate_exit": meta["runnerExitCode"]}))


if __name__ == "__main__":
    main()
