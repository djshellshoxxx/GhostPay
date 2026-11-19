#!/usr/bin/env python3
"""Independent installed-interface fixtures; never executes contract symbolic analysis."""
import contextlib
import hashlib
import importlib.util
import io
import json
import logging
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

import coloredlogs
import solcx.install
solcx.install.BINARY_DOWNLOAD_BASE = "https://binaries.soliditylang.org/{}-amd64/{}"

from mythril.analysis.report import Report
from mythril.ethereum.evmcontract import EVMContract
from mythril.laser.ethereum.svm import LaserEVM
from mythril.mythril import mythril_analyzer as analyzer_module

wrapper_path = Path("/workspace/scratch/b608f89bdf4a/GhostPay-checker-review/packages/contracts/scripts/mythril-compat.py")
spec = importlib.util.spec_from_file_location("independent_mythril_compat", wrapper_path)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
originals = (LaserEVM._check_execution_termination, LaserEVM._check_create_termination, Report.as_json)
original_handlers = tuple(logging.getLogger("mythril").handlers)
results = []

for mode in ["complete", "swallowed-keyboard-interrupt", "swallowed-exception"]:
    analyzer = analyzer_module.MythrilAnalyzer.__new__(analyzer_module.MythrilAnalyzer)
    analyzer.__dict__.update(contracts=[EVMContract(code="6000", name="ControlledFixture")],
        address=None, strategy="dfs", eth=None, use_onchain_data=False, max_depth=128,
        execution_timeout=900, loop_bound=3, create_timeout=10,
        disable_dependency_pruning=False, custom_modules_directory="")
    def controlled_symexec(*args, **kwargs):
        if mode == "swallowed-keyboard-interrupt":
            raise KeyboardInterrupt()
        if mode == "swallowed-exception":
            raise RuntimeError("controlled independent-review exception")
        return SimpleNamespace(execution_info=[])
    capture = io.StringIO()
    expected_json = []
    def original_analyzer_path():
        # Actual CLI calls this same logger setup after compatibility instrumentation.
        coloredlogs.install(fmt="%(name)s [%(levelname)s]: %(message)s", level=logging.ERROR)
        with patch.object(analyzer_module, "SymExecWrapper", controlled_symexec), \
             patch.object(analyzer_module, "fire_lasers", return_value=[]), \
             patch.object(analyzer_module, "retrieve_callback_issues", return_value=[]):
            report = analyzer.fire_lasers(transaction_count=3)
        expected_json.append(originals[2](report))
        print(report.as_json())
        return 0
    with tempfile.TemporaryDirectory(prefix="ghostpay-independent-completeness-") as temporary:
        output = Path(temporary) / "report.json"
        with contextlib.redirect_stdout(capture):
            status = wrapper.analyzed_main(original_analyzer_path, output)
        state = json.loads(output.read_text())
    assert capture.getvalue() == expected_json[0] + "\n"
    assert (LaserEVM._check_execution_termination, LaserEVM._check_create_termination, Report.as_json) == originals
    assert tuple(logging.getLogger("mythril").handlers) == original_handlers
    assert state["reportCount"] == 1 and state["instrumentationReady"] is True
    if mode == "complete":
        assert status == 0 and state["errorLogObserved"] is False and state["exceptionCount"] == 0
    else:
        assert status == 2 and state["errorLogObserved"] is True
        assert state["exceptionCount"] == (1 if mode == "swallowed-exception" else 0)
    results.append({"case": mode, "exitCode": status, "originalJsonUnchanged": True,
                    "hooksAndObserverRestored": True, "telemetry": state})

print(json.dumps({"sourceCommit": "47f41a818a2e63abef2c459730b712c1c6bd8a36",
    "scope": "Original installed Mythril 0.24.8 fire_lasers catch and Report.as_json paths; controlled SymExecWrapper and issue retrieval. No native symbolic contract campaign.",
    "compatSha256": hashlib.sha256(wrapper_path.read_bytes()).hexdigest(),
    "analyzerModuleSha256": hashlib.sha256(Path(analyzer_module.__file__).read_bytes()).hexdigest(),
    "results": results}, indent=2))
