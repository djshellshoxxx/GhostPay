// @ts-check
// Operator-friendly host configuration wizard. Every answer is validated immediately with the same parser that
// `profile` uses, so the wizard can never produce a configuration the rest of the kit would reject.
// It only produces a HostConfig; writing it (or not, with --dry-run) is the caller's job.
import { createInterface } from 'node:readline';
import { ERROR_CODES, KitError, isKitError } from './errors.mjs';
import { parseHostConfig } from './config/host-config.mjs';

/** @typedef {import('./types.mjs').HostConfig} HostConfig */

/**
 * @typedef {object} WizardDefaults
 * @property {string} [transport]
 * @property {string} [publicOrigin]
 * @property {string} [basePath]
 * @property {string} [port]
 * @property {string} [unixSocket]
 * @property {string} [label]
 * @property {string} [onionLocation]
 */

const MAX_ATTEMPTS = 5;

/**
 * Build a candidate config object from answers (strings); validation is done by parseHostConfig.
 * @param {Required<Pick<WizardDefaults, 'transport'>> & WizardDefaults} a
 * @returns {Record<string, unknown>}
 */
function candidate(a) {
  const listen = a.unixSocket !== undefined && a.unixSocket !== ''
    ? { kind: 'unix', path: a.unixSocket }
    : { kind: 'tcp', host: '127.0.0.1', port: a.port === undefined || a.port === '' ? 8080 : /^\d+$/.test(a.port) ? Number(a.port) : a.port };
  return {
    schemaVersion: 1,
    transport: a.transport,
    publicOrigin: a.publicOrigin === undefined || a.publicOrigin === '' ? null : a.publicOrigin,
    basePath: a.basePath === undefined || a.basePath === '' ? '/' : a.basePath,
    listen,
    mirrorLabel: a.label === undefined || a.label === '' ? `${a.transport}-mirror` : a.label,
    onionLocation: a.onionLocation === undefined || a.onionLocation === '' ? null : a.onionLocation,
  };
}

/**
 * @param {{ input: NodeJS.ReadableStream, out: (s: string) => void, interactive: boolean, defaults: WizardDefaults }} p
 * @returns {Promise<HostConfig>}
 */
export async function runWizard(p) {
  const d = p.defaults;
  if (!p.interactive) return parseHostConfig(candidate({ ...d, transport: d.transport ?? 'clearnet' }));

  const rl = createInterface({ input: p.input, crlfDelay: Infinity, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  try {
    /**
     * @param {string} prompt
     * @param {string | undefined} def
     * @returns {Promise<string>}
     */
    const ask = async (prompt, def) => {
      p.out(`${prompt}${def === undefined || def === '' ? '' : ` [${def}]`}: `);
      const next = await lines.next();
      if (next.done === true) throw new KitError(ERROR_CODES.USAGE, 'wizard input ended before all questions were answered');
      const v = String(next.value).trim();
      return v === '' ? (def ?? '') : v;
    };
    /**
     * Ask until `apply(answer)` validates, re-asking with the error message.
     * @param {string} prompt
     * @param {string | undefined} def
     * @param {(v: string) => void} apply  throws KitError on invalid answers
     */
    const askValid = async (prompt, def, apply) => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const v = await ask(prompt, def);
        try {
          apply(v);
          return;
        } catch (e) {
          if (!isKitError(e)) throw e;
          p.out(`  not accepted: ${e.message}\n`);
        }
      }
      throw new KitError(ERROR_CODES.USAGE, `no valid answer for "${prompt}" after ${MAX_ATTEMPTS} attempts`);
    };

    p.out('GhostPay hosting kit: public host configuration. Nothing here is secret; do not enter keys or tokens.\n');
    /** @type {Required<Pick<WizardDefaults, 'transport'>> & WizardDefaults} */
    const a = { ...d, transport: d.transport ?? 'clearnet' };
    await askValid('Transport (clearnet, onion, i2p)', a.transport, (v) => {
      parseHostConfig(candidate({ transport: v }));
      a.transport = v;
    });
    const originHint = a.transport === 'clearnet' ? 'https://example.org' : a.transport === 'onion' ? 'http://<56 chars>.onion, blank until Tor has created it' : 'http://<52 chars>.b32.i2p, blank until the router has created it';
    await askValid(`Public origin (${originHint})`, a.publicOrigin, (v) => {
      parseHostConfig(candidate({ transport: a.transport, publicOrigin: v }));
      a.publicOrigin = v;
    });
    await askValid('Base path ("/" or "/sub/path/")', a.basePath ?? '/', (v) => {
      parseHostConfig(candidate({ transport: a.transport, basePath: v }));
      a.basePath = v;
    });
    await askValid('Local listener: TCP port on 127.0.0.1, or unix:/absolute/socket/path', a.unixSocket !== undefined ? `unix:${a.unixSocket}` : (a.port ?? '8080'), (v) => {
      const unix = v.startsWith('unix:') ? v.slice(5) : undefined;
      parseHostConfig(candidate({ transport: a.transport, port: unix === undefined ? v : undefined, unixSocket: unix }));
      a.port = unix === undefined ? v : undefined;
      a.unixSocket = unix;
    });
    await askValid('Mirror label', a.label ?? `${a.transport}-mirror`, (v) => {
      parseHostConfig(candidate({ transport: a.transport, label: v }));
      a.label = v;
    });
    if (a.transport === 'clearnet') {
      await askValid('Onion-Location to advertise (blank for none)', a.onionLocation, (v) => {
        parseHostConfig(candidate({ transport: a.transport, onionLocation: v }));
        a.onionLocation = v;
      });
    }
    return parseHostConfig(candidate(a));
  } finally {
    rl.close();
  }
}
