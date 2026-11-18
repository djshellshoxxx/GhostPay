#!/usr/bin/env python3
"""Parse existing npm workspace test output without executing project code.

The log can be live. A complete-looking summary is never substituted for the
coordinator's collected process exit code. Minimal-reporter output does not
retain individual skipped-test identities, which are left unknown here.
"""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
WORKSPACE = re.compile(r"^> (@ghostpay/[^@\s]+)@([^\s]+) test\s*$", re.M)
RUN = re.compile(r"^\s*RUN\s+v([^\s]+)\s+([^\n]+)$", re.M)
COUNTS = re.compile(r"(\d+)\s+(passed|failed|skipped|todo|pending|cancelled)")
FAILURE = re.compile(
    r"npm error|FATAL ERROR|heap out of memory|ERR_WORKER_OUT_OF_MEMORY|"
    r"Worker (?:exited|terminated) unexpectedly|worker (?:exited|terminated) unexpectedly|"
    r"^\s*(?:FAIL\s|Killed\s*$)|\bSIGKILL\b|"
    r"Unhandled (?:Error|Rejection|Errors)|"
    r"(?:ERROR:|Error:)\s+Coverage|Coverage[^\n]*(?:does not meet|below).*threshold|"
    r"Test timed out in|No test files found",
    re.M,
)


def utc(timestamp=None):
    value = datetime.now(timezone.utc) if timestamp is None else datetime.fromtimestamp(timestamp, timezone.utc)
    return value.isoformat()


def summary(body, label, issues, context):
    matches = list(re.finditer(r"^\s*" + re.escape(label) + r"\s+([^\n]+)$", body, re.M))
    if not matches:
        return None
    if len(matches) != 1:
        issues.append(f"{context}: {len(matches)} {label!r} summaries in one phase")
    raw = matches[-1].group(1).strip()
    values = {name: int(number) for number, name in COUNTS.findall(raw)}
    declared = re.search(r"\((\d+)\)\s*$", raw)
    total = int(declared.group(1)) if declared else None
    if total is not None and sum(values.values()) != total:
        issues.append(f"{context}: {label} counts sum to {sum(values.values())}, declared {total}")
    return {"raw": raw, "counts": values, "declared_total": total}


def parse_phase(body, version, directory, index, issues, context):
    tests = summary(body, "Tests", issues, context)
    files = summary(body, "Test Files", issues, context)
    all_rows = re.findall(r"^All files\s*\|([^\n]+)$", body, re.M)
    coverage = None
    if all_rows:
        values = [part.strip() for part in all_rows[-1].split("|")[:4]]
        try:
            coverage = dict(zip(["statements", "branches", "functions", "lines"], map(float, values)))
        except ValueError:
            issues.append(f"{context}: unrecognized aggregate coverage row {all_rows[-1]!r}")
    # Vitest 5's agent-aware text reporter omits the table when every file is
    # fully covered; its separate summary still reports all four percentages.
    coverage_summary = {}
    for label in ["Statements", "Branches", "Functions", "Lines"]:
        matches = re.findall(r"^" + label + r"\s*:\s*([\d.]+)%\s*\(\s*(\d+)\s*/\s*(\d+)\s*\)", body, re.M)
        if matches:
            percentage, covered, total = matches[-1]
            coverage_summary[label.lower()] = {"percent": float(percentage), "covered": int(covered), "total": int(total)}
    if coverage is None and len(coverage_summary) == 4:
        coverage = {key: value["percent"] for key, value in coverage_summary.items()}
    if coverage is not None and len(coverage_summary) == 4:
        if any(abs(coverage[key] - value["percent"]) > 0.011 for key, value in coverage_summary.items()):
            issues.append(f"{context}: coverage table and percentage summary disagree")
    duration = re.findall(r"^\s*Duration\s+([^\n]+)$", body, re.M)
    start = re.findall(r"^\s*Start at\s+([^\n]+)$", body, re.M)
    coverage_enabled = "Coverage enabled with" in body
    return {
        "index": index,
        "runner": "vitest",
        "version": version,
        "directory": directory.strip(),
        "tests": tests,
        "test_files": files,
        "coverage_enabled": coverage_enabled,
        "coverage_percent": coverage,
        "coverage_summary": coverage_summary,
        "duration_text": duration[-1].strip() if duration else None,
        "start_clock_text": start[-1].strip() if start else None,
        "summary_complete": tests is not None and files is not None and (not coverage_enabled or coverage is not None),
    }


