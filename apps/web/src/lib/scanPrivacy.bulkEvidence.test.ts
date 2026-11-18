import { describe, expect, it } from 'vitest';
import { DEFAULT_SCAN_PRIVACY, MAX_BULK_EVIDENCE, clampBulkEvidence } from './scanPrivacy';

describe('bulkEvidence scan privacy setting (TM12)', () => {
  it('is off by default', () => {
    expect(DEFAULT_SCAN_PRIVACY.bulkEvidence).toBe(0);
  });

  it('clamps stored or typed values to 0..MAX_BULK_EVIDENCE', () => {
    expect(clampBulkEvidence(undefined)).toBe(0);
    expect(clampBulkEvidence('25')).toBe(0);
    expect(clampBulkEvidence(Number.NaN)).toBe(0);
    expect(clampBulkEvidence(-4)).toBe(0);
    expect(clampBulkEvidence(12.9)).toBe(12);
    expect(clampBulkEvidence(25)).toBe(25);
    expect(clampBulkEvidence(MAX_BULK_EVIDENCE + 1)).toBe(MAX_BULK_EVIDENCE);
  });
});
