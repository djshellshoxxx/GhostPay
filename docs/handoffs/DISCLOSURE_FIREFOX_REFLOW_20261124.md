# Wallet disclosure Firefox reflow continuation — 2026-11-24 UTC

## Source-pinned recovery
- Parent #630: c484f833560aef8e8c798a71228d92e10fe5a877. Main observed: c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063.
- Ownership claim: cf4e452fd1effee3b83481d6f34b044ba9feeb7d. Test correction: 12921de8cf3127c47fd515d0e776831af40de2cc.
- Old accessibility test blob 72f569249469b17bc998c2dd97e905e85dd178d7; replacement 976f0261aac344a9f746c1683f7a75aa90af15d4. Read back and verified exact byte identity to the published #613 donor at 17fa04b0ad4af4d88739bcffd9042d76d27c8237. The only test change is the existing comment and rendered-control checkVisibility predicate; no assertion, viewport, text enlargement, tolerance, axe rule, browser configuration, runtime or dependency changes.

## Actual hosted evidence on parent
- CI 45482995591, Pages 45482995581, beta 45482995677, hosting 45482995656, Tor-static 45482995549 completed successfully.
- Native qualification 45482995533 failed. Full job 138760816393 shows Home-100percent-320px with stale INPUT geometry left 33/right 959; lean job 138760816354 and full job both report SWGL framebuffer mapping failures and crashed pages. Lean also has a separate toHaveAttribute assertion failure. Each reports eight failed tests. No renderer failure is cleared by the reflow fixture recovery.
- #613's published handoff records prior focused Firefox full/lean reflow success and visible-oversized negative control, but not full native qualification. These are donor evidence, not a fresh test execution on this composition.
- Fresh hosted CI and independent review are mandatory. No local repository test or native worker execution in this cycle. Do not use prerelease Playwright, weaken tests, suppress crashes or substitute browsers to qualify this lane. Coordinate any stable dependency update separately.

## Other outstanding safety work
- #612 e580fcac85e1e7fc2a42a4c7ea7d5a581418aab8: CI 45366732095 web job 138374082256: 4427 passed, nine failed, one skipped. Three scanner lock regressions include automatic-rescan disarm, paused checkpoint notices, and retained sole-copy recovery. The source still subscribes to app lock; do not assume a fixture problem or remove assertions. Other failures affect late hashes, sweep key lifetime and registry history. Preserve existing ownership and investigate actual integration behavior.
- #604 2f2c282e4e88e32fb54648864bb9ed51c8307880: CI 45363318852 job 138361946862 fails the reviewed workspace dependency closure because @ghostpay/ux-core is newly reachable. Do not add it to REVIEWED or PENDING_OWNER_REVIEW without authorization or remove the guard. Seek a dependency-preserving implementation or explicit owner review.
- #629 4b1ed14ccfac12b5574b8817873ce299ecb86ddf remains draft; preserve hosted qualification and independent review gate.
- Integration lock generation 20 was released when read. This cycle did not acquire or modify the lock. No main or parent integration, releases, deployment or real funds. Parent workflows were inspected: Pages publication requires explicit main workflow dispatch and deploy input; release requires version tag. No paid workflow was dispatched.

Next: qualify this exact isolated child, retain all failed evidence and native renderer gate, then coordinate folding the reviewed donor into the existing parent stack. Do not recreate the fixture or claim it fixes browser crashes.
