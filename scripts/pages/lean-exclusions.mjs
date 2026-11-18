// The one list of modules the lean GhostPay EVM build (GitHub Pages, lean release) must never render (SEC-24 / E-13).
// Imported by scripts/pages/verify-pages-site.mjs (independent site verifier) and apps/web/scripts/scan-bundle.mjs (the
// post-build guard), so the two gates cannot drift apart. Ids are the source-relative module ids of the lean module
// report (apps/web/scripts/localBuildProfile.mjs: `src/...`, `../../packages/<pkg>/...`, `virtual:...`, `node:...`).
// Each entry carries a `sample` id the tests feed through both gates.

const PACKAGES = [
  'btc-silent-payments', 'btc-family', 'btc-payjoin', 'chain-solana', 'chain-tron', 'chain-evm-extra', 'solana-stealth',
  'tron-adapter', 'policy-scheme', 'pool-[^/]+', 'external-pools(?:-[^/]+)?', 'pir-[^/]+', 'payer-sponsor', 'pool-relayer',
  'merchant-billing', 'merchant-hooks',
];

/** @type {readonly { readonly re: RegExp; readonly reason: string; readonly sample: string }[]} */
export const LEAN_EXCLUDED_MODULES = Object.freeze([
  { re: /(?:^|\/)apps\/relayer\//, reason: 'relayer service runtime', sample: '../../apps/relayer/src/main.ts' },
  { re: /(?:^|\/)src\/features\/(?:btc|solana|tron|policy)\//, reason: 'deferred BTC/Solana/TRON/policy view', sample: 'src/features/btc/BtcView.tsx' },
  { re: /(?:^|\/)src\/App\.tsx$/, reason: 'full-profile application entry', sample: 'src/App.tsx' },
  { re: /(?:^|\/)src\/(?:components\/(?:TagArchive|BackupPanel)\.tsx|lib\/tagArchive\.ts)$/, reason: 'full-profile tag archive', sample: 'src/components/TagArchive.tsx' },
  { re: /(?:^|\/)src\/lib\/embedProtocol\.ts$/, reason: 'iframe embed protocol (unavailable on header-less hosts)', sample: 'src/lib/embedProtocol.ts' },
  { re: new RegExp(`(?:^|/)(?:packages|node_modules/@ghostpay)/(?:${PACKAGES.join('|')})(?:/|$)`), reason: 'preserved or deferred package', sample: '../../packages/payer-sponsor/src/index.ts' },
  { re: /^(?:virtual:)?node:/, reason: 'Node built-in', sample: 'node:fs' },
]);

/** embedHost.ts may ship in lean only for its no-op completion hook; its startup/profile exports stay out. */
const EMBED_HOST = /(?:^|\/)src\/lib\/embedHost\.ts$/;
const EMBED_HOST_LEAN_EXPORTS = new Set(['notifyEmbedDone']);

/**
 * @param {{ id?: unknown; renderedLength?: unknown; renderedExports?: unknown }} m one module of the lean report
 * @returns {string | undefined} why this rendered module must not be in a lean build, or undefined when it may
 */
export function leanModuleProblem(m) {
  const id = typeof m?.id === 'string' ? m.id.replaceAll('\\', '/') : '';
  if (id === '') return 'module without id';
  if (typeof m.renderedLength === 'number' && m.renderedLength <= 0) return undefined;
  const hit = LEAN_EXCLUDED_MODULES.find((e) => e.re.test(id));
  if (hit !== undefined) return `excluded module rendered into the lean build (${hit.reason}): ${id}`;
  if (EMBED_HOST.test(id)) {
    const exports = Array.isArray(m.renderedExports) ? m.renderedExports : undefined;
    if (exports === undefined || exports.some((name) => !EMBED_HOST_LEAN_EXPORTS.has(name))) {
      return `lean build rendered embedding startup/profile exports: ${id}`;
    }
  }
  return undefined;
}
