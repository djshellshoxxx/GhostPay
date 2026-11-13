// Shared, pure request classification for the published-site smoke test.
// The baseline policy ignores non-network data/blob URLs and rejects other origins.
export function requestWithinPublishedSite(requestUrl, site) {
  const url = new URL(requestUrl);
  return url.protocol === 'data:' || url.protocol === 'blob:' || url.origin === site.origin;
}
