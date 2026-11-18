/// <reference types="vite/client" />
/**
 * The extracted browser codecs have one authoritative regression suite. Collect it
 * under the Node package too: the same GUI-facing public adapters must work without
 * browser storage and exercise exactly the source shipped to the operator CLI.
 */
import '../../../apps/web/src/lib/keystore.test.ts';
import '../../../apps/web/src/lib/reconciliationLedger.test.ts';
import '../../../apps/web/src/lib/reconciliationMatch.test.ts';
import '../../../apps/web/src/lib/reconciliationVault.test.ts';
import '../../../apps/web/src/lib/reconciliationVault.invoices.test.ts';
import '../../../apps/web/src/lib/tagArchive.test.ts';
import '../../../apps/web/src/lib/tagArchive.vectors.test.ts';

import { describe, expect, it } from 'vitest';
import { createKeystoreApi, createReconciliationApi, createTagArchiveApi, PortableVaultError, checkpointKeyId } from './portable.js';

describe('portable operator diagnostics', () => {
  it('reports only public descriptors without retaining the supplied secret', () => {
    const api = createKeystoreApi();
    expect(api.passphraseProblem('classified')).toBe('error.keystore.passphraseShort');
    expect(() => api.validateKeystoreEnvelope('PRIVATE INVALID FILE')).toThrow(PortableVaultError);
    try { api.validateKeystoreEnvelope('PRIVATE INVALID FILE'); } catch (error) {
      expect(JSON.stringify(error)).not.toContain('PRIVATE INVALID FILE');
    }
  });
  it('keeps the historical seller scope hash stable across browser and CLI casing', () => {
    const spending = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    const viewing = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
    expect(checkpointKeyId(spending, viewing)).toBe(checkpointKeyId(spending.toUpperCase(), viewing.toUpperCase()));
  });
  it('rejects malformed and oversized reconciliation headers before key derivation', () => {
    const api = createReconciliationApi();
    for (const text of ['{', '{}', '{"sellerKeyId":[],"chainId":1}', 'x'.repeat(api.MAX_VAULT_BYTES + 1)])
      expect(() => api.inspectReconciliationEnvelope(text)).toThrow(PortableVaultError);
  });
  it('inspects the exact GPA1 bounded header without decrypting protected records', () => {
    const api = createTagArchiveApi();
    const bytes = new Uint8Array(52);
    bytes.set(new TextEncoder().encode('GPA1')); bytes.set([1, 17, 8, 1], 4);
    expect(api.inspectArchive(bytes)).toEqual({ version: 1, bytes: 52, kdf: 'scrypt', N: 131072, r: 8, p: 1, cipher: 'AES-256-GCM' });
    bytes[5] = 30;
    expect(() => api.inspectArchive(bytes)).toThrow(PortableVaultError);
  });
});
