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

  it('nginx header includes send the same Permissions-Policy as _headers (camera=(self) for the QR importer)', () => {
    const policy = /Permissions-Policy: (.*)/.exec(read('../public/_headers'))![1]!.trim();
    expect(policy).toContain('camera=(self)');
    for (const f of ['../../../deploy/nginx/security-headers.conf', '../../../deploy/nginx/security-headers-embed.conf']) {
      expect(/add_header Permissions-Policy "([^"]*)"/.exec(read(f))![1]).toBe(policy);
    }
  });

  it('serves the v2 SDK cross-origin on both header-capable hosts', () => {
    expect(read('../public/_headers')).toMatch(/\/ghostpay-embed-v2\.js\n {2}Cross-Origin-Resource-Policy: cross-origin/);
    expect(read('../../../deploy/nginx/nginx.conf')).toMatch(/location = \/ghostpay-embed-v2\.js/);
  });

  // The documented snippet loads the SDK with integrity=... crossorigin="anonymous": a CORS request, blocked unless
  // the response carries Access-Control-Allow-Origin (audit L7-L1). Every header source must send it for v1 and v2.
  it('sends Access-Control-Allow-Origin: * and CORP cross-origin for both SDK versions from every header source', () => {
    const headers = read('../public/_headers');
    for (const v of ['v1', 'v2']) {
      expect(headers).toMatch(new RegExp(`\\n/ghostpay-embed-${v}\\.js\\n {2}Cross-Origin-Resource-Policy: cross-origin\\n {2}Access-Control-Allow-Origin: \\*\\n`));
    }
    /** The `{ ... }` block that starts at `start` (empty if there is none). */
    const block = (text: string, start: string): string => {
      const at = text.indexOf(start);
      if (at < 0) return '';
      let depth = 0;
      for (let i = text.indexOf('{', at); i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
      }
      return '';
    };
    const sources: [string, string][] = [
      ['../../../deploy/nginx/nginx.conf', 'location = /ghostpay-embed-'],
      ['../../../infra/proxy/nginx.conf', 'location = /ghostpay-embed-'],
      ['../../../infra/proxy/Caddyfile', 'handle /ghostpay-embed-'],
      ['../../../infra/web/Caddyfile.static', 'handle /ghostpay-embed-'],
    ];
    for (const [file, prefix] of sources) {
      for (const v of ['v1', 'v2']) {
        const b = block(read(file), `${prefix}${v}.js {`);
        expect(b, `${file} ${v}`).toMatch(/Access-Control-Allow-Origin "\*"/);
        expect(b, `${file} ${v}`).toMatch(/Cross-Origin-Resource-Policy "cross-origin"/);
      }
    }
  });

  it('GitHub Pages workflow and committed env files never enable the iframe flag', () => {
    expect(read('../../../.github/workflows/pages.yml')).not.toMatch(/VITE_EMBED_IFRAME/);
    for (const f of ['../../.env', '../../.env.production', '../../.env.local']) {
      const p = fileURLToPath(new URL(f, import.meta.url));
      if (existsSync(p)) expect(readFileSync(p, 'utf8')).not.toMatch(/VITE_EMBED_IFRAME\s*=\s*1/);
    }
  });
});
