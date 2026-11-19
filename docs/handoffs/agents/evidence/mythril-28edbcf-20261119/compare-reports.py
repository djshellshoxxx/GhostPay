#!/usr/bin/env python3
"""Compare preserved reports; produce observations, never a gate allowlist.

Run from any directory in the full repository clone. --check verifies the
committed JSON without writing. No RPC, analyzer, concrete replay or tests run.
The older packet is read from its exact evidence commit, not a mutable path.
"""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile


HERE = Path(__file__).resolve().parent
REPO = Path(subprocess.check_output(
    ["git", "-C", str(HERE), "rev-parse", "--show-toplevel"], text=True).strip())
CURRENT = "28edbcf55093a6d6056232fd59ef37a2ae832b9a"
PRIOR = "198aa5baff22272453733a0f3dcfcac0e0994eec"
PRIOR_PACKET_COMMIT = "5fadb4ff709701bff2a5f08fac548d24c2de42ad"
PRIOR_PACKET = "docs/handoffs/agents/evidence/security-recovery-20261119/mythril-198aa5ba"
TARGETS = ["GhostPayRouter", "GhostPaySweepRelayer", "GhostPayPolicyRouter",
           "PolicyAccount", "PolicyAccountFactory"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode()


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def parse(data):
    return json.loads(data, object_pairs_hook=no_duplicates)


def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args])


def blob(commit, path):
    return git("show", f"{commit}:{path}")


def object_id(commit, path):
    return git("rev-parse", f"{commit}:{path}").decode().strip()


def reports(raw):
    result = []
    offset = 0
    for line in raw.splitlines(keepends=True):
        if line.startswith(b"{"):
            report = parse(line)
            assert set(report) == {"error", "issues", "success"}
            assert report["success"] is True and report["error"] is None
            result.append({"object": report, "byteOffset": offset,
                           "byteLength": len(line.rstrip(b"\r\n"))})
        offset += len(line)
    assert len(result) == len(TARGETS)
    return result


def key(issue):
    return f"{issue['contract']}|SWC-{issue['swc-id']}|PC-{issue['address']}"


def indexed(items):
    result = {}
    for report_index, report in enumerate(items):
        for issue_index, issue in enumerate(report["object"]["issues"]):
            identity = key(issue)
            assert identity not in result
            result[identity] = (report_index, issue_index, issue)
    return result


def hex_bytes(value):
    return bytes.fromhex(value.removeprefix("0x"))


def word_address(word):
    assert len(word) == 32 and word[:12] == bytes(12)
    return "0x" + word[12:].hex()


def steps_summary(trace, factory):
    summaries = []
    for index, step in enumerate(trace["steps"]):
        summary = {k: v for k, v in step.items() if k not in ("input", "calldata")}
        summary["stepIndex"] = index
        for field in ("input", "calldata"):
            raw = hex_bytes(step[field])
            summary[field + "Bytes"] = len(raw)
            summary[field + "Sha256"] = sha(raw)
        if index == 0:
            supplied = hex_bytes(step["calldata"])
            creation = hex_bytes(step["input"])
            assert not supplied or creation.endswith(supplied)
            prefix = creation[:-len(supplied)] if supplied else creation
            summary["creationCodeBytes"] = len(prefix)
            summary["creationCodeSha256"] = sha(prefix)
            if factory:
                assert len(supplied) >= 128
                words = [supplied[n:n + 32] for n in range(0, 128, 32)]
                summary["constructorAbiFirst128Bytes"] = {
                    "implementation": word_address(words[0]),
                    "feeToken": word_address(words[1]),
                    "flatFee": str(int.from_bytes(words[2], "big")),
                    "feeRecipient": word_address(words[3]),
                }
                # This is a source constraint, not a new concrete execution.
                assert word_address(words[0]) == "0x" + "0" * 39 + "1"
                assert word_address(words[3]) != "0x" + "0" * 40
                assert int.from_bytes(words[2], "big") == 0 or int.from_bytes(words[1], "big") != 0
                summary["constructorTrailingModelDataBytes"] = len(supplied) - 128
        else:
            summary["input"] = step["input"]
            supplied = hex_bytes(step["input"])
            if factory and supplied[:4].hex() == "affdf337":
                assert len(supplied) == 132
                words = [supplied[n:n + 32] for n in range(4, 132, 32)]
                decoded = {"owner": word_address(words[0]),
                           "destination": word_address(words[1]),
                           "delaySeconds": int.from_bytes(words[2], "big"),
                           "limitsRoot": "0x" + words[3].hex()}
                if step.get("resolved_input") is not None:
                    assert step["resolved_input"] == [decoded["owner"], decoded["destination"],
                                                      decoded["delaySeconds"], words[3].hex()]
                summary["independentlyDecodedDeployInput"] = decoded
        summaries.append(summary)
    return summaries


