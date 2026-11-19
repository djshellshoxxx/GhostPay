# Hosted checkpoint failures — 2026-11-19

These records identify actual failed jobs and retain their connector-decoded
logs. They do not replace the time-stamped earlier workflow snapshot or imply
that its queued jobs had already completed.

## Integration checkpoint #246

At head `28edbcf55093a6d6056232fd59ef37a2ae832b9a`,
[web job 135390371611](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472897740/job/135390371611)
failed with **2,972 passed, one failed and one skipped test**, plus one unhandled
error. The failure is the recovery-owned `paymentKeyExport.test.ts` case that
wipes keys while file sealing is in progress. Its fixture reaches the assertion
before the asynchronous sealing boundary and then reports a seller-key-change
rejection. The separately assigned recovery stream already contains the
explicit sealing wait and early rejection handling. The observed job was
[referred to #240](https://github.com/djshellshoxxx/GhostPay/pull/240#issuecomment-7003469356).
No duplicate recovery implementation or gate waiver was made here.

## Dependency candidate #210

At head `3c95b2a00bdcfb45dd36242ff40c133dd19d1811`,
[hosting job 135417832399](https://github.com/djshellshoxxx/GhostPay/actions/runs/44482491845/job/135417832399)
failed during validation-tool installation: the Ubuntu security mirror returned
HTTP 404 for its nginx and nginx-common packages. The command exited 100 before
the later kit checks, which were skipped. Its separate web hosting qualification
job passed. The coordinator requested a retry of only the failed job; this
record does not claim that the retry passed. The merge remains dependent on
the current candidate's full required results.

Raw logs, exact job/source identities and SHA-256 hashes are in
[hosted-checkpoint-evidence](hosted-checkpoint-evidence/manifest.json).
