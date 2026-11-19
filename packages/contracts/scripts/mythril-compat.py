#!/usr/bin/env python3
"""Preserve pinned Mythril analysis while exposing known incomplete-execution signals."""
import json
import logging
import os
from pathlib import Path
import sys


def analyzed_main(mythril_main, output):
    """Observe original timeout checks/report serialization; never alter symbolic state or settings."""
    state = {"schemaVersion": 1, "instrumentationReady": False, "reportCount": 0,
             "executionTimeoutObserved": False, "creationTimeoutObserved": False,
             "exceptionCount": 0, "errorLogObserved": False}
    original_execution = original_creation = original_json = None
    observer = None
    laser_class = report_class = None
    status = 2
    try:
        from mythril.laser.ethereum.svm import LaserEVM
        from mythril.analysis.report import Report
        laser_class, report_class = LaserEVM, Report
        original_execution = LaserEVM._check_execution_termination
        original_creation = LaserEVM._check_create_termination
        original_json = Report.as_json

        def execution(self):
            result = original_execution(self)
            if type(result) is not bool:
                state["errorLogObserved"] = True
                raise TypeError("unrecognized Mythril timeout result")
            if result is True:
                state["executionTimeoutObserved"] = True
            return result

        def creation(self):
            result = original_creation(self)
            if type(result) is not bool:
                state["errorLogObserved"] = True
                raise TypeError("unrecognized Mythril timeout result")
            if result is True:
                state["creationTimeoutObserved"] = True
            return result

        def as_json(self):
            state["reportCount"] += 1
            exceptions = self.exceptions
            if not isinstance(exceptions, list):
                state["errorLogObserved"] = True
                raise TypeError("unrecognized Mythril exceptions representation")
            state["exceptionCount"] += len(exceptions)
            return original_json(self)

        class ErrorObserver(logging.Handler):
            def emit(self, record):
                if record.levelno >= logging.ERROR:
                    state["errorLogObserved"] = True

        observer = ErrorObserver()
        logging.getLogger("mythril").addHandler(observer)
        LaserEVM._check_execution_termination = execution
        LaserEVM._check_create_termination = creation
        Report.as_json = as_json
        state["instrumentationReady"] = True
        try:
            result = mythril_main()
            status = 0 if result is None else result
        except SystemExit as error:
            status = 0 if error.code is None else error.code
        if type(status) is not int:
            status = 2
    finally:
        if laser_class is not None and original_execution is not None:
            laser_class._check_execution_termination = original_execution
            laser_class._check_create_termination = original_creation
        if report_class is not None and original_json is not None:
            report_class.as_json = original_json
        if observer is not None:
            logging.getLogger("mythril").removeHandler(observer)
        # Exclusive creation prevents old telemetry from replacing this invocation. The runner passes a
        # fresh path; crashes or failed writes leave missing data and therefore fail its strict gate.
        with Path(output).open("x", encoding="utf-8") as stream:
            json.dump(state, stream, sort_keys=True)
            stream.write("\n")
    if state["executionTimeoutObserved"] or state["creationTimeoutObserved"]:
        return 124
    if (state["instrumentationReady"] is not True or state["reportCount"] != 1
            or state["exceptionCount"] != 0 or state["errorLogObserved"]):
        return 2
    return status


def main():
    # py-solc-x1.1.1 uses a legacy host which returned503 during native qualification.
    # Set its transport constant before importing Mythril (which enumerates compiler versions).
    import solcx.install
    solcx.install.BINARY_DOWNLOAD_BASE = "https://binaries.soliditylang.org/{}-amd64/{}"
    from mythril.interfaces.cli import main as mythril_main
    if len(sys.argv) > 1 and sys.argv[1] == "analyze":
        output = os.environ.get("MYTHRIL_COMPLETENESS_FILE")
        if not output:
            print("::error::mythril: analyze requires a fresh completeness sidecar path", file=sys.stderr)
            return 2
        if os.path.lexists(output):
            print("::error::mythril: completeness sidecar path already exists", file=sys.stderr)
            return 2
        return analyzed_main(mythril_main, output)
    # Version and unrelated commands retain their existing CLI output/arguments/outcome.
    return mythril_main()


if __name__ == "__main__":
    raise SystemExit(main())
