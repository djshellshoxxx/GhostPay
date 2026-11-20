# Concurrent F03 specification reconciliation

At this implementation's discovery, no F03 feature branch existed. The coordinator created
`future/f03-private-payment-links` from main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` and
published its file-interchange scope. A concurrent specification task subsequently published
`future/f03-private-payment-links-spec` at `ae0bad11` and explicitly preserved this implementation.
Neither branch overwrites the other.

[Concurrent catalog specification](https://github.com/djshellshoxxx/GhostPay/blob/ae0bad11/docs/future/modules/F03-private-payment-links/SPEC.md)

Describe this delivery as the selected **signed-invoice file interchange feature**, building on
existing links and QR, not as completion of every future catalog proposal.

| Catalog area | This implementation |
| --- | --- |
| Exact URL/file/QR digest, signature and terms parity (A01) | New codec and independent real-image interoperability tests |
| Malformed/duplicate/oversized files (A02) | Closed wrapper and bounded strict UTF-8 intake |
| Passphrase, repeated imports and supersession (A03/A04/A11) | Existing verification/open pipeline plus new lifecycle integration and tests |
| Chain/pin/approval, expiry, uncertain submission (A05/A08/A10) | Existing Pay controls preserved; no new transaction policy |
| Camera lifetime (A07) | Existing camera retained; file selection supersedes its active import |
| Wallet URI conversion (A06) | Separate future capability work, not implemented by file interchange |
| History cleanup failure (A09) | Existing URL path unchanged; file intake does not write a URL fragment |
| Reusable-policy trust category and abstract provider contracts | Separate future design, not claimed by this delivery |

The new catalog's file ceiling is proposed. This feature uses a precise **24 KiB total file cap**
and existing **16 KiB decoded-envelope cap**, accounting for base64 expansion and wrapper bytes.
Every supported envelope fits without increasing its decoded limit. No 1 MiB intake is added.

Deployment and whole-catalog completion remain separate from this branch's implementation and
audit evidence. No new cryptography, hosted services, implicit wallet/network behavior or loss
of transaction approval is introduced.
