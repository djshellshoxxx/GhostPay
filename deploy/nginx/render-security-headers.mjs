#!/usr/bin/env node
// TM5: render the same exact connect-src list into both supported nginx profiles.
// This writes configuration artifacts only. It never starts/reloads nginx or deploys a site.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyConnectSrc, checkConnectSrc, connectSrc, parseOrigins } from '../../apps/web/scripts/csp.mjs';

const templates = dirname(fileURLToPath(import.meta.url));
const files = ['security-headers.conf', 'security-headers-embed.conf'];

export function renderSecurityHeaders(outputDir, origins) {
  connectSrc(origins); // Refuse wildcards/injection even for direct callers, before any writes.
  if (origins.length === 0) throw new Error('GHOSTPAY_CONNECT_ORIGINS: a tight nginx origin list is required');
  const output = resolve(outputDir);
  if (output === templates) throw new Error('Choose a separate output directory; shipped nginx templates are read-only inputs');
  const rendered = files.map((name) => {
    const text = applyConnectSrc(readFileSync(join(templates, name), 'utf8'), origins);
    const policies = [...text.matchAll(/^add_header Content-Security-Policy "([^"]*)" always;$/gm)].map((m) => m[1]);
    if (policies.length !== 1 || checkConnectSrc(policies[0], origins).length !== 0) {
      throw new Error(`${name}: generated nginx CSP does not match the configured origin list`);
    }
    return { name, text };
  });
  mkdirSync(output, { recursive: true });
  for (const { name, text } of rendered) writeFileSync(join(output, name), text);
  return files.slice();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('usage: render-security-headers.mjs <separate output directory>');
    renderSecurityHeaders(process.argv[2], parseOrigins(process.env['GHOSTPAY_CONNECT_ORIGINS']));
    console.log('Rendered both nginx CSP profiles; install the selected artifact only after deployment review.');
  } catch (error) {
    console.error(`render-security-headers: ${error.message}`);
    process.exit(1);
  }
}