def parse(log, source, exit_code, session):
    before = log.stat()
    raw = log.read_bytes()
    after = log.stat()
    text = ANSI.sub("", raw.decode("utf-8", errors="replace"))
    headers = list(WORKSPACE.finditer(text))
    issues = []
    workspaces = []
    for index, header in enumerate(headers):
        end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        body = text[header.end():end]
        name, version = header.groups()
        command = next((line[2:] for line in body.splitlines() if line.startswith("> ")), None)
        starts = list(RUN.finditer(body))
        phases = []
        for pindex, start in enumerate(starts):
            pend = starts[pindex + 1].start() if pindex + 1 < len(starts) else len(body)
            phases.append(parse_phase(body[start.end():pend], *start.groups(), pindex + 1, issues, name))
        if not starts and command and "hardhat test" in command:
            passing = re.findall(r"^\s*(\d+) passing(?:\s|$)", body, re.M)
            counts = {}
            for term in ["passing", "pending", "failing"]:
                found = re.findall(r"^\s*(\d+) " + term + r"(?:\s|$)", body, re.M)
                if found:
                    counts[{"passing": "passed", "pending": "skipped", "failing": "failed"}[term]] = int(found[-1])
            phases.append({
                "index": 1, "runner": "hardhat/mocha", "version": None,
                "tests": {"counts": counts, "declared_total": sum(counts.values()), "raw": "Mocha totals"} if counts else None,
                "test_files": None, "coverage_enabled": False, "coverage_percent": None,
                "summary_complete": bool(passing),
            })
        expected = len(re.findall(r"\bvitest\s+run\b", command or ""))
        if not expected and command and "hardhat test" in command:
            expected = 1
        markers = []
        for match in FAILURE.finditer(body):
            line_start = body.rfind("\n", 0, match.start()) + 1
            line_end = body.find("\n", match.end())
            if line_end < 0:
                line_end = len(body)
            markers.append({
                "line": text.count("\n", 0, header.end() + line_start) + 1,
                "text": body[line_start:line_end].strip(),
            })
        totals = {}
        for phase in phases:
            for key, value in (phase.get("tests") or {}).get("counts", {}).items():
                totals[key] = totals.get(key, 0) + value
        complete = bool(expected) and len(phases) == expected and all(p["summary_complete"] for p in phases)
        failed = bool(markers) or totals.get("failed", 0) > 0
        status = "reported_failure" if failed else "summaries_complete" if complete else "incomplete"
        workspaces.append({
            "workspace": name, "package_version": version, "command": command,
            "line_start": text.count("\n", 0, header.start()) + 1,
            "line_end": text.count("\n", 0, end) + 1,
            "expected_runner_phases": expected,
            "phases": phases, "test_totals": totals,
            "status": status, "failure_markers": markers,
            "experimental_proxy_warning_count": body.count("[UNDICI-EHPA]"),
            "individual_skipped_test_names": None,
        })
    totals = {}
    for workspace in workspaces:
        for key, value in workspace["test_totals"].items():
            totals[key] = totals.get(key, 0) + value
    if len(set(w["workspace"] for w in workspaces)) != len(workspaces):
        issues.append("Repeated workspace invocations are retained separately; do not deduplicate their execution totals.")
    if before.st_size != after.st_size or len(raw) != after.st_size:
        issues.append("Log changed while the snapshot was read; this is a partial captured prefix, not a final artifact.")
    incomplete = [w["workspace"] for w in workspaces if w["status"] == "incomplete"]
    failed = [w["workspace"] for w in workspaces if w["status"] == "reported_failure"]
    if exit_code is None:
        outcome = "process_exit_not_collected"
    elif exit_code != 0:
        outcome = "process_failed"
    elif incomplete or failed or issues:
        outcome = "exit_zero_with_evidence_requiring_review"
    else:
        outcome = "completed_successfully"
    return {
        "observed_utc": utc(), "source_commit": source,
        "log_path": str(log), "log_bytes_captured": len(raw),
        "log_sha256_captured": hashlib.sha256(raw).hexdigest(),
        "log_modified_utc": utc(after.st_mtime),
        "existing_exec_session": session, "process_exit_code": exit_code,
        "outcome": outcome, "workspace_invocations_started": len(workspaces),
        "workspace_summaries_complete": sum(w["status"] == "summaries_complete" for w in workspaces),
        "incomplete_workspaces": incomplete, "failure_workspaces": failed,
        "test_totals_from_reported_summaries": totals,
        "validation_issues": issues,
        "limitations": [
            "Counts are executed test cases in this npm invocation, not unique behaviors or independent security properties.",
            "A reported summary does not independently reveal a workspace process exit; aggregate exit is supplied only after coordinator observation.",
            "Minimal reporter does not identify every skipped test. Skip reasons remain unknown unless separately established from retained evidence.",
            "Coverage percentages are each phase's reported aggregate; they are not combined across workspaces.",
            "Start-clock strings retain runtime-local formatting and are not relabeled UTC.",
        ],
        "workspaces": workspaces,
    }


