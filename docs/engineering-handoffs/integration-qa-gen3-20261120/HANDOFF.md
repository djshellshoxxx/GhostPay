# Integration QA continuation

The initial frozen source is `9e062b7150e74d1b20e34b0f120add660d9ef02e`. Do not repeat the completed source-preservation and QR/Pages checks unless their input blobs change.

1. Obtain the coordinator's final wallet source after the independently reviewed receipt-status and any separately reproduced transaction-shape repairs. Keep the initial source manifest and results intact; create a distinct final-source receipt.
2. Verify that the new candidate preserves the 15 initially reviewed input paths, allowing only the explicitly reviewed wallet/test follow-ups. Recheck the eight baseline control scopes and dependency/configuration identities.
3. After the coordinator grants the serialized execution window, execute the changed web QR classifier and appropriate frame regression tests. Then run the original full web TypeScript check with a bounded heap and full configured web coverage plus the existing no-coverage pass when resources permit. Do not change project thresholds, timeouts, skips or pool configuration to produce a pass.
4. Preserve process termination/resource failures separately from executed assertions. Previous generation resource failures do not automatically establish a defect in the current source. A focused test pass does not replace the full required gate.
5. Check exact-source hosted CI/security/browser results before promotion. The original #295 full-browser failure is the already-preserved network-observation fixture repair; do not duplicate that fix or transfer an older hosted pass to this candidate.
6. The quick-hide feature has its own source and privacy dependency; it is independently reviewed elsewhere. Do not merge its older dependency tree over newer active privacy work.

Root owns remote publication and shared integration. This worker owns only its additive claim and this evidence directory. No deployment or release authorization is implied by this handoff.
