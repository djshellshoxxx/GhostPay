import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ar from '../../locales/ar.json';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import ja from '../../locales/ja.json';
import { OBSERVERS } from './Disclosure';

// Audit S3-27: only the reference relayer's rate limiter hashes the address; the operator and any proxy in front of
// it receive the connection, so they can see the raw address.
describe('relayer operator disclosure', () => {
  it('says the relayer side can see the payer\'s or seller\'s IP address', () => {
    const learns = OBSERVERS.find((row) => row.who === 'Relayer operator')?.learns ?? '';
    expect(learns).toMatch(/^Your IP address \(/);
    expect(learns).toContain('visible to the operator and any proxy');
    expect(learns).toContain('hashed by the reference relayer for rate limits');
  });

  it('says the same on the Sweep screen, where the relayer is chosen, and in the user guide', () => {
    const guide = readFileSync(join(process.cwd(), '../../docs/user/sweep-and-gas-privacy.md'), 'utf8');
    for (const text of [en.messages['sweep.payerFollow.body'], guide]) {
      expect(text).not.toMatch(/\(hashed\)|\(hashed for rate limiting\)/);
      expect(text).toContain('the reference relayer');
      expect(text).toMatch(/operator and any proxy[^.]* (can )?see it|visible to the operator and any proxy/);
    }
  });

  it.each([['es', es, 'proxy'], ['ja', ja, 'プロキシ'], ['ar', ar, 'وكيل']] as const)(
    'carries the corrected statement in the %s draft', (_locale, catalog, proxy) => {
      expect(catalog.messages['disclosure.observer.4.learns']).toContain(proxy);
      expect(catalog.messages['sweep.payerFollow.body']).toContain(proxy);
    },
  );
});
