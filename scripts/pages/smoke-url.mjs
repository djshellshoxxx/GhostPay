// Pure request classification for the published Pages post-deployment smoke test.
// Same-origin is not enough for a GitHub project site: sibling projects share the origin.
// The caller validates a site URL ending in '/'. Keep non-network data/blob exemptions.
export function requestWithinPublishedSite(requestUrl, site) {
  const url = new URL(requestUrl);
  if (url.protocol === 'data:' || url.protocol === 'blob:') return true;
  return url.origin === site.origin && url.pathname.startsWith(site.pathname);
}

/**
 * SEC-09 / E-03: the build trusts the declared serving origin (GHOSTPAY_PAGES_ORIGIN) for its shared-origin gate and its
 * runtime origin guard; the URL GitHub actually deployed to must be that origin. Returns a problem, or undefined.
 */
export function deployedOriginProblem(pageUrl, declared) {
  const d = String(declared ?? '').toLowerCase();
  let declaredOrigin;
  try {
    declaredOrigin = new URL(d).origin;
  } catch {
    declaredOrigin = undefined;
  }
  if (declaredOrigin === undefined || declaredOrigin !== d || !/^https?:$/.test(new URL(d).protocol)) {
    return `declared origin ${JSON.stringify(String(declared ?? ''))} is not a scheme://host[:port] origin`;
  }
  let deployed;
  try {
    deployed = new URL(pageUrl).origin;
  } catch {
    return `page_url ${JSON.stringify(String(pageUrl))} is not a URL`;
  }
  return deployed === declaredOrigin ? undefined : `deployed origin ${deployed} != declared ${declaredOrigin}`;
}
