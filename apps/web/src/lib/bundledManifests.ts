declare const __GHOSTPAY_MANIFESTS__: Readonly<Record<string, string>> | undefined;

/**
 * Deployment manifests that are part of the hashed JavaScript bundle (S3-01). The build (vite.config.ts) reads
 * `apps/web/deployments/<chainId>.json`, validates every file (scripts/validate-deployments.mjs) and compiles the raw text
 * into this constant, so changing a manifest changes the bundle hash. Nothing is fetched at runtime. The directory ships no
 * manifest until a real, reviewed deployment exists. `GHOSTPAY_DEPLOYMENTS_DIR` points the build at another directory (the
 * Playwright suite uses `e2e/fixtures`, never the real one).
 */
export const BUNDLED_MANIFESTS: Readonly<Record<string, string>> = Object.freeze(typeof __GHOSTPAY_MANIFESTS__ === 'undefined' ? {} : { ...__GHOSTPAY_MANIFESTS__ });
