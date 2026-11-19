# Independent OP fee source-review evidence

`manifest.json` binds exact runtime/test/doc source objects, pinned upstream
oracle/execution references, and the two untouched independent receipt-status
probe files. The probe compares `a6bcaf38` before the OP implementation against
`0aef3a25`, using the same viem 2.57.19 installation and fake transport.

The probe was executed once with exit 0, Node 24.22.3, a 256-MiB heap cap and the
shared qualification mutex. Its harness transpiles exact Git source into its
own scratch directory without typechecking; all original paths are retained.
It makes no real RPC calls and signs no transaction. This is evidence of the
inherited status acceptance, not a package test or production-chain receipt.

The author-run `op-receipt-status-red.{json,log}` and
`op-fees-final-targeted.{json,log}` preserve the 16-failure/8-control baseline
and 97/97 focused pass at the exact receipt-status repair source. The later
TypeScript call-argument expression change is separately source-reviewed;
those 97 cases are not relabeled as a run at the later commit.

See [the review](../../OP_FEE_SOURCE_REVIEW_20261119.md) for accepted OP fee
invariants, the corrected receipt-status defect and qualification limits.
