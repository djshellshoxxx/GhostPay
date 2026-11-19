# Preserved #246 Mythril evidence

Reviewed source: `28edbcf55093a6d6056232fd59ef37a2ae832b9a`.
Hosted run/job: `44472897672` / `135386401249`; artifact `14508101082`.

`raw-manifest.json` binds the five untouched downloaded files. The ZIP's report
and metadata members exactly match their standalone copies. `report.log`
retains the complete 283,170-byte report; the hosted result remains exit 1 with
eleven findings and no approved exceptions.

`comparison-and-dispositions.json` compares exact current observations,
sources and inputs against the old packet at commit
`5fadb4ff709701bff2a5f08fac548d24c2de42ad`. This evidence commit must be retained
to reproduce the comparison. Run:

```sh
python3 docs/handoffs/agents/evidence/mythril-28edbcf-20261119/compare-reports.py --check
```

The verification is read-only and uses the Python standard library plus Git.
No analyzer, RPC, concrete replay or tests run. The JSON is observational
evidence, not a release allowlist or owner approval. See
[the scoped review](../../MYTHRIL_28EDBCF_REVIEW_20261119.md) for interpretation,
the R8/R11 changed-trace corrections and retained limitations.
