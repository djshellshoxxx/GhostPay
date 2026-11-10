import { MAX_PROFILE_BYTES, merchantIdFor, verifyMerchantProfile, type MerchantProfile } from '@ghostpay/invoice-schema';
import { decodeBase64Url } from '@ghostpay/invoice-schema';
import { parseEmbedMessage, type EmbedDone, type EmbedMessage } from './embedProtocol';

/**
 * Checkout side of the embed protocol. Runs only when this page is framed AND the deployment opted in (header-capable host:
 * `frame-ancestors` allowlist in deploy/nginx/embed-frame.conf). On GitHub Pages the flag is off, so the checkout never
 * answers a parent and the SDK falls back to a top-level popup.
 */

/** Query parameter carrying the base64url merchant profile JSON (public, signed; not a secret). */
export const PROFILE_PARAM = 'gpm';

interface MessageLike {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}
interface HostWindow {
  readonly parent: HostWindow | { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (e: MessageLike) => void): void;
  removeEventListener(type: 'message', listener: (e: MessageLike) => void): void;
}

export interface EmbedSession {
  /** Sends the single completion message to the verified parent origin. Later calls are ignored. */
  done(payload: EmbedDone): void;
  close(): void;
}

let active: EmbedSession | undefined;

/** Called by the payment flow when a payment was submitted/failed/cancelled. No-op unless an embed session is active. */
export function notifyEmbedDone(payload: EmbedDone): void {
  active?.done(payload);
}

/** Reads and verifies the profile from the page query. Returns undefined if absent, oversize, malformed, forged or expired. */
export function readProfileFromSearch(search: string, nowSec: number): MerchantProfile | undefined {
  try {
    const raw = new URLSearchParams(search).get(PROFILE_PARAM);
    if (raw === null || raw.length > Math.ceil((MAX_PROFILE_BYTES * 4) / 3) + 4) return undefined;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(raw));
    const r = verifyMerchantProfile(text, nowSec);
    return r.ok ? r.profile : undefined;
  } catch {
    return undefined;
  }
}

/** Fetches a profile from a merchant URL (https only, no credentials, no referrer, 8 KB cap). Undefined on any failure. */
export async function fetchMerchantProfile(
  url: string,
  nowSec: number,
  fetchFn: (input: string, init: RequestInit) => Promise<Response> = (i, init) => fetch(i, init),
): Promise<MerchantProfile | undefined> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') return undefined;
    const res = await fetchFn(u.href, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', mode: 'cors' });
    if (!res.ok) return undefined;
    const len = Number(res.headers.get('content-length') ?? '0');
    if (Number.isFinite(len) && len > MAX_PROFILE_BYTES) return undefined;
    const text = await res.text();
    const r = verifyMerchantProfile(text, nowSec);
    return r.ok ? r.profile : undefined;
  } catch {
    return undefined;
  }
}

/** Short grouped fingerprint of the signer key for display (hash-derived merchantId), e.g. `abcd-efgh-ijkl-mnop`. */
export function signerFingerprint(signerHex: string): string {
  return (merchantIdFor(signerHex).match(/.{4}/g) ?? []).join('-');
}

/**
 * Starts the host. Accepts a `gp:hello` only when `event.source === window.parent` and `event.origin` is an exact member of
 * the verified profile's `origins`. Replies `gp:init` to that origin only (never `*`). One accepted nonce per page load.
 *
 * @returns The session, or undefined when embedding is not enabled/applicable.
 */
export function startEmbedHost(win: HostWindow, profile: MerchantProfile | undefined, enabled: boolean): EmbedSession | undefined {
  if (!enabled || profile === undefined || win.parent === win) return undefined;
  const parent = win.parent;
  const origins = new Set(profile.origins);
  let nonce: string | undefined;
  let origin: string | undefined;
  let finished = false;

  const post = (m: EmbedMessage): void => {
    if (origin === undefined) return;
    (parent as { postMessage(message: unknown, targetOrigin: string): void }).postMessage(m, origin);
  };

  const onMessage = (e: MessageLike): void => {
    if (e.source !== parent || !origins.has(e.origin)) return;
    const m = parseEmbedMessage(e.data);
    if (m === undefined || m.t !== 'gp:hello' || nonce !== undefined) return;
    nonce = m.n;
    origin = e.origin;
    post({ t: 'gp:init', n: m.n, v: 1, data: {} });
  };
  win.addEventListener('message', onMessage);

  const session: EmbedSession = {
    done(payload) {
      if (finished || nonce === undefined) return;
      // Rebuild from the three allowed fields and re-validate: extra caller fields can never leave this page.
      const m = parseEmbedMessage({
        t: 'gp:done',
        n: nonce,
        v: 1,
        data: { status: payload.status, chainId: payload.chainId, ...(payload.txHash === undefined ? {} : { txHash: payload.txHash }) },
      });
      if (m === undefined) return;
      finished = true;
      post(m);
    },
    close() {
      win.removeEventListener('message', onMessage);
      if (active === session) active = undefined;
    },
  };
  active = session;
  return session;
}
