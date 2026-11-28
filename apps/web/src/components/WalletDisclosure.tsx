import { ControlTip } from './ControlTips';
import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { subscribeAppLock } from '../lib/appLock';
import { UserFacingError } from '../lib/errors';
import { usePrivacy } from '../lib/privacyMode';
import { subscribeSession } from '../lib/session';
import { focusPrivacyControl } from './SensitiveContent';
import { WalletDisclosureController, type PendingWalletDisclosure, type WalletDisclosureGate } from '../lib/walletDisclosure';
import '../styles/walletDisclosure.css';

const unavailable: WalletDisclosureGate = () => Promise.reject(new UserFacingError({ key: 'wallet.disclosure.unavailable' }));
const WalletDisclosureContext = createContext<WalletDisclosureGate>(unavailable);
/** Production callers must supply this gate; a missing or unmounted presenter never approves a request. */
export const useWalletDisclosure = (): WalletDisclosureGate => useContext(WalletDisclosureContext);

/** Resolves once the page is visible; rejects as cancelled if `signal` aborts first. */
function untilVisible(signal?: AbortSignal): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = (): void => { document.removeEventListener('visibilitychange', onChange); signal?.removeEventListener('abort', onAbort); };
    const onChange = (): void => { if (document.visibilityState === 'visible') { done(); resolve(); } };
    const onAbort = (): void => { done(); reject(new UserFacingError({ key: 'wallet.disclosure.cancelled' })); };
    if (signal?.aborted === true) { onAbort(); return; }
    document.addEventListener('visibilitychange', onChange);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Moves focus to the page's main heading when the control that opened the review is gone. */
function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h2, main h1, h2, h1');
  if (heading === null) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

function DisclosureDialog(props: { readonly pending: PendingWalletDisclosure; readonly controller: WalletDisclosureController; readonly opener: Element | null }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const title = useId();
  const description = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // Read when the dialog closes, not captured by the cleanup: a quick hide masks the page in the same update that
  // cancels this review. A ref, so a mask change alone never reruns the focus cleanup.
  const { masked } = usePrivacy();
  const maskedNow = useRef(masked);
  maskedNow.current = masked;
  const request = props.pending.request;
  useLayoutEffect(() => {
    cancel.current?.focus();
    // Capture phase on window, ahead of the background's own document-level key traps (QR view, help), which are
    // inert while the dialog is open but still listen.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        props.controller.cancel(props.pending);
      } else if (event.key === 'Tab') {
        event.stopPropagation();
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]') ?? [])];
        const first = controls[0]; const last = controls[controls.length - 1];
        const outside = !dialog.current?.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first?.focus(); }
      }
    };
    const onFocus = (event: FocusEvent): void => {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) cancel.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [props.controller, props.pending]);
  useEffect(() => () => {
    // Passive cleanup runs after the background's inert attribute is removed. A replacement dialog owns focus.
    if (document.querySelector('.wallet-disclosure-dialog') !== null) return;
    const opener = props.opener;
    if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body
      && opener !== document.documentElement && !opener.matches(':disabled')
      && opener.closest('[hidden], [inert]') === null) {
      opener.focus();
      if (document.activeElement === opener) return;
    }
    // Masked (#355): the opener's view has left the document, so the neutral privacy control in the shell, no longer
    // inert at this point, is the safe target. An unmasked page keeps the heading fallback.
    if (maskedNow.current) {
      focusPrivacyControl();
      if (document.activeElement instanceof HTMLElement && document.activeElement.matches('[data-privacy-safe-control]')) return;
    }
    focusPageHeading();
  }, [props.opener]);
  const unknown = t('wallet.disclosure.unknown');
  // No live region: account, address and amount values must not be announced automatically (#286 item 5).
  return <div className="wallet-disclosure-backdrop">
    <div className="wallet-disclosure-dialog" role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={description} ref={dialog}>
      <h2 id={title}>{t('wallet.disclosure.title')}</h2>
      <p id={description}>{t('wallet.disclosure.intro')}</p>
      {request.method === 'eth_requestAccounts' && <p>{t('wallet.disclosure.accountAccess')}</p>}
      <dl className="kv">
        <dt>{t('wallet.disclosure.method')}</dt><dd><code>{request.method}</code></dd>
        <dt>{t('wallet.disclosure.chain')}</dt><dd><bdi dir="ltr">{request.chainId}</bdi></dd>
        <dt>{t('wallet.disclosure.account')}</dt><dd><bdi dir="ltr">{request.account ?? unknown}</bdi></dd>
        {request.method !== 'eth_requestAccounts' && request.method !== 'wallet_switchEthereumChain' && <>
          <dt>{t('wallet.disclosure.destination')}</dt><dd><bdi dir="ltr">{request.destination ?? unknown}</bdi></dd>
          {request.method === 'eth_sendTransaction' ? <>
            {request.contractCall !== undefined && <>
              <dt>{t('wallet.disclosure.contractCall')}</dt><dd><code>{request.contractCall.name}</code></dd>
              {request.contractCall.fields.length > 0 && <>
                <dt>{t('wallet.disclosure.arguments')}</dt>
                <dd><dl>{request.contractCall.fields.map(([name, value]) => <Fragment key={name}>
                  <dt><code>{name}</code></dt><dd><bdi dir="ltr">{value}</bdi></dd>
                </Fragment>)}</dl></dd>
              </>}
            </>}
            <dt>{t('wallet.disclosure.nativeValue')}</dt><dd><bdi dir="ltr">{request.nativeValueWei ?? unknown}</bdi></dd>
          </> : <>
            <dt>{t('wallet.disclosure.domainChain')}</dt><dd><bdi dir="ltr">{request.domainChainId ?? unknown}</bdi></dd>
            <dt>{t('wallet.disclosure.primaryType')}</dt><dd><bdi dir="ltr">{request.primaryType ?? unknown}</bdi></dd>
            <dt>{t('wallet.disclosure.typedRecipient')}</dt><dd><bdi dir="ltr">{request.typedRecipient ?? unknown}</bdi></dd>
            <dt>{t('wallet.disclosure.typedAmount')}</dt><dd><bdi dir="ltr">{request.typedAmount ?? unknown}</bdi></dd>
          </>}
        </>}
      </dl>
      {request.method === 'eth_sendTransaction' && <p>{t('wallet.disclosure.contractEffects')}</p>}
      <details><ControlTip message="wallet.disclosure.payloadHint"><summary>{t('wallet.disclosure.details')}</summary></ControlTip>
        <p>{t('wallet.disclosure.payloadHint')}</p>
        <ControlTip message="wallet.disclosure.payloadHint"><pre dir="ltr" tabIndex={0}>{request.requestJson}</pre></ControlTip>
      </details>
      <p className="hint">{t('wallet.disclosure.expiry')}</p>
      <div className="wallet-disclosure-actions">
        <ControlTip message="tips.walletCancel"><button type="button" className="btn" ref={cancel} onClick={() => { props.controller.cancel(props.pending); }}>{t('wallet.disclosure.cancel')}</button></ControlTip>
        <ControlTip message="wallet.disclosure.intro"><button type="button" className="btn primary" onClick={() => { props.controller.approve(props.pending); }}>{t('wallet.disclosure.continue')}</button></ControlTip>
      </div>
    </div>
  </div>;
}

