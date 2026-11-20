# Published-head demonstration artifact and reproducibility

Source: PR #292, `814950a1cf99e68765b85f241e6f4a0fc55ea9c6`.

Two fresh Pages assemblies of this exact checkout passed the original web typecheck, lean bundle/site verification and the new independent artifact promotion gate. Both contain 16 served files and zero enabled payment networks. Their complete SHA256SUMS inventories are identical; SHA-256 of that inventory is `bbb9cb03842c65ac84a493b86db9566752dad9e7b432104b1f84ad138bef4374`.

`ghostpay-demo-814950a1.tar.gz` preserves the first assembly's complete `site/` and `evidence/` directories, including the automatically generated verification receipt. The archive has 21 regular members. A separate round-trip check validated all 16 served hashes, the exact source commit and disabled payments. Its SHA-256 is recorded in `ARCHIVE_SHA256SUMS`.

After extracting the archive, verify it with the reviewed verifier from the same source:

```sh
node scripts/pages/verify-pages-artifact.mjs \
  /absolute/path/ghostpay-demo-814950a1/site \
  /absolute/path/ghostpay-demo-814950a1/evidence/SHA256SUMS \
  --expect-commit 814950a1cf99e68765b85f241e6f4a0fc55ea9c6
```

These are local build and same-environment reproduction results. The recorded `release: true` flag means the builder's clean release mode, not an approved public release. The declared account Pages origin remains shared, and the artifact retains its disclosure. No deployment, owner policy acceptance, external security review, independent-machine reproduction or actual testnet transaction is established here.

This evidence is kept off the frozen PR #292 branch so that recording it does not cancel hosted qualification. Review the latest PR/check states and canonical integration lease before promotion. The outstanding release verdict remains **BLOCKED — WITH PRECISE REMAINING REQUIREMENTS**.
