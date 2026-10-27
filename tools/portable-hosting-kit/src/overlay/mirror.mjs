// @ts-check
// Host-specific public overlay: a small JSON document served at "<basePath>_mirror/mirror.json" next to (never
// inside) the immutable site content. It lets people and scripts compare mirrors by content digest. It is served
// by the mirror itself, so it proves nothing about authenticity on its own.

/** @typedef {import('../types.mjs').HostConfig} HostConfig */
/** @typedef {import('../types.mjs').HostingManifest} HostingManifest */

export const MIRROR_SCHEMA = 'ghostpay.hosting-kit.mirror';
export const MIRROR_SCHEMA_VERSION = 1;
/** Reserved site-relative directory for overlays; a site that already uses it cannot get an overlay. */
export const OVERLAY_DIR = '_mirror';
export const MIRROR_PATH = `${OVERLAY_DIR}/mirror.json`;

/**
 * @param {HostingManifest} manifest
 * @param {HostConfig} host
 * @param {string | null} archiveSha256
 * @returns {{ path: string, data: Uint8Array }}
 */
export function buildMirrorOverlay(manifest, host, archiveSha256) {
  const doc = {
    schema: MIRROR_SCHEMA,
    schemaVersion: MIRROR_SCHEMA_VERSION,
    appId: manifest.appId,
    releaseLabel: manifest.provenance.label,
    contentDigest: manifest.content.digest,
    entrypoint: manifest.content.entrypoint,
    fileCount: manifest.content.fileCount,
    archiveSha256,
    mirror: { label: host.mirrorLabel, transport: host.transport, publicOrigin: host.publicOrigin, basePath: host.basePath },
    notes: [
      'Served by this mirror: it cannot prove authenticity. Compare contentDigest with a value published through an independent channel (signed release notes, a second mirror reached over a different network).',
      'Every mirror origin has its own browser storage, sessions and wallet permissions. Nothing is shared or migrated between mirrors.',
    ],
  };
  return { path: MIRROR_PATH, data: new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`) };
}

/**
 * True if the site already contains the reserved overlay directory.
 * @param {string[]} sitePaths
 * @returns {boolean}
 */
export function overlayCollides(sitePaths) {
  return sitePaths.some((p) => p === OVERLAY_DIR || p.startsWith(`${OVERLAY_DIR}/`) || p.toLowerCase().startsWith(`${OVERLAY_DIR}/`));
}
