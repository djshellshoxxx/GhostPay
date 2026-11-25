# Mythril evidence summary contract

`mythril-evidence.mjs` is an offline report formatter recovered unchanged, with its five original Node regression cases, from #468 at `cb63ec21cbac15b0a665b61ada37a9f0662ff79a`. It does not run Mythril, analyze contracts, execute transactions, clear findings, approve a release or change any CI gate.

## Input and output

The input is the raw, line-oriented `report.log` from the existing five-contract runner. The current `packages/contracts/scripts/run-mythril.sh` still emits its targets in this order:

1. `GhostPayRouter`
2. `GhostPaySweepRelayer`
3. `GhostPayPolicyRouter`
4. `PolicyAccount`
5. `PolicyAccountFactory`

The helper accepts exactly five JSON-object report lines, each with `success === true`, `error === null`, and an `issues` array. It rejects invalid JSON report lines, wrong report counts, unknown severities and malformed source locations. Non-JSON warning/diagnostic lines are ignored. Accepted input is limited to 8 MiB; the CLI checks the file size before reading and the helper checks the decoded input's UTF-8 byte length.

Only bounded severity, SWC ID, source filename, line and ordinal fields are copied for each finding. Descriptions, transaction traces, calldata and arbitrary issue properties are not copied. Source filenames remain source metadata supplied by the report; this formatter does not authenticate them.

| Exit | Exact meaning |
|---|---|
| `0` | Five accepted report shapes, zero reported issues. The legacy JSON verdict is `clean`; it means only this parser result. |
| `1` | Five accepted report shapes with one or more reported issues. Findings remain open. |
| `2` | Invalid, incomplete or unsupported evidence, or a CLI/file error. |

## Identity and execution are separate evidence

Target names are assigned **by position**. The helper cannot prove that an arbitrary report belongs to the named contract, that all five distinct contracts were analyzed, or that a report was not duplicated in place of another while retaining a count of five. Its duplicate-report regression rejects extra report cardinality; it does not authenticate five target identities.

`complete: true` describes the expected report count and parsed shapes. It does not prove complete symbolic exploration. The helper does not consume or validate the analyzer's actual exit status, source/bytecode identity, checkout commit, runner version, truncation metadata or artifact provenance. Ignored warning/diagnostic text is not an execution-success determination. In particular, its exit `0` cannot replace a failing analyzer/runner exit.

For real triage, retain the original report, source-pinned runner and artifact metadata separately and verify their association. A finding summary does not establish exploitability; a zero-issue summary does not establish security clearance. Do not use this helper as an alternative implementation of the required contract-analysis gate.

The current runner and `scripts/tests/mythril-runner.test.mjs` remain unchanged. The runner still fails on reported issues, malformed/multiple reports and abnormal analyzer exits, including an abnormal exit accompanied by clean-looking JSON. This bounded recovery adds no workflow invocation of the formatter.

```sh
node --test scripts/tests/mythril-evidence.test.mjs
node scripts/audit/mythril-evidence.mjs /absolute/path/to/report.log --json
```

The first command exercises ordinary synthetic fixtures only. The second reads an existing file. Neither command by itself proves a successful analyzer run. Qualification of this recovery records no fresh native/analyzer success.
