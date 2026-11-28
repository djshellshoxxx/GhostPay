// Stopped and deferred products that must stay out of shipped beta and v1.0 artifacts.
//
// Source of truth for the scope: the owner stop-work directive and shared-core privacy clarification in AGENTS.md
// (2026-11-25) and docs/ai/STOP_WORK_20261125.md. This table is containment only: it never enables, removes or
// changes product code. It lets the lean (GitHub Pages) build and the emitted-artifact check fail closed if a later
// integration renders a stopped product's module into the site.
//
// Matching is on source-relative bundler module ids (relative to apps/web: `src/...`, `../../packages/<pkg>/dist/...`,
// `../../node_modules/@ghostpay/...`); callers must not pass checkout-absolute paths, whose parent directory names
// would otherwise be matched. Patterns are case-insensitive and anchored at a path segment. Shared-core
// mechanisms that the owner retained (stealth destinations, encrypted invoices and history, masking, private links/QR,
// identity verification, reconciliation, receipts, recovery, disclosure and consent) live in core modules that no
// pattern below names. A new pattern must name a product-specific directory, package or file, never a core one.

const PKG = String.raw`(?:packages|node_modules\/@ghostpay)\/`;
const FEATURE = String.raw`\/src\/features\/(?:future\/)?`;
/** Case-insensitive, anchored at the start of a path segment, tolerant of camelCase, `-` and `_` joins. */
const seg = (word) => new RegExp(String.raw`\/${word}`, 'i');
/** A product directory directly under src/features or src/features/future. */
const feature = (word) => new RegExp(String.raw`${FEATURE}${word}(?:\/|[-_.])`, 'i');

/**
 * @typedef {{ readonly id: string; readonly name: string; readonly status: 'archived' | 'deferred' | 'future-only';
 *   readonly modules: readonly RegExp[] }} StoppedProduct
 */

/** @type {readonly StoppedProduct[]} Ordered: the first matching product is reported. */
export const STOPPED_PRODUCTS = Object.freeze([
  {
    id: 'F01', name: 'GhostTips', status: 'archived',
    modules: [new RegExp(String.raw`\/${PKG}ux-links\/(?:src|dist)\/tip\.(?:[cm]?[jt]s|d\.ts)$`), seg('ghost[-_]?tips?'), feature('tips?')],
  },
  { id: 'F02', name: 'GhostStore', status: 'deferred', modules: [seg('ghost[-_]?store'), feature('(?:store|storefront|catalog)')] },
  { id: 'F04', name: 'Merchant dashboard', status: 'deferred', modules: [seg('merchant[-_]?dashboard'), feature('dashboard')] },
  { id: 'F08', name: 'GhostID', status: 'deferred', modules: [seg('ghost[-_]?id'), feature('(?:identity|merchant[-_]?identity)')] },
  {
    id: 'F09', name: 'GhostPOS', status: 'archived',
    modules: [seg('pos[-_]?terminal'), new RegExp(String.raw`\/${PKG}merchant-hooks\/`), seg('ghost[-_]?pos'), feature('pos')],
  },
  { id: 'F11', name: 'GhostTeams', status: 'deferred', modules: [seg('ghost[-_]?teams?'), feature('teams?')] },
  { id: 'F12', name: 'GhostBridge / P2P-Offramp integration', status: 'deferred', modules: [seg('ghost[-_]?bridge'), seg('p2p[-_]?off[-_]?ramp')] },
  {
    id: 'F13', name: 'Fiat conversion', status: 'archived',
    modules: [seg('fiat[-_]?conversion'), feature('fiat'), new RegExp(String.raw`\/${PKG}ux-fiat\/`), seg('off[-_]?ramp')],
  },
  { id: 'F14', name: 'Multi-chain routing', status: 'deferred', modules: [seg('multi[-_]?chain[-_]?rout'), feature('(?:multi[-_]?chain|cross[-_]?chain)')] },
  { id: 'P07', name: 'Encrypted device synchronization', status: 'deferred', modules: [seg('(?:encrypted[-_]?)?device[-_]?sync')] },
  // Every catalog proposal under src/features/future is FUTURE ONLY (docs/future/privacy-first/README.md). Workspace
  // packages keep dormant future-only cores under src/future (e.g. P13 confidential amounts) or their built dist/future.
  {
    id: 'FUTURE', name: 'Future-only feature proposal', status: 'future-only',
    modules: [/\/src\/features\/future\//, new RegExp(String.raw`\/${PKG}[^/]+\/(?:src|dist)\/future\/`)],
  },
].map((p) => Object.freeze({ ...p, modules: Object.freeze(p.modules) })));

function normalize(id) {
  const posixId = id.replaceAll('\\', '/').split('?')[0];
  return posixId.startsWith('/') ? posixId : `/${posixId}`;
}

/** Returns the stopped product a module id belongs to, or undefined for core and unrelated modules. */
export function stoppedProductForModule(id) {
  if (typeof id !== 'string' || id === '') return undefined;
  const path = normalize(id.replace(/^\0/, '').replace(/^virtual:/, ''));
  return STOPPED_PRODUCTS.find((product) => product.modules.some((re) => re.test(path)));
}
