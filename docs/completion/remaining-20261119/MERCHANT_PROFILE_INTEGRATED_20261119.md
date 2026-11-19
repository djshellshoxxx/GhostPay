# Integrated merchant-profile clock regression check

At exact integrated source `9bec156622c4c606b97e7d43b1b6f12deff71063`, the coordinator ran the entire existing `merchantProfile.test.ts` file: **63 passed, zero failed, zero skipped**, exit `0`, in **2.113 seconds**. The [verbatim receipts](merchant-profile-integrated-evidence/manifest.json) record the command, working directory, source and artifact digests.

The tests use a genuinely signed profile that is expired at the ordinary control time. The unchanged regression file also checks object/JSON inputs, non-finite and wrong-type clocks, coercion exceptions, all finite numeric boundary controls, and the existing size/format/signature error precedence. The implementation adds `Number.isFinite` at the existing expiry predicate and clarifies its API comment; it changes no production caller, signing authority or protocol.

This is a conditional supplied-clock defect. The result does not establish that a remote profile can control an application's clock or demonstrate an end-to-end exploit. The separate author full-package run's timeout in an unchanged passphrase test is retained in the author packet; a passing focused file does not establish full-package coverage or release qualification.
