# Near-finished integration reconciliation — 2026-11-24 UTC

The original qualified #614 (9aff7941bdeec30c4ebeab10795da4df9903d08a, tree 9704b3b915154e993abcd5fedc8eac10389ee7f4) is preserved as an actual parent. Current main c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063 (tree 34c33cc2fc639c0f084269f7744ab31df111451a) is the other parent. #620 merged at 03695a7bbb2ad178a729da612bc578ed9a42c4d7 and #500 subsequently merged on main. Main push CI, Hosting kit and dynamic Push on main are successful on the pinned main (45415639617, 45415639485, 45415637708).

Full recursive, untruncated Git tree comparisons against the original base 706188000c38b3dde5a3a362370a530870aa7587 established 44 changed paths including 28 non-Markdown/non-doc paths. 22 of these 28 are exactly present (blob and mode); the remaining six are retained in their newer form:
- apps/web/e2e/helpers.ts retains the original behavior plus token selection.
- apps/web/src/lib/format.ts and format.test.ts retain countdown behavior plus runtime type/precision and timestamp coercion guards.
- apps/web/public/licenses/jsqr-1.4.0.txt, packages/qr-exchange/src/vendor/jsqr-1.4.0.mjs and vendor.provenance.test.ts retain alignment correction plus bounded neighboring-dimension retries and provenance checks. The three accompanying QR Markdown documents reflect both corrections and current hashes.

Do not replace these current-main files with earlier donor files. Original handoff is preserved byte-for-byte at its original path. Both ownership registries are preserved as ordered line subsequences. No application, test, workflow, dependencies or release settings change. Original hosted #614 checks: 36 success, 3 skipped, on its original head; main's current hosted checks are distinct. No fresh test pass or independent approval is claimed for this new composition. Keep draft pending exact-head CI and independent review. Normal merge only under the cooperative lease when eligible. No deployment.

#616/#617 and all other owners remain separate; no competing integration or branch deletion. Their evidence reconciliation is outstanding.
