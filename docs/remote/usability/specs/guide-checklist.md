# guide-checklist: pre-send safety checklist

## Requirements
- R1 `evaluateChecklist(unknown)` fail-closed: malformed input => single `input_invalid` blocker.
- R2 Blockers (not overridable): address_invalid (host `valid` + ASCII-printable only), network_mismatch, amount_invalid (digit string, >0), insufficient_funds (BigInt amount+fee<=balance), backup_not_confirmed, address_review_required (per profile review mode).
- R3 Warnings (need explicit `acknowledged` id): first_time_recipient, lookalike_address (same first/last 4 chars as a known address), address_changed, untrusted_source (link, not in contacts), self_send, high_value (profile fiat threshold), high_fee (fee > 10% of amount).
- R4 `canSend` = no failing blockers and no unacknowledged failing warnings.
- R5 Address review: `buildAddressReview(address, pick)` chunks of 4, user retypes one random chunk; `gradeAddressReview` (hex case-insensitive, others exact).
## Acceptance tests (checklist.test.ts)
- clean contact send passes (13 items); each blocker/warning individually triggers with exact boundaries (4990+10 vs 5000, fiat 999.99 vs 1000, fee 100 vs 101 on 1000).
- zero-width/Cyrillic/space/newline addresses blocked; 40-digit bigint precision; acks never clear blockers; malformed inputs fail closed; property test on canSend invariants.