def short_value(value):
    if isinstance(value, str) and len(value) > 180:
        return {"type": "string", "characters": len(value),
                "utf8Sha256": sha(value.encode()), "prefix": value[:66]}
    return value


def differences(before, after, path="tx_sequence"):
    if type(before) is not type(after):
        return [{"path": path, "before": short_value(before), "after": short_value(after)}]
    if isinstance(before, dict):
        assert before.keys() == after.keys(), (path, before.keys(), after.keys())
        return [entry for k in before for entry in differences(before[k], after[k], path + "." + k)]
    if isinstance(before, list):
        assert len(before) == len(after), path
        return [entry for i, (a, b) in enumerate(zip(before, after))
                for entry in differences(a, b, f"{path}[{i}]")]
    return [] if before == after else [{"path": path, "before": short_value(before), "after": short_value(after)}]


ASSESSMENTS = {
    "EXP-1": "The predicate is the inclusive deadline of a signed sweep order. The complete issue and trace equal the preserved 198aa5ba report. That earlier concrete replay returned InvalidAmount() at timestamp 0; no new replay was run for this review. Signed deadlines, authorization and timestamp/inclusion assumptions remain relevant.",
    "EXP-2": "The predicate bounds signed withdrawal-request submission, not delayed execution. The complete issue and trace equal the preserved 198aa5ba report. Its earlier concrete replay returned ZeroAmount() at timestamp 0. The raw model deploys the self-locked implementation, while separate historical tests exercise valid initialized clones. No new replay was run.",
    "EXP-3": "The predicate bounds signed destination-proposal submission; activation remains delayed by twice the configured delay. The complete issue and trace equal the preserved 198aa5ba report, whose earlier concrete replay returned InvalidDestination() at timestamp 0. No new replay was run.",
    "R4": "The modeled clone record has no filename or line. The unchanged creation-code prefix and prior clone-runtime tests support PC30 being GAS and PC31 DELEGATECALL in the concrete EIP-1167 runtime. The new constructor arguments still choose implementation 0x1. On an EVM where that address has no deployed code, the source rejects creation before the clone trace. This is source inference for the changed trace, not a newly executed revert or a universal SWC-110 exception.",
    "R5": "Initialization follows the fee-token call in the real source. deploy remains nonReentrant, the clone is freshly created from the fixed implementation, and initialize makes no external call. The new modeled deploy origin and delay differ from the old trace; they are decoded explicitly here. The new implementation=0x1 constructor is constrained by the code-length guard, without a new concrete replay.",
    "R6": "Prior bytecode and focused test evidence identifies PC1170 as releasing the reentrancy guard after initialization; its optimizer source map points to the ENTERED source line. The complete observation and creation-code prefix are unchanged. The new constructor recipient differs, but implementation remains 0x1, subject to the source code-length guard. No fresh concrete execution is claimed.",
    "R7": "balanceOf(FEE_RECIPIENT) follows another configured-token read. Real fee-charging factories fail closed when a read reverts or a successful transfer changes balances incorrectly. The current modeled constructor is constrained by implementation=0x1; that does not dismiss the independently demonstrated N1 availability risk. No new concrete replay was run.",
    "R8": "allowance(msg.sender,address(this)) follows token balance reads. Unlike the old 198aa5ba trace, the two new deploy calls have distinct owner, destination, delay and limitsRoot values; an identical-call AlreadyDeployed argument does not apply to this report. Both new calls originate from the same modeled DEAD... account. The implementation=0x1 constructor remains source-constrained, while reverting allowance reads remain a real N1 dependency for valid factories.",
    "R9": "CREATE2 follows the fee-token call under the held guard. Salt, fixed implementation and initializer bind the resulting account. This new trace is byte-identical to the new R5 trace, not to its own 198aa5ba trace. The new constructor chooses implementation=0x1 and is subject to the code-length guard; no fresh replay is claimed.",
    "R10": "The external call target is constructor-selected immutable FEE_TOKEN, not owner or destination supplied to deploy. The new symbolic constructor uses the modeled DEAD... fee token and implementation=0x1. The latter is a source-level creation constraint; the former represents a real token-selection assumption. Caller-controlled hooks and changeable token behavior still require separate operational decisions.",
    "R11": "SafeERC20 consumes call success and the bool/no-return-data rule, and the factory branches on the result. A clean failed transfer can intentionally waive the fee only after before/after checks. The new trace has two different destinations but the same DEAD... caller for both deploy calls; the historical two-caller test is related counterevidence, not this trace. The new constructor remains constrained by implementation=0x1, with no new concrete execution.",
}


