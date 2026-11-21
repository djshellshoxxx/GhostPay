# Invoice metadata minimization — successor milestone 2

## Source and independent review

Worker `/root/invoice_gen2` continued the released branch `privacy/v11-invoice-minimization-20261120` from **`186363a53ea7c5943fc2c6dc7c1406d5a874407e`**. The preimplementation specification remains [v11-02-invoice-minimization.md](../v11-02-invoice-minimization.md). Ownership was committed at `c63de4b3`, merchant regressions and the narrow specification addition at `87d878fa`, runtime at **`e498ec59`**, and a test-fixture correction at **`4f288fcdc3acad66db16ddf70743ff05a903c973`**. The final tested source tree is **`a33173e9a40c83f853849a3ea0463632cc6ec82c`**. Later changes contain only evidence and handoff documentation.

The successor independently inspected M1's helper, builder, UI, tests and recorded evidence. M1's 51-case and 74-case runs share four UI cases; they are historical checks on M1 and are not added to this generation's count. The remaining browser issuance gap was MerchantTemplateIssuer through buildMerchantTemplateInvoice.

## Implemented and reviewed behavior

The merchant invoice request now accepts optional `metadataMode`, defaulting to standard. It captures the choice before any custody await and passes it to the existing invoice builder. The verified signed profile snapshot, signed amount permission, asset allowlist, signer identity, backup custody checks, expiry recheck, explicit fixed token amount and fee policy retain their existing behavior. No signed profile or already signed invoice is modified.

MerchantTemplateIssuer exposes an accessible checkbox with the existing privacy-critical explanation and limitation text. Selecting minimal mode signs a fresh invoice with neutral `Item` descriptions through the shared pre-sign transformer. Changing either direction immediately removes the old link and Copy control and invalidates a pending completion. The explicit token amount is retained for a fresh request. A replacement seller session resets the choice and output. No new preference persistence or network request was added.

The production browser census found two invoice-building consumers: CreateInvoice and merchantTemplate. CreateInvoice's link, Copy and QR presentations derive from the same generated signed result; the merchant issuer's link and Copy presentation do likewise. No additional browser signing entry point was found. CLI invoice creation/signing, SDK builders and merchant-billing's unsigned invoices exist outside this specification's static browser-only scope. Signed-link encoders must preserve their signed inputs. This is not repository-wide metadata-option coverage.

The implementation reuses the existing invoice metadata helper, schema validation, cryptography, custody rules, Field/CopyButton components and localization keys. No external code was copied, dependency changed, or new localization claim made. The predecessor's English fallback status for draft translations remains. No CreateInvoice, retention insertion point, contract, fee, shared integration branch, deployment, release or remote repository was changed by this generation.

## Executed verification

The coordinator supplied the locked dependencies and source-aligned library outputs. Original Vitest configuration, one worker and a 1024 MiB heap were used. Commands, source/configuration blobs and lossless compressed log hashes are in [evidence.json](invoice-gen2/evidence.json).

| Check | Observed result | Evidence |
| --- | --- | --- |
| New merchant regression baseline at `87d878fa` | 13 failed, 2 passed in two files, exit 1. Twelve failures expose missing metadata behavior; one came from an invalid test fixture | [red.log.gz](invoice-gen2/red.log.gz) |
| Initial six-file acceptance at `e498ec59` | 46 passed, 1 failed, exit 1. The sole failure was the fixture | [initial-acceptance.log.gz](invoice-gen2/initial-acceptance.log.gz) |
| Final merchant, metadata-helper and real signing/encryption selection at `4f288fcd` | **47 passed in six files, zero skips**, 28.50 seconds, exit 0 | [focused-final.log.gz](invoice-gen2/focused-final.log.gz) |
| Original full web TypeScript at `4f288fcd` | **Killed, exit 137**, before any TypeScript diagnostic | [typecheck.log.gz](invoice-gen2/typecheck.log.gz) |
| Committed secret scan | Passed, exit 0 | [secret-scan.log.gz](invoice-gen2/secret-scan.log.gz) |
| Whitespace across the entire feature diff from `bbcf71b7` | Passed, exit 0 | Command recorded in evidence JSON |

The faulty short-expiry fixture initially passed an old signature into a new profile signing body. The unchanged verified-profile guard correctly refused it. The correction constructs the unsigned body with the desired expiry before signing; production guards were not relaxed. Both failure logs are retained, and the faulty baseline case is not claimed as a demonstrated product gap.

The final selection includes the original merchant custody/authority/amount tests and new real signed-link round trips, exact financial-field comparisons, large explicit amount and short-expiry preservation, invalid-mode rejection, request snapshot behavior, keyboard choice, prior/pending link revocation, session reset and no new storage/egress. It also exercises the existing helper and real encrypted/passphrase builder path. Earlier unchanged CreateInvoice suites were reviewed rather than blindly repeated.

Full typing is **unqualified** after exit 137. Scoped typed ESLint was **not run**: the coordinator deferred heavier checks until the concurrent bounded test workers finish and released this worker's window. No TypeScript-source diagnostic was observed, so this is not reported as a source error or a passing gate. Coverage-disabled focused tests do not qualify whole-web coverage thresholds. Browser, Playwright, hosted CI, full release acceptance and combined retention integration remain open.

## Fresh successor handoff

Begin from the exact final source above and review the merchant addition independently. Root owns the next combined integration and verification window. Run the original full web TypeScript command and typed ESLint for the eleven feature TS/TSX files listed in evidence JSON when enough resources are available; retain the exit-137 attempt and distinguish any baseline diagnostics from new ones. Do not narrow compiler configuration, loosen lint rules or coverage thresholds, alter gates, or treat a focused pass as full acceptance.

After root reconciles its retention hook into CreateInvoice, verify both invoice issuers in a real browser under supported and full profiles: keyboard choice and help, valid parsed minimal payload, old link/Copy/QR disappearance, delayed completion after a toggle, seller-session replacement and unchanged amount/expiry/custody authority. Merchant issuance currently presents link and Copy only; do not invent a QR requirement for that existing surface. Preserve existing shared links and the immutable signed merchant profile.

The next bounded milestone is combined-source browser and original-gate qualification, with only concrete owned defects fixed. Broader CLI/SDK/billing options require an explicit extension of the browser-only specification. No publication should occur through an alternate route after the coordinator's automatic approval rejection. This worker releases its owned paths and execution slot after committing this evidence; no background process remains active.
