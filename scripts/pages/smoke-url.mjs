// Pure request classification for the published Pages post-deployment smoke test.
// Same-origin is not enough for a GitHub project site: sibling projects share the origin.
// The caller validates a site URL ending in '/'. Keep non-network data/blob exemptions.
export function requestWithinPublishedSite(requestUrl, site) {
  const url = new URL(requestUrl);
  if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
  return url.origin === site.origin && url.pathname.startsWith(site.pathname);
}
