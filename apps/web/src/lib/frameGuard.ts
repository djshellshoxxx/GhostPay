import type { ViewId } from '../state';

/**
 * Hosting-context guards for header-less static hosts (GitHub Pages): such a host cannot send `frame-ancestors`,
 * X-Frame-Options or COOP, and the build cannot prove which origin actually serves it. Both checks run in the page.
 *
 * Their notices are fixed English text: like the other critical security disclosures they are shown in English until a
 * reviewed translation exists (src/i18n/securityKeys.ts), and they must render even if a catalog fails to load.
 */

/** The parts of `window` the frame check reads. */
export interface FrameWindow {
  readonly self: unknown;
  readonly top: unknown;
}

/** True when this document is not the top-level browsing context. Fails closed: an unreadable `top` counts as framed. */
export function isFramed(win: FrameWindow): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

/**
 * The explicit iframe embed mode (src/lib/embedHost.ts): full profile only, opted in at build time with
 * VITE_EMBED_IFRAME=1 for a header-capable host that sends a `frame-ancestors` allowlist. Lean/Pages builds never embed.
 */
export function embedModeEnabled(env: Readonly<Record<string, unknown>>, profile: 'full' | 'lean'): boolean {
  return profile === 'full' && env['VITE_EMBED_IFRAME'] === '1';
}

/**
 * Views that hold or use seller keys or change local trust settings (SEC-18 / D-13, E-11): a framing page could overlay
 * them to trick a click (clickjacking). Only these views render while framed outside the embed mode.
 */
export const FRAME_SAFE_VIEWS: readonly ViewId[] = Object.freeze<ViewId[]>(['home', 'pay', 'about']);

/** Whether `view` must be replaced by the refusal notice. */
export function frameRefusesView(view: ViewId, framed: boolean, embedMode: boolean): boolean {
  return framed && !embedMode && !FRAME_SAFE_VIEWS.includes(view);
}

export const FRAME_REFUSAL = Object.freeze({
  title: 'Open GhostPay in its own tab',
  body: 'This page is shown inside another site. Seller keys, invoices, scanning, sweeps, the registry and settings are not available here, because the other site could cover them and trick a click.',
  action: 'Open in a new tab',
});
