# Pool seed backup admission and compatibility

Requirement: SEC-16, audit24 L8-07 and PS-10. Implementation source:
`02711be2dbfbdea4b644feaad56f6f5bc8a52fe4`; base `824091cf`.
This repair is confined to the pool SDK. The separately owned Spec18 web vault is unchanged.

## Confirmed defect and repair

The original importer admitted attacker-controlled KDF costs and malformed envelope fields
before expensive work; new exports used the old weak passphrase policy and shared note-store
AAD. New v2 envelopes apply the existing vault passphrase policy, normalize new password bytes,
and authenticate their seed-specific version/cost/salt/IV header. Import validates exact shape,
canonical bounded fields and integer KDF cost before deriving a key. Owned password, derived
key, seed-copy and decrypted-plaintext buffers are wiped along success and error paths.

Version1 remains readable with its exact old AAD and unnormalized password, including old
short passwords. Both versions support16–512byte seeds; generated seeds remain32bytes.
Legacy costs10–18 and new costs14–18 are accepted; default exports use17. Envelopes and
passwords have a1024code-unit cap. Backups outside those bounds are deliberately unsupported;
this is not a claim that every historically constructible input remains recoverable.
The only dependency addition is the existing internal ux-vault workspace. External versions
and pool note/payment protocols are unchanged.

## Verification and independent review

The final tests on the original implementation produce22 failures and13 passes. This baseline
supersedes the first test draft, whose31/33byte rejection expectations were incorrect.
Independent review by contract_security caught that compatibility mistake before integration.
Ten real-crypto compatibility regressions failed on the first implementation. The corrected
implementation then passed all82tests in7files with no skips:97.65%statements,
95.18%branches,99.15%functions and99.79%lines, above the unchanged package thresholds.
Node crypto independently encrypts legacy records and decrypts new envelopes, so compatibility
is not established only by a same-implementation round trip. Malicious allocation tests mock
the KDF to prove admission order without allocating attacker-selected memory.

Final package typecheck and scoped ESLint both exited0. Node22.23.4 and Vitest5.1.0
were used. Independent re-review of02711be2 passed. Early failed and intermediate checks are
retained as evidence, not described as final qualification. Complete logs, hashes, source IDs
and bounded compatibility limits are in[POOL_SEED_SECURITY_20261119.json](POOL_SEED_SECURITY_20261119.json).
Combined-candidate hosted gates and any main merge are recorded by the coordinator separately.
