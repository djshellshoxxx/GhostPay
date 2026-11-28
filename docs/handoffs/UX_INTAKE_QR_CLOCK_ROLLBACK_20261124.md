# QR intake assembly clock rollback — 2026-11-24 UTC

- Base main: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`; isolated claim `03b5bb9175472af135b19d48101d816881f9a039`.
- Test-first commit: `08e82fc065310d91445c13b839236cd50cd38c98`; test blob `51e9a32a04dddb257478dd427ebc26eb04a2192a`.
- One-condition production fix: `53038a28903f402542ccec401adb3f0e02c6be7e`; source blob before `38c618d48eaf21886d1c480af958ba63f274c6d0`, after `400293fab2bd0d400a1bc5f620660a005af10d1f`.

## Reproduction
Incomplete assembly first frame at 1000 ms, next at 999 ms. Same-session second frame incorrectly retains old data and reports two parts; different-session frame returns chunk-session-mismatch despite the clock discontinuity. Negative elapsed time defeats the documented bounded lifetime. Discard the old assembly when the injected clock precedes its start; keep existing strict greater-than TTL boundary and normal conflict behavior.

## Executable evidence and limits
Verified original QR, payload, result and text source content against Git blob SHA-1 (payload `346b89759b44e2861c3e0279c6135ffbbdc062ba`, result `74a6a294caef828e72f5b48e2a1a86491b23f677`, text `bd5877060168acc83d11f1cb9b6fa7b2ebf40e07`). Executed actual extracted addScan/interpretScan/parseChunk/progress and sanitation/result helpers with type erasure in V8. Complete payload classifier is a throwing stub, never invoked by these incomplete-frame cases. Seven focused probes: 5/7 before, 7/7 with proposed condition. Read back committed test and production blobs at each exact commit and executed the four test bodies using a small assertion shim (not Vitest): 2/4 before, 4/4 after. Tests cover same/different session rollback, exact TTL boundary, normal expiry, progress, duplicate and conflict. No browser, complete reassembly, real payment or full workspace tests claimed. Local Node 22.16.0 and TypeScript 5.8.3 present; git ls-remote failed DNS resolution.

## Coordination
238 open PR changed-file inventories checked in batches; no matching QR intake production or new regression path, and no matching registry claim found. Other PRs change adjacent payload/address/text paths; those are not touched. Generation 20 integration lease released at `4fe0656517a03cb7a39d4e248187c76ffaa3238a`; not acquired. No independent verifier available. Keep draft until exact-head hosted required checks, applicable native browser qualification, independent review, refreshed ownership/dependencies and legitimate integration lease. No merge, deployment, release, dependency, contract or funds change. PR #390 already merged; no repair to its branch needed. PR #623 remains draft pending independent review.
