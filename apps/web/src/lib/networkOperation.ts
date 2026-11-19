import type { Services } from './services';
import { networkAuthorizationError, type NetworkAuthorization, type NetworkAuthorizationRequest } from './networkAuthorization';

/** A Bitcoin action may explicitly use its Esplora source and up to two selected public-data oracles. */
export function authorizedOperationFetch(services: Pick<Services, 'network' | 'fetchFn'>, requests: readonly NetworkAuthorizationRequest[]): Services['fetchFn'] {
  if (services.network === undefined) return services.fetchFn;
  const contexts: { request: NetworkAuthorizationRequest; endpoint: URL; context: NetworkAuthorization }[] = [];
  try {
    for (const request of requests) contexts.push({ request, endpoint: new URL(request.endpoint), context: services.network.authorize(request) });
  } catch {
    for (const { context } of contexts) context.dispose();
    throw networkAuthorizationError();
  }
  contexts.sort((a, b) => b.endpoint.pathname.length - a.endpoint.pathname.length);
  return (target, init) => {
    let url: URL;
    try { url = new URL(target); } catch { return Promise.reject(networkAuthorizationError()); }
    const selected = contexts.find(({ request, endpoint }) => request.match === 'prefix'
      ? url.origin === endpoint.origin && (url.pathname === endpoint.pathname || url.pathname.startsWith(`${endpoint.pathname.replace(/\/+$/, '')}/`))
      : url.href === endpoint.href);
    return selected === undefined ? Promise.reject(networkAuthorizationError()) : selected.context.fetchFn(target, init);
  };
}