def markdown(record):
    def count(workspace, key):
        return workspace["test_totals"].get(key, 0)

    if record["outcome"] == "completed_successfully":
        boundary = (
            f"All {record['workspace_invocations_started']} workspace invocations have complete summaries, "
            "and the coordinator collected aggregate exit 0. "
            f"The {record['test_totals_from_reported_summaries'].get('skipped', 0)} skipped cases remain unexecuted; "
            "separate phases without coverage do not add coverage evidence."
        )
    else:
        boundary = (
            "These totals include only summaries already printed. Incomplete workspaces and an uncollected "
            "aggregate exit prevent a whole-run pass claim."
        )
    lines = [
        "# Workspace test execution report", "",
        f"Observed UTC: `{record['observed_utc']}`. Source: `{record['source_commit']}`.", "",
        f"Outcome: **{record['outcome']}**. Existing session: `{record['existing_exec_session']}`. "
        f"Collected process exit: `{record['process_exit_code']}`.", "",
        f"Workspace invocations started: **{record['workspace_invocations_started']}**; "
        f"complete summaries without failure markers: **{record['workspace_summaries_complete']}**.", "",
        "Reported test totals: `" + json.dumps(record["test_totals_from_reported_summaries"], sort_keys=True) + "`.", "",
        boundary, "",
        "| Workspace | Passed | Failed | Skipped | Todo | Coverage S/B/F/L | Evidence status |",
        "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    for workspace in record["workspaces"]:
        coverages = []
        for phase in workspace["phases"]:
            coverage = phase.get("coverage_percent")
            if coverage:
                coverages.append(" / ".join(f"{coverage[k]:.2f}" for k in ["statements", "branches", "functions", "lines"]))
        lines.append(f"| {workspace['workspace']} | {count(workspace, 'passed')} | {count(workspace, 'failed')} | "
                     f"{count(workspace, 'skipped')} | {count(workspace, 'todo')} | {'; '.join(coverages) or 'not reported'} | {workspace['status']} |")
    lines += ["", "## Failures and incomplete execution", ""]
    for workspace in record["workspaces"]:
        if workspace["status"] != "summaries_complete":
            lines.append(f"- `{workspace['workspace']}`: {workspace['status']}; "
                         f"{len(workspace['phases'])}/{workspace['expected_runner_phases']} runner phases observed.")
        for marker in workspace["failure_markers"]:
            lines.append(f"  - Log line {marker['line']}: `{marker['text'].replace('`', chr(39))}`")
    if not record["failure_workspaces"] and not record["incomplete_workspaces"]:
        lines.append("No workspace summary failure/incomplete state was identified in the captured log.")
    lines += ["", "## Validation and limits", ""]
    lines += ["- " + issue for issue in record["validation_issues"]]
    lines += ["- " + limitation for limitation in record["limitations"]]
    lines += ["", f"Captured log SHA-256: `{record['log_sha256_captured']}` ({record['log_bytes_captured']} bytes).", ""]
    if record.get("coordinator_result_metadata") is not None:
        lines += ["## Collected execution metadata", "", "```json", json.dumps(record["coordinator_result_metadata"], indent=2), "```", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--source-file", type=Path, required=True)
    parser.add_argument("--output-prefix", type=Path, required=True)
    parser.add_argument("--process-exit-code", type=int)
    parser.add_argument("--result-file", type=Path, help="Existing coordinator-produced result metadata; does not run or poll tests")
    parser.add_argument("--session", default="55369")
    args = parser.parse_args()
    source = args.source_file.read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        raise SystemExit("Source file must contain one exact commit SHA")
    metadata = None
    metadata_raw = None
    exit_code = args.process_exit_code
    if args.result_file is not None:
        metadata_raw = args.result_file.read_bytes()
        metadata = json.loads(metadata_raw)
        if metadata.get("source") != source or type(metadata.get("exitCode")) is not int:
            raise SystemExit("Coordinator result must bind the same exact source and contain an integer exitCode")
        if exit_code is not None and exit_code != metadata["exitCode"]:
            raise SystemExit("Explicit exit code conflicts with coordinator result")
        if Path(metadata.get("log", "")).name != args.log.name:
            raise SystemExit("Coordinator result names a different log")
        exit_code = metadata["exitCode"]
    record = parse(args.log, source, exit_code, args.session)
    record["source_record_path"] = str(args.source_file)
    if metadata is not None:
        record["coordinator_result_path"] = str(args.result_file)
        record["coordinator_result_sha256"] = hashlib.sha256(metadata_raw).hexdigest()
        record["coordinator_result_metadata"] = metadata
    args.output_prefix.parent.mkdir(parents=True, exist_ok=True)
    args.output_prefix.with_suffix(".json").write_text(json.dumps(record, indent=2) + "\n")
    args.output_prefix.with_suffix(".md").write_text(markdown(record))
    print(json.dumps({key: record[key] for key in ["observed_utc", "source_commit", "outcome", "workspace_invocations_started", "workspace_summaries_complete", "incomplete_workspaces", "failure_workspaces", "test_totals_from_reported_summaries", "validation_issues"]}, indent=2))


if __name__ == "__main__":
    main()
