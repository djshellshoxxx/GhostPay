import { describe, expect, it } from 'vitest';
import { validateManifest } from './manifest.js';

function manifestWithPurpose(purpose: string) {
  return {
    id: '/', name: 'Wallet', short_name: 'Wallet', start_url: '/', scope: '/',
    display: 'standalone', background_color: '#ffffff', theme_color: '#000000',
    lang: 'en', dir: 'ltr',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/mask.png', sizes: '512x512', type: 'image/png', purpose },
    ],
  };
}

describe('manifest purpose ASCII whitespace parsing', () => {
  it.each([
    'maskable  any',
    ' maskable any ',
    'maskable\tany',
    'maskable\nany',
    'maskable\r\nany',
    'maskable\fany',
    'maskable any',
  ])('accepts supported space-separated purpose tokens in %j', (purpose) => {
    expect(validateManifest(manifestWithPurpose(purpose))).toEqual([]);
  });

  it.each(['', '   ', '\t\n', 'maskable unknown', 'any\u00a0maskable'])(
    'still rejects an empty, unknown or non-ASCII-separated purpose in %j',
    (purpose) => {
      expect(validateManifest(manifestWithPurpose(purpose))).toContainEqual({
        severity: 'error', path: 'icons[2].purpose', code: 'icon_purpose',
      });
    },
  );
});
