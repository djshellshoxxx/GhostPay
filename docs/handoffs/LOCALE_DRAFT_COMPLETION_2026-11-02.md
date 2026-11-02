# Locale draft completion

Arabic, Spanish and Japanese each gained the 511 messages missing from the
English catalog. All 52 existing messages in each locale, the English source,
language registry, review metadata and security fallback remain unchanged.
These are machine drafts with a second AI review, not native-language approval.

The unchanged checker now reports four catalogs, zero errors and ten warnings:

```sh
node scripts/i18n/check.mjs
```

CI runs this same gate. Missing keys, invalid templates, ICU/placeholder/markup
mismatches and invalid metadata fail. The optional `--strict` mode also fails
warnings; no strict-mode pass is claimed. No warning or checker rule is suppressed.

The ten Spanish warnings comprise five technical/unit expressions and five
text-length checks. Review `sweep.tokenFallback`, `btc.review.feeDetail`,
`policy.deployment.router`, `policy.create.tokenLabel` and `policy.pay.router`
as technical vocabulary. Check layout for `sweep.relayerFee`,
`sellerKeys.newVaultPass`, `sellerKeys.repeatVaultPass`, `btc.review.fee` and
`policy.pay.fee`. Natural wording must not be shortened merely to satisfy a ratio.

Before native approval, qualified reviewers must check consent, fees and caps,
base units, key-loss and backup warnings, unknown transactions, receipt claims,
RTL/CJK layout and screen-reader announcements in the supported built flow.
Preserve placeholders, canonical amount displays and literal identifiers.
Security-critical messages continue to fall back to English until the existing
review mechanism records the required approval. Structural checks do not replace
native, device or accessibility acceptance. This change grants no release authority.
