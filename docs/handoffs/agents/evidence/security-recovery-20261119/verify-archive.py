"""Verify preserved evidence bytes without requiring the original scratch paths."""

import hashlib
import json
from pathlib import Path
import zipfile


root = Path(__file__).resolve().parent
manifest = json.loads((root / "manifest.json").read_text())
for name, record in manifest["files"].items():
    data = (root / name).read_bytes()
    assert len(data) == record["bytes"], f"Size mismatch: {name}"
    assert hashlib.sha256(data).hexdigest() == record["sha256"], f"Hash mismatch: {name}"

handoff = json.loads((root / "g1/POLICY_CLIENT_20261119.json").read_text())
for name, record in handoff["evidence"].items():
    data = (root / "g1" / name).read_bytes()
    assert len(data) == record["bytes"], f"Original handoff size mismatch: {name}"
    assert hashlib.sha256(data).hexdigest() == record["sha256"], f"Original handoff hash mismatch: {name}"

mythril = root / "mythril-198aa5ba"
with zipfile.ZipFile(mythril / "mythril-198aa5ba.zip") as archive:
    assert sorted(archive.namelist()) == ["metadata.json", "report.log"]
    for name in archive.namelist():
        assert archive.read(name) == (mythril / name).read_bytes(), f"ZIP member mismatch: {name}"
metadata = json.loads((mythril / "metadata.json").read_text())
report = (mythril / "report.log").read_bytes()
assert len(report) == metadata["fullReportBytes"] == metadata["retainedBytes"]
assert hashlib.sha256(report).hexdigest() == metadata["fullReportSha256"]
assert metadata["truncated"] is False
assert metadata["requestedCommit"] == metadata["checkoutCommit"] == manifest["mythril"]["analyzedSourceCommit"]
print(f"Verified {len(manifest['files'])} original files, original G1 evidence hashes, and complete hosted artifact parity.")
