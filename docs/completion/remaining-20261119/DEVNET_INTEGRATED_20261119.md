# Integrated devnet manifest regression check

The coordinator ran the existing manifest-helper test file at source `2a0545ceb6b7971801ac1c225e9e857d4d66474b`. The result was **14 passed, zero failed, zero skipped**, exit `0`, in **3.995 seconds**. The command used the recorded Node 22 executable and loopback fake RPC fixtures. It did not execute a browser or deploy to a public chain.

The three repair/test files still match that source exactly. Verbatim command and output receipts are in [devnet-integrated-evidence/](devnet-integrated-evidence/); its manifest records their byte sizes and SHA-256 digests. The author separately retained the original failing tests, the old native fixture rejection, two failed replay wrappers, and the successful bounded native replay in [workflows-devnet-fixture.md](workflows-devnet-fixture.md).

The independent [devnet review](../../handoffs/agents/DEVNET_FIXTURE_CROSS_REVIEW_20261119.md) checks the exact source and all 57 author artifacts, including the unchanged browser execution branches. This combined check adds no claim of browser acceptance or complete release qualification.
