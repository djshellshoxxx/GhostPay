#!/usr/bin/env python3
"""Retain a bounded log tail and source/exit metadata; never change the analyzer gate."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
report = source / "report.log"
limit = 8 * 1024 * 1024
present = report.is_file() and not report.is_symlink()
size = 0
digest = None
retained = b""
if present:
    with report.open("rb") as handle:
        digest = hashlib.file_digest(handle, "sha256").hexdigest()
        size = os.fstat(handle.fileno()).st_size
        handle.seek(max(0, size - limit))
        retained = handle.read(limit)
(destination / "report.log").write_bytes(retained)
exit_file = source / "exit-code.txt"
exit_code = None
if exit_file.is_file() and not exit_file.is_symlink() and exit_file.stat().st_size <= 16:
    with exit_file.open() as handle:
        value = handle.read(16).strip()
    if value.isdecimal() and 0 <= int(value) <= 255:
        exit_code = int(value)
commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=False)
metadata = {
    "schemaVersion": 1,
    "analyzer": os.environ.get("ANALYZER", "unknown"),
    "requestedCommit": os.environ.get("REQUESTED_COMMIT"),
    "checkoutCommit": commit.stdout.strip() if commit.returncode == 0 else None,
    "analysisOutcome": os.environ.get("ANALYSIS_OUTCOME", "unknown"),
    "runnerExitCode": exit_code,
    "reportPresent": present,
    "fullReportBytes": size,
    "fullReportSha256": digest,
    "retainedBytes": len(retained),
    "truncated": size > limit,
    "retention": "At most the last 8 MiB; truncation applies only to the artifact, not the gate's input.",
}
(destination / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