def build():
    manifest = parse((HERE / "raw-manifest.json").read_bytes())
    for name, entry in manifest["files"].items():
        data = (HERE / name).read_bytes()
        assert len(data) == entry["bytes"] and sha(data) == entry["sha256"], name
    assert manifest["sourceCommit"] == CURRENT
    with zipfile.ZipFile(HERE / "artifact.zip") as archive:
        assert len(archive.namelist()) == 2
        for name in archive.namelist():
            assert archive.read(name) == (HERE / Path(name).name).read_bytes()

    raw = (HERE / "report.log").read_bytes()
    meta = parse((HERE / "metadata.json").read_bytes())
    assert meta["requestedCommit"] == meta["checkoutCommit"] == CURRENT
    assert meta["analysisOutcome"] == "failure" and meta["runnerExitCode"] == 1
    assert meta["truncated"] is False and meta["reportPresent"] is True
    assert meta["retainedBytes"] == meta["fullReportBytes"] == len(raw)
    assert meta["fullReportSha256"] == sha(raw)
    old_raw = blob(PRIOR_PACKET_COMMIT, PRIOR_PACKET + "/report.log")
    old_review_raw = blob(PRIOR_PACKET_COMMIT, PRIOR_PACKET + "/mythril-198aa5ba-dispositions.json")
    assert sha(old_raw) == "ce72f158a9d7d3bff3f6a2dafa2fde390cafcb5cf79364d4980f0c7cb3a6de00"
    assert sha(old_review_raw) == "47c6476726c73835af2cf036a484e03f3e201f321d3adc40b038984deb963d9a"
    old_review = parse(old_review_raw)
    current_reports, prior_reports = reports(raw), reports(old_raw)
    current, prior = indexed(current_reports), indexed(prior_reports)
    assert current.keys() == prior.keys() == old_review["findingsByContractSwcPc"].keys()

    identities = {}
    for path in ["packages/contracts/src", "packages/contracts/lib",
                 "packages/contracts/scripts/run-mythril.sh",
                 "packages/contracts/scripts/mythril-compat.py",
                 ".github/workflows/contract-analysis.yml", "packages/contracts/foundry.toml"]:
        a, b = object_id(PRIOR, path), object_id(CURRENT, path)
        assert a == b
        identities[path] = {"priorGitObject": a, "currentGitObject": b, "identical": True}

    source_files = {}
    paths = list(old_review["sourceFiles"]) + [".github/workflows/contract-analysis.yml", "packages/contracts/foundry.toml"]
    for path in paths:
        a, b = blob(PRIOR, path), blob(CURRENT, path)
        assert a == b, path
        source_files[path] = {"priorGitBlob": object_id(PRIOR, path),
                              "currentGitBlob": object_id(CURRENT, path),
                              "bytes": len(b), "sha256": sha(b), "identical": True}

    findings = {}
    for identity, (report_index, issue_index, issue) in current.items():
        old_report_index, old_issue_index, previous = prior[identity]
        old_record = old_review["findingsByContractSwcPc"][identity]
        assert old_record["issueCanonicalJsonSha256"] == sha(canonical(previous))
        assert old_record["traceCanonicalJsonSha256"] == sha(canonical(previous["tx_sequence"]))
        obs = {k: v for k, v in issue.items() if k != "tx_sequence"}
        old_obs = {k: v for k, v in previous.items() if k != "tx_sequence"}
        assert obs == old_obs
        factory = TARGETS[report_index] == "PolicyAccountFactory"
        prior_steps = steps_summary(previous["tx_sequence"], factory)
        current_steps = steps_summary(issue["tx_sequence"], factory)
        assert current_steps[0]["creationCodeSha256"] == prior_steps[0]["creationCodeSha256"]
        changes = differences(previous["tx_sequence"], issue["tx_sequence"])
        assert all(x["path"].startswith("tx_sequence.steps[") for x in changes)
        label = old_record["historicalLabelForSameLocation"]
        review = copy.deepcopy(old_record["review"])
        review["assessment"] = ASSESSMENTS[label]
        if label == "R4":
            review["productionReachability"] = "The supplied creation-to-fallback trace is blocked by the constructor on an EVM where implementation 0x1 has no deployed code. Separate historical valid-implementation tests cover exact clone runtime, fallback/receive and initialization authority. No new chain configuration is qualified."
        if label == "R8":
            review["confirmedRisk"] = "N1 availability risk is real and conditional. This new distinct-call symbolic sequence does not establish a successful exploit. The prior identical-call AlreadyDeployed constraint is withdrawn for this trace."
            review["withdrawnPriorTraceArgument"] = "The two current deploy inputs are not identical; do not infer a second-call AlreadyDeployed rejection from the previous report."
        if label == "R11":
            review["historicalFixtureLimit"] = "test_replay_R11_twoCallerSequenceWaivesOnlyBecauseTokenReturnsFalse uses a historical two-caller sequence. Both new report calls have the same caller."
        for test in review["tests"]:
            source = blob(CURRENT, test["path"]).decode()
            assert re.search(r"function\s+" + re.escape(test["test"]) + r"\s*\(", source)
            test["presentAtCurrentSource"] = True
            test["sourceSha256"] = sha(source.encode())
            test["prior445SnapshotPassed"] = test.pop("locallyPassedIn445Snapshot")
            test["origin"] = "Earlier 445-test non-fuzz snapshot only; no new execution. Related historical counterevidence, not an exact current-trace replay."

        location = {"sourceMap": issue["sourceMap"], "reportedFilename": issue.get("filename"),
                    "reportedLine": issue.get("lineno")}
        if issue.get("filename"):
            filename = issue["filename"]
            relative = filename.split("/packages/contracts/")[-1]
            path = "packages/contracts/" + relative
            data = blob(CURRENT, path)
            start, length = map(int, issue["sourceMap"].split(":")[:2])
            assert data[start:start + length].decode() == issue["code"]
            location.update({"repositoryPath": path, "sourceSha256": sha(data),
                             "byteStart": start, "byteLength": length,
                             "sourceSliceMatchesReportedCode": True})
        else:
            location["sourceSliceMatchesReportedCode"] = None
            location["limitation"] = "Modeled clone/internal generated code; report supplies no filename or line."

        replay = {"newConcreteReplayPerformed": False, "priorSourceCommit": PRIOR,
                  "priorEvidenceCommit": PRIOR_PACKET_COMMIT,
                  "priorEvidencePath": PRIOR_PACKET + "/mythril-current-concrete-replay.json",
                  "priorEvidenceSha256": old_review["freshConcreteReplay"]["sha256"],
                  "sameTraceAndCreationInputAsPriorReplay": not changes}
        if not factory:
            replay["priorResultForByteIdenticalTrace"] = old_record["freshConcreteReplay"]
            replay["scope"] = "Prior replay applies to the same bytes under its recorded timestamp-zero/default-Anvil assumptions; it is not a new execution or a full symbolic-state replay."
        else:
            args = current_steps[0]["constructorAbiFirst128Bytes"]
            replay["currentSourceConstraint"] = {
                "implementation": args["implementation"],
                "constructorAddressPrerequisitesNonzero": True,
                "guard": "if (implementation_.code.length == 0) revert ImplementationHasNoCode();",
                "sourcePath": "packages/contracts/src/PolicyAccountFactory.sol",
                "condition": "The target EVM has no deployed code at address 0x1, as in the earlier default-Anvil replay.",
                "kind": "source inference, not a new executed revert",
            }
            replay["scope"] = "Old Factory concrete inputs differ. Do not relabel the earlier replay as execution of these new traces."

        findings[identity] = {
            "historicalLabelForSameLocation": label, "analyzedTarget": TARGETS[report_index],
            "currentReportIndex": report_index, "currentIssueIndex": issue_index,
            "priorReportIndex": old_report_index, "priorIssueIndex": old_issue_index,
            "observation": obs, "sourceTrace": location,
            "observationWithoutTransactionSequenceIdentical": True,
            "completeIssueIdentical": issue == previous,
            "priorIssueCanonicalJsonSha256": sha(canonical(previous)),
            "currentIssueCanonicalJsonSha256": sha(canonical(issue)),
            "priorTraceCanonicalJsonSha256": sha(canonical(previous["tx_sequence"])),
            "currentTraceCanonicalJsonSha256": sha(canonical(issue["tx_sequence"])),
            "traceInitialStateIdentical": previous["tx_sequence"].get("initialState") == issue["tx_sequence"].get("initialState"),
            "traceChangedPrimitiveFields": changes,
            "priorSteps": prior_steps, "currentSteps": current_steps,
            "concreteEvidenceAndCurrentConstraint": replay, "review": review,
            "approval": {"approved": False, "gateExceptionAuthorized": False, "suppress": False,
                         "status": "observational source review; strict failure unchanged"},
        }

    identical = [k for k, v in findings.items() if v["completeIssueIdentical"]]
    changed = [k for k, v in findings.items() if v["traceChangedPrimitiveFields"]]
    assert len(findings) == 11 and len(identical) == 3 and len(changed) == 8
    assert sum(len(v["traceChangedPrimitiveFields"]) for v in findings.values()) == 45
    r8 = findings["PolicyAccountFactory|SWC-113|PC-1781"]
    assert r8["priorSteps"][1]["input"] == r8["priorSteps"][2]["input"]
    assert r8["currentSteps"][1]["input"] != r8["currentSteps"][2]["input"]
    r11 = findings["PolicyAccountFactory|SWC-104|PC-2978"]
    assert r11["priorSteps"][1]["origin"] != r11["priorSteps"][2]["origin"]
    assert r11["currentSteps"][1]["origin"] == r11["currentSteps"][2]["origin"]
    assert current["PolicyAccountFactory|SWC-107|PC-999"][2]["tx_sequence"] == current["PolicyAccountFactory|SWC-107|PC-2887"][2]["tx_sequence"]
    severities = {}
    for _, _, issue in current.values():
        severities[issue["severity"]] = severities.get(issue["severity"], 0) + 1
    assert severities == {"Low": 8, "Medium": 3}
    summaries = []
    for i, name in enumerate(TARGETS):
        a, b = prior_reports[i], current_reports[i]
        summaries.append({"target": name, "priorByteOffset": a["byteOffset"],
                          "currentByteOffset": b["byteOffset"],
                          "priorObjectBytes": a["byteLength"], "currentObjectBytes": b["byteLength"],
                          "issues": len(b["object"]["issues"]),
                          "completeReportObjectIdentical": a["object"] == b["object"],
                          "priorCanonicalJsonSha256": sha(canonical(a["object"])),
                          "currentCanonicalJsonSha256": sha(canonical(b["object"]))})

    return {
        "schemaVersion": 1, "documentType": "observational-finding-comparison-not-gate-policy",
        "reviewer": "contract_security", "reviewDate": "2026-11-19",
        "analyzedSourceCommit": CURRENT, "priorAnalyzedSourceCommit": PRIOR,
        "currentProvenance": {"runId": 44472897672, "jobId": 135386401249, "artifactId": 14508101082,
            "jobUrl": "https://github.com/djshellshoxxx/GhostPay/actions/runs/44472897672/job/135386401249",
            "reportBytes": len(raw), "reportSha256": sha(raw), "metadata": meta,
            "rawManifest": "raw-manifest.json", "newLocalAnalyzerCampaignPerformed": False,
            "newConcreteReplayPerformed": False},
        "priorProvenance": {"evidenceCommit": PRIOR_PACKET_COMMIT, "packetPath": PRIOR_PACKET,
            "reportSha256": sha(old_raw), "dispositionsSha256": sha(old_review_raw),
            "originalProvenance": old_review["provenance"]},
        "gate": {"hostedConclusion": "failure", "runnerExitCode": 1, "findings": len(findings),
                 "severityCounts": severities, "approvedDispositions": 0, "releaseBlockerRemains": True,
                 "runnerOrGatePolicyChanged": False},
        "identitySummary": {"sameContractSwcPcKeys": True, "currentOnly": [], "priorOnly": [],
            "sameObservationsExcludingTransactionSequences": 11, "completeIssueIdentityKeys": identical,
            "changedTraceKeys": changed, "changedPrimitiveFields": 45,
            "changesConfinedToFactoryTransactionSteps": True,
            "interpretation": "The same eleven location keys and unchanged source do not make the Factory traces identical. All eight changed; this is not a timing-only rerun."},
        "sourceIdentity": identities, "sourceFiles": source_files, "reports": summaries,
        "findingsByContractSwcPc": findings,
        "ownerDecisions": old_review["ownerDecisions"],
        "historicalTestQualification": {"sourceRecord": PRIOR_PACKET + "/mythril-198aa5ba-dispositions.json",
            "qualification": old_review["existingTestQualification"],
            "newTestsRunForThisReview": False},
        "limitations": [
            "No new symbolic campaign, concrete replay, native test, fuzz campaign or production-chain qualification was performed by this review.",
            "success=true/error=null and a complete retained report do not prove all analyzer paths completed. This report uses the old runner and lacks the stronger per-target process/compiler/campaign sidecars proposed by the separate #255 owner.",
            "Source trees, runner/config blobs and supplied creation-code prefixes were compared directly. Equal version banners alone are not a native compiler-binary hash or a full campaign identity.",
            "The three expiry traces exactly match the earlier concrete replay inputs. All eight Factory traces differ; their current code-length constraint is source inference conditional on no deployed code at address 0x1.",
            "R8 no longer has identical deploy inputs; its old AlreadyDeployed argument is not applicable. R11 no longer has two different callers; the two-caller test remains historical counterevidence only.",
            "The prior 445-test snapshot excluded fuzz/invariants; its full-suite compilation was SIGKILLed. No full pass or new qualification at 28edbcf is implied.",
            "Conditional fee-token freeze and sender-hook/gas-waiver revenue risks remain real even if an exact symbolic creation trace is constrained.",
            "This file is not an allowlist, authenticated owner approval, #255 campaign record or external audit. All eleven findings remain strict failures with zero approved exceptions.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    output = (json.dumps(build(), indent=2, ensure_ascii=False) + "\n").encode()
    destination = HERE / "comparison-and-dispositions.json"
    if options.check:
        assert destination.read_bytes() == output, "Generated comparison differs"
        print("PASS: five raw files, ZIP parity, exact source/test bindings and all eleven finding comparisons verified; strict failure unchanged.")
    else:
        destination.write_bytes(output)
        print(f"Wrote {destination.name}: {len(output)} bytes; {sha(output)}")
