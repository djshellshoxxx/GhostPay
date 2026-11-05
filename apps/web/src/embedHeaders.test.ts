import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('embed framing headers', () => {
  it('keeps the default deployments un-frameable (popup-only)', () => {
    for (const f of ['../public/_headers', '../../../deploy/nginx/security-headers.conf']) {
      const t = read(f);
      expect(t).toMatch(/frame-ancestors 'none'/);
      expect(t).toMatch(/X-Frame-Options:? "?DENY/);
    }
  });

  it('the opt-in embed variant uses an explicit allowlist variable, no wildcard, and no conflicting X-Frame-Options', () => {
    const t = read('../../../deploy/nginx/security-headers-embed.conf');
    const csp = /add_header Content-Security-Policy "([^"]*)"/.exec(t)![1]!;
    expect(csp).toContain('frame-ancestors $gp_frame_ancestors;');
    expect(csp).not.toMatch(/frame-ancestors[^;]*[*]/);
    expect(t).not.toMatch(/add_header X-Frame-Options/);
    expect(t).toMatch(/add_header Referrer-Policy "no-referrer"/);
    expect(csp).toMatch(/script-src 'self'/);
  });

  it('serves the v2 SDK cross-origin on both header-capable hosts', () => {
    expect(read('../public/_headers')).toMatch(/\/ghostpay-embed-v2\.js\n {2}Cross-Origin-Resource-Policy: cross-origin/);
    expect(read('../../../deploy/nginx/nginx.conf')).toMatch(/location = \/ghostpay-embed-v2\.js/);
  });

  it('GitHub Pages workflow and committed env files never enable the iframe flag', () => {
    expect(read('../../../.github/workflows/pages.yml')).not.toMatch(/VITE_EMBED_IFRAME/);
    for (const f of ['../../.env', '../../.env.production', '../../.env.local']) {
      const p = fileURLToPath(new URL(f, import.meta.url));
      if (existsSync(p)) expect(readFileSync(p, 'utf8')).not.toMatch(/VITE_EMBED_IFRAME\s*=\s*1/);
    }
  });
});
