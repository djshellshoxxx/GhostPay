#!/usr/bin/env python3
"""Read-only cross-review of archived 28edbcf replay evidence. Never starts Anvil."""

import argparse
import hashlib
import json
from pathlib import Path


SOURCE = "28edbcf55093a6d6056232fd59ef37a2ae832b9a"
REPORT_SHA = "84f4f5846b68054fac52dc4968da78996d520c03c4049318ddc62ba4424b642e"
PACKET_COMMIT = "5e753eb969455089acf40eca2d3a5859e3debb66"
RECEIPT_SHA = "f8422c3d962a5180f937dca5d6e8eef359e9dec005cd9db904b125bbb7fc3b5a"
MARKDOWN_SHA = "3cd4259955c571e5436ea0cb351530d990ff1a066fcb3bb2319fba677db3b1b2"
ARCHIVE = {
    "attempt-1/replay-current-mythril.py": (6835, "b233bb204a031e3d98d3dfa1829284f663e93db4965b172cf4693990edf794b3"),
    "attempt-1/mythril-current-concrete-replay.json": (6443, "6883ff7218075c76dfcd0e29966a8de01c2a8ebf5216a16f73f65005f1b2a64b"),
    "attempt-1/mythril-current-anvil.log": (0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
    "fixed-clock/replay-current-mythril.py": (7093, "2879956736c275eace36c6cf13e869a6f057bb83441d447e1eb41716d0f5b38a"),
    "fixed-clock/mythril-current-concrete-replay.json": (6510, "34d89c2e90138227e043a4b3a4001e0ac90964b80edd5951e4e2a6d327ed45c5"),
    "fixed-clock/mythril-current-anvil.log": (0, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def parse(raw):
    return json.loads(raw, object_pairs_hook=no_duplicates)


def identity(contract, swc, pc):
    return f"{contract}|SWC-{swc}|PC-{pc}"


def inspect(repository, tools_directory):
    packet = repository / "docs/completion/remaining-20261119/mythril-replay-evidence"
    receipt_bytes = (packet / "receipt.json").read_bytes()
    markdown_bytes = (packet.parent / "MYTHRIL_CURRENT_REPLAY_20261119.md").read_bytes()
    assert sha(receipt_bytes) == RECEIPT_SHA
    assert sha(markdown_bytes) == MARKDOWN_SHA
    receipt = parse(receipt_bytes)
    report_path = repository / "docs/handoffs/agents/evidence/mythril-28edbcf-20261119/report.log"
    raw = report_path.read_bytes()
    assert sha(raw) == receipt["report_sha256"] == REPORT_SHA
    assert receipt["source"] == SOURCE
    reports = [parse(line) for line in raw.splitlines() if line.startswith(b"{")]
    assert len(reports) == 5
    by_key = {}
    for ri, report in enumerate(reports):
        for ii, issue in enumerate(report["issues"]):
            key = identity(issue["contract"], issue["swc-id"], issue["address"])
            assert key not in by_key
            by_key[key] = (ri, ii, issue)
    assert len(by_key) == 11

    indexed_manifest = {entry["path"]: entry for entry in receipt["evidence"]}
    assert indexed_manifest.keys() == ARCHIVE.keys()
    for path, (size, digest) in ARCHIVE.items():
        content = (packet / path).read_bytes()
        assert (len(content), sha(content)) == (size, digest), path
        assert indexed_manifest[path]["bytes"] == size and indexed_manifest[path]["sha256"] == digest

    before_script = (packet / "attempt-1/replay-current-mythril.py").read_text()
    corrected_script = (packet / "fixed-clock/replay-current-mythril.py").read_text()
    # Verify the exact three additions/wording substitutions; no input or assertion removal is hidden in the diff.
    expected = before_script.replace(
        "Default Anvil precompiles; original creation bytecode and supplied calldata;",
        "Anvil precompiles with explicit zero block timestamp interval; original creation bytecode and supplied calldata;",
    ).replace(
        "    output['implementationAddressCode'] =",
        "    interval = rpc('anvil_setBlockTimestampInterval', [0])\n"
        "    assert 'error' not in interval, interval\n"
        "    output['blockTimestampInterval'] = 0\n"
        "    output['implementationAddressCode'] =",
    ).replace(
        "assert len(output['findings']) == 11",
        "assert all(x.get('deploymentTimestamp', 0) == 0 for x in output['findings'])\n"
        "assert len(output['findings']) == 11",
    )
    assert corrected_script == expected

    output = {
        "schemaVersion": 1, "reviewer": "contract_security", "reviewDate": "2026-11-19",
        "analyzedSourceCommit": SOURCE, "reportSha256": REPORT_SHA,
        "reviewedReplayPacketCommit": PACKET_COMMIT,
        "newAnvilOrCastExecutionPerformed": False,
        "sixRawArchiveFilesVerifiedAgainstIndependentExpectedHashes": True,
        "scriptChangesExactlyMatchTimestampCorrectionAndWording": True,
        "inputHashEncodingInCoordinatorOutput": "SHA-256 of the exact UTF-8 hex string, including its 0x prefix",
        "coordinatorReceiptSha256": sha(receipt_bytes),
        "coordinatorMarkdownSha256": sha(markdown_bytes),
        "findingsByContractSwcPc": {}, "attempts": {},
    }
    for attempt in ("attempt-1", "fixed-clock"):
        observed = parse((packet / attempt / "mythril-current-concrete-replay.json").read_bytes())
        assert observed["analyzedSource"] == SOURCE
        assert observed["reportSha256"] == REPORT_SHA
        assert observed["implementationAddressCode"] == "0x"
        present = set()
        times, errors = [], []
        for item in observed["findings"]:
            key = identity(item["contract"], item["swc"], item["pc"])
            assert key not in present
            present.add(key)
            ri, ii, issue = by_key[key]
            assert (item["reportIndex"], item["issueIndex"]) == (ri, ii)
            steps = issue["tx_sequence"]["steps"]
            creation = steps[0]
            assert item["creationInputSha256"] == sha(creation["input"].encode())
            row = output["findingsByContractSwcPc"].setdefault(key, {
                "reportIndex": ri, "issueIndex": ii,
                "creationHexTextSha256": sha(creation["input"].encode()),
                "creationDecodedBytesSha256": sha(bytes.fromhex(creation["input"].removeprefix("0x"))),
                "originalCreationOrigin": creation["origin"],
                "originalCreationValue": creation["value"],
                "observed": {},
            })
            if ri == 4:
                creation_bytes = bytes.fromhex(creation["input"].removeprefix("0x"))
                constructor_args = bytes.fromhex(creation["calldata"].removeprefix("0x"))
                assert creation_bytes.endswith(constructor_args)
                prefix = creation_bytes[:len(creation_bytes) - len(constructor_args)]
                assert len(prefix) == 3807
                assert sha(prefix) == "5a6bfffabbad4f62ed3fd56737e65f43535766f8699cc02cc61460758ded3727"
                assert int.from_bytes(constructor_args[:32], "big") == 1
                row["constructorImplementationAddress"] = "0x0000000000000000000000000000000000000001"
                assert item["creationCall"]["data"] == "0x6f778c3a"
                assert item["expectedConstructorRejection"] is True
                assert "calls" not in item
                row["observed"][attempt] = {"creationRejected": "ImplementationHasNoCode()", "laterModeledCallsExecuted": False}
                row["laterModeledCallCount"] = len(steps) - 1
            else:
                assert len(item["calls"]) == len(steps) - 1
                times.append(item["deploymentTimestamp"])
                mapped = []
                for result, step in zip(item["calls"], steps[1:]):
                    assert result["inputSha256"] == sha(step["input"].encode())
                    assert result["result"] is None and result["error"]["code"] == 3
                    assert observed["errorSelectors"][result["error"]["data"]] == result["decodedError"]
                    errors.append(result["decodedError"])
                    mapped.append({"inputHexTextSha256": result["inputSha256"],
                                   "inputDecodedBytesSha256": sha(bytes.fromhex(step["input"].removeprefix("0x"))),
                                   "originalFrom": step["origin"], "originalValue": step["value"],
                                   "modelTarget": step["address"],
                                   "concreteTarget": "new local deployment selected by its receipt; not asserted equal to model address",
                                   "observedRevert": result["decodedError"], "revertData": result["error"]["data"]})
                row["observed"][attempt] = {"deploymentTimestamp": item["deploymentTimestamp"], "calls": mapped}
        assert present == by_key.keys()
        assert times == ([1, 1, 1] if attempt == "attempt-1" else [0, 0, 0])
        assert errors == (["Expired()", "Expired()", "InvalidDestination()"] if attempt == "attempt-1"
                          else ["InvalidAmount()", "ZeroAmount()", "InvalidDestination()"])
        if attempt == "fixed-clock":
            assert observed["blockTimestampInterval"] == 0
        binaries = {}
        for name, field in (("anvil", "anvilSha256"), ("cast", "castSha256")):
            binaries[name] = {"recordedSha256": observed[field], "localBinaryBytesVerified": tools_directory is not None}
            if tools_directory is not None:
                assert sha((tools_directory / name).read_bytes()) == observed[field]
        output["attempts"][attempt] = {"findingKeysVerified": 11, "factoryRejections": 8,
            "deploymentTimestamps": times, "expiryErrors": errors, "binaries": binaries,
            "exitCodeRecordedByCoordinator": receipt["first_attempt" if attempt == "attempt-1" else "final_attempt"]["exit_code"]}
    assert output["attempts"]["attempt-1"]["exitCodeRecordedByCoordinator"] == 1
    assert output["attempts"]["fixed-clock"]["exitCodeRecordedByCoordinator"] == 0
    output["scopeLimits"] = [
        "Only the supplied creation/call inputs and their rejection in the documented local state are established, not all symbolic paths.",
        "Expiry calls target locally deployed instances; addresses are not asserted equal to the symbolic target addresses.",
        "The harness overrides the gas cap to 20,000,000 and uses Anvil's default chain/fork configuration; original symbolic nonce, balances and storage are not restored.",
        "Creation origin is funded/impersonated. Other call origins are funded for eth_call; no live actor is contacted.",
        "The eight Factory constructors reject before their later modeled deploy steps, which are not executed.",
        "Silent zero-byte Anvil logs are preserved, not presented as missing data or verbose trace logs.",
        "The reviewer verifies records and hashes without another EVM run; coordinator-observed process exits are retained as such.",
        "Strict eleven-finding failure and all owner decisions remain unchanged; this is not a gate exception or external audit.",
    ]
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True, type=Path)
    parser.add_argument("--tools-directory", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    record = inspect(args.repository.resolve(), args.tools_directory)
    encoded = json.dumps(record, indent=2) + "\n"
    if args.output is not None:
        args.output.write_text(encoded)
    print("PASS: six archived files, eleven exact finding/input identities, both timestamp outcomes and unchanged assertions verified; no EVM run.")
