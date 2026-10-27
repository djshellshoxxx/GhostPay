# Local Viem metadata compatibility artifact

`viem-2.22.14-ghostpay-deps2.tgz` is a **GhostPay-local metadata build**, not an upstream Viem release or registry-signed artifact. SDK1.5.0 remains the exact registry dependency. Its Viem2.22.14 code, types, exports, notices and licenses are unchanged.

Only the shipped Viem package manifest changes:

- version: `2.22.14` → `2.22.14+ghostpay.deps2`, explicitly identifying this local build;
- dependencies.ws: `8.18.0` → `8.21.0`, preserving the existing security floor;
- dependencies.abitype: `1.0.8` → `1.2.3`, an already locked project version supporting the existing Zod4.6.7 peer.

The initial, rejected `deps1` experiment anchored Zod3.25.76. Although that fixed the raw SBOM graph, it introduced the high advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). No Zod3 or rejected deps1 artifact is shipped here. The production vulnerability gate remains unchanged.

The complete provenance JSON records the original official tarball URL/SRI/SHA256, new local archive integrity, exact manifest changes, all7,577 unchanged non-manifest member hashes, preserved member types/modes, normalized tar/gzip settings and the portable repack script hash. The adjacent MIT license is copied unchanged from upstream. All original licenses also remain in the archive.

To reproduce locally, obtain **only after authorized acquisition** the official `https://registry.npmjs.org/viem/-/viem-2.22.14.tgz`, verify its recorded SRI, then run:

```text
python3 vendor/repack-viem.py /path/to/verified/viem-2.22.14.tgz /new/empty/output-directory
```

The script performs no downloads, installs, builds or runtime execution. It changes only the three manifest fields above, verifies every member, and refuses to overwrite an archive. Compare the resulting tarball SHA256/SRI with the checked-in provenance. Do not use the original registry integrity or signature to describe the modified archive.

The final root override path is repository-relative. Bootstrapping the existing npm11.9 workspace lock required temporary exact-version root anchors and a temporary absolute local tarball path because existing virtual workspace nodes lost override context. Those anchors and absolute root paths were removed before the final npm-generated lock. Exactly three lock entries change: local legacy Viem; removal of its old nested abitype1.0.8; Solana's separate ws8.21.3. Every other package entry remains identical to the baseline. No installed package metadata or lock entry was hand-patched.

Packaging identity and resolver validity are separate from integration-test evidence. Current acceptance results and preserved failed experiments belong to the private offline-resolution handoff. A successful production audit/SBOM does not imply a completed full-source or financial audit.
