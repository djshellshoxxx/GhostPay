// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { recognizeRecoveryFile } from './recoveryFile';
import { STEALTH_EXPORT_LIMITS } from './stealthExport';
import { VECTORS } from './paymentKeyExport.testutil';

describe('recovery envelope recognition', () => {
  it.each([
    ['public', VECTORS.files.public.text],
    ['master', VECTORS.files.master.text],
    ['keypair', VECTORS.files.single.text],
    ['keypair', VECTORS.files.archive.text],
  ])('validates a %s envelope without relying on its name', async (kind, text) => {
    await expect(recognizeRecoveryFile(new File([text], 'wrong-name'))).resolves.toEqual({ kind });
  });

  it.each([
    '{}',
    '{"format":"ghostpay-stealth-master"}',
    VECTORS.files.master.text.replace('{', '{"kdfParams": {},'),
    VECTORS.files.public.text.replace('{', '{"version": 1,'),
  ])('rejects unsupported, mixed and duplicate envelopes', async (text) => {
    await expect(recognizeRecoveryFile(new File([text], 'ghostpay-keystore.json'))).rejects.toThrow();
  });

  it('refuses oversized files before reading their contents', async () => {
    const file = new File([], 'large.json');
    const read = vi.spyOn(file, 'text');
    Object.defineProperty(file, 'size', { value: STEALTH_EXPORT_LIMITS.keypairFileBytes + 1 });
    await expect(recognizeRecoveryFile(file)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
