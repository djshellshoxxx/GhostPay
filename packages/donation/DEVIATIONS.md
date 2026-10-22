# Deviations and open points (@ghostpay/donation)

1. **Not integrated.** No app imports this package; `donationRecipient` is not in any schema yet (later task).
2. **Rate assumption.** "0.0965" is read as 0.0965% (965 ppm). Owner to confirm; change only `DEFAULT_DONATION_PPM`.
3. **Owner decisions.** 5% cap and 0.01-token dust floor are proposals.
4. **Settings shape.** `DonationSettings` is `{ enabled, ppm }`; the brief's `recipient?` is omitted because the recipient must come only from config (`resolveDonation` returns it).
5. **Signatures.** `buildSendCallsBatch(chainId, mainCalls, donationCall?)` takes `chainId` first (needed for the hex chain id); builders return result objects (`{ ok, ... }`) instead of null; `buildDonationLines` takes a plan object including settings and config.
6. **Atomicity.** `atomicRequired: false` does not forbid a wallet from running the batch atomically; the sequential path is the guaranteed one.
7. **Idempotency key** covers the four brief fields (no chain id); persistence of attempts is the caller's job.
8. EIP-5792 details are from memory and were not re-fetched; no wallet testing. BTC variant is documentation only.
9. Percent input accepts at most 4 decimals (including trailing zeros beyond that are rejected).
