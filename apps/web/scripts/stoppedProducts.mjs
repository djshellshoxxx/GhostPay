// Stopped and deferred products that must stay out of shipped beta and v1.0 artifacts.
//
// Source of truth for the scope: the owner stop-work directive and shared-core privacy clarification in AGENTS.md
// (2026-11-25) and docs/ai/STOP_WORK_20261125.md. This table is containment only: it never enables, removes or
// changes product code. It lets the lean (GitHub Pages) build and the emitted-artifact check fail closed if a later
// integration renders a stopped product's module into the site.
//
// Matching is on bundler module ids (absolute or source-relative paths, `src/` or built `dist/` files). Shared-core
// mechanisms that the owner retained (stealth destinations, encrypted invoices and history, masking, private links/QR,
// identity verification, reconciliation, receipts, recovery, disclosure and consent) live in core modules that no
// pattern below names. A new pattern must name a product-specific directory, package or file, never a core one.

const PKG = String.raw`(?:packages|node_modules\/@ghostpay)\/`;
const FEATURE = String.raw`\/src\/features\/(?:future\/)?`;

/**
 * @typedef {{ readonly id: string; readonly name: string; readonly status: 'archived' | 'deferred' | 'future-only';
 *   readonly modules: readonly RegExp[] }} StoppedProduct
 */

/** @type {readonly StoppedProduct[]} Ordered: the first matching product is reported. */
export const STOPPED_PRODUCTS = Object.freeze([
  {
    id: 'F01', name: 'GhostTips', status: 'archived',
    modules: [new RegExp(String.raw`\/${PKG}ux-links\/(?:src|dist)\/tip\.(?:[cm]?[jt]s|d\.ts)$`), /\/ghost-?tips?(?:\/|\.|-)/i],
  },
  { id: 'F02', name: 'GhostStore', status: 'deferred', modules: [new RegExp(`${FEATURE}ghost-?store\\/`, 'i'), /\/ghost-?store(?:\/|\.|-)/i] },
  {
    id: 'F04', name: 'Merchant dashboard', status: 'deferred',
    modules: [new RegExp(`${FEATURE}merchant-dashboard\\/`), /\/src\/views\/MerchantDashboard\.tsx$/],
  },
  { id: 'F08', name: 'GhostID', status: 'deferred', modules: [new RegExp(`${FEATURE}ghost-?id\\/`, 'i')] },
  {
    id: 'F09', name: 'GhostPOS', status: 'archived',
    modules: [/\/(?:examples\/)?pos-terminal\//, new RegExp(String.raw`\/${PKG}merchant-hooks\/`), /\/ghost-?pos(?:\/|\.|-)/i],
  },
  { id: 'F11', name: 'GhostTeams', status: 'deferred', modules: [new RegExp(`${FEATURE}ghost-?teams\\/`, 'i'), /\/ghost-?teams(?:\/|\.|-)/i] },
  { id: 'F12', name: 'GhostBridge / P2P-Offramp integration', status: 'deferred', modules: [/\/ghost-?bridge(?:\/|\.|-)/i, /p2p-?off-?ramp/i] },
  {
    id: 'F13', name: 'Fiat conversion', status: 'archived',
    modules: [new RegExp(`${FEATURE}fiat-conversion\\/`), new RegExp(String.raw`\/${PKG}ux-fiat\/`), /\/off-?ramp(?:\/|\.|-)/i],
  },
  { id: 'F14', name: 'Multi-chain routing', status: 'deferred', modules: [new RegExp(`${FEATURE}(?:multi-?chain|cross-?chain)`, 'i'), /multi-?chain-?rout/i] },
  { id: 'P07', name: 'Encrypted device synchronization', status: 'deferred', modules: [/\/(?:encrypted-)?device-?sync(?:\/|\.|-)/i] },
  // Every catalog proposal under src/features/future is FUTURE ONLY (docs/future/privacy-first/README.md).
  { id: 'FUTURE', name: 'Future-only feature proposal', status: 'future-only', modules: [/\/src\/features\/future\//] },
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