/**
 * Hosts the one wallet-disclosure dialog of the app. Nothing is approved without a click.
 * - `scope`: a gate captured under one scope refuses every request once the scope changes (connected wallets must
 *   reconnect). Keep it stable for the life of the app.
 * - `revokeOn`: any change cancels the open review only; later requests from connected wallets are shown again.
 * The app lock, a session change, hiding or leaving the page also cancel an open review.
 */
export function WalletDisclosureProvider(props: { readonly scope: unknown; readonly revokeOn?: unknown; readonly children: ReactNode }): ReactNode {
  const [controller] = useState(() => new WalletDisclosureController());
  const pending = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const opener = useRef<Element | null>(null);
  // One dialog element per request: nothing (an open <details>, focus) carries over to the next review.
  const keys = useRef(new WeakMap<PendingWalletDisclosure, number>());
  const nextKey = useRef(0);
  const scope = useRef(props.scope);
  scope.current = props.scope;
  const gate = useMemo<WalletDisclosureGate>(() => {
    const captured = props.scope;
    const assertScope = (): void => {
      if (scope.current !== captured || document.visibilityState !== 'visible') throw new UserFacingError({ key: 'wallet.disclosure.cancelled' });
    };
    return async (request, signal) => {
      // A review is never shown to a hidden page; a request made meanwhile (an automatic follow-up after an approval
      // was mined) waits for the page to be visible again instead of failing.
      await untilVisible(signal);
      assertScope();
      // Capture before rendering inert; browsers may move focus as soon as the opener becomes inert.
      if (controller.getSnapshot() === undefined) opener.current = document.activeElement;
      const approval = await controller.request(request, signal);
      const assertCurrent = (): void => { assertScope(); approval.assertCurrent(); };
      assertCurrent();
      return Object.freeze({ assertCurrent });
    };
  }, [controller, props.scope]);
  useLayoutEffect(() => controller.mount(), [controller]);
  // #286 item 1: account, destination and amount are shown only on a revealed screen. Masking cancels an open review
  // and refuses new ones (nothing reaches the wallet); the user reveals, then repeats the action.
  const { masked } = usePrivacy();
  useLayoutEffect(() => { controller.allowPresentation(!masked); }, [controller, masked]);
  useLayoutEffect(() => { controller.revoke(); }, [controller, props.scope, props.revokeOn]);
  useEffect(() => {
    const revoke = (): void => { controller.revoke(); };
    const visibility = (): void => { if (document.visibilityState !== 'visible') revoke(); };
    const stopLock = subscribeAppLock(revoke);
    const stopSession = subscribeSession(revoke);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', revoke);
    return () => {
      stopLock(); stopSession();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', revoke);
      revoke();
    };
  }, [controller]);
  const shown = pending !== undefined;
  const dialogKey = (value: PendingWalletDisclosure): number => {
    const known = keys.current.get(value);
    if (known !== undefined) return known;
    const key = ++nextKey.current;
    keys.current.set(value, key);
    return key;
  };
  return <WalletDisclosureContext.Provider value={gate}>
    <div inert={shown} aria-hidden={shown ? true : undefined}>{props.children}</div>
    {shown && <DisclosureDialog key={dialogKey(pending)} pending={pending} controller={controller} opener={opener.current} />}
  </WalletDisclosureContext.Provider>;
}
