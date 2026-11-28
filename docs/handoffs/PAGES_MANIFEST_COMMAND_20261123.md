# B03 Pages manifest validation command

Base `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. The Pages deployment README documented
`npm run validate:deployments -w @ghostpay/web` but the workspace did not expose it.
This branch brings forward the command and regression from
`9669766c21f57c28f201586a116517af341706e0`. [PR #212](https://github.com/djshellshoxxx/GhostPay/pull/212)
retains the equivalent implementation in its broader release-gate work.

At local source `df55936c429062fbd91ddf4228681f20910023f8`, the documented command
returned `deployments/: ok` for the tracked README-only directory, and focused
Vitest passed 3/3 with temporary synthetic fixtures. Cases covered include a
correctly signed manifest, unsigned and wrongly signed manifests, missing and
malformed keys, and a noncanonical filename. Independent source review confirmed
that the validator and fixtures are byte-identical to the donor, and verified the
current import and CI setup. Dependencies used for these checks were extracted
from the npm lockfile with integrity verification after npm ci was killed.

The command and synthetic CLI qualification are separate from B03's real signed
manifest and runtime RPC evidence. Those depend on an authorized B02 deployment
and an owner-approved signing key. Hosted CI for this isolated extraction and
integration lock verification remain required before merge.
