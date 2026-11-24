import { Fragment, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import { subscribeAppLock } from '../lib/appLock';
import { UserFacingError } from '../lib/errors';
import { usePrivacy } from '../lib/privacyMode';
import { subscribeSession } from '../lib/session';
import { WalletDisclosureController, type PendingWalletDisclosure, type WalletDisclosureGate } from '../lib/walletDisclosure';
import { focusPrivacyControl } from './SensitiveContent';
import '../styles/walletDisclosure.css';

const unavailable: WalletDisclosureGate = () => Promise.reject(new UserFacingError({ key: 'wallet.disclosure.unavailable' }));
const WalletDisclosureContext = createContext<WalletDisclosureGate>(unavailable);
/** Production callers must supply this gate; a missing or unmounted presenter never approves a request. */
export const useWalletDisclosure = (): WalletDisclosureGate => useContext(WalletDisclosureContext);

function DisclosureDialog(props: { readonly pending: PendingWalletDisclosure; readonly controller: WalletDisclosureController; readonly opener: Element | null }): ReactNode {
  const t = useI18nOptional()?.t ?? SOURCE_TRANSLATOR.t;
  const title = useId();
  const description = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const request = props.pending.request;
  useLayoutEffect(() => {
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        props.controller.cancel(props.pending);
      } else if (event.key === 'Tab') {
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
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
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
    focusPrivacyControl();
  }, [props.opener]);
  const unknown = t('wallet.disclosure.unknown');
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
      <details><summary>{t('wallet.disclosure.details')}</summary>
        <p>{t('wallet.disclosure.payloadHint')}</p>
        <pre dir="ltr" tabIndex={0}>{request.requestJson}</pre>
      </details>
      <p className="hint">{t('wallet.disclosure.expiry')}</p>
      <div className="wallet-disclosure-actions">
        <button type="button" className="btn" ref={cancel} onClick={() => { props.controller.cancel(props.pending); }}>{t('wallet.disclosure.cancel')}</button>
        <button type="button" className="btn primary" onClick={() => { props.controller.approve(props.pending); }}>{t('wallet.disclosure.continue')}</button>
      </div>
    </div>
  </div>;
}

export function WalletDisclosureProvider(props: { readonly scope: unknown; readonly children: ReactNode }): ReactNode {
  const [controller] = useState(() => new WalletDisclosureController());
  const pending = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const privacy = usePrivacy();
  const opener = useRef<Element | null>(null);
  const scope = useRef(props.scope);
  scope.current = props.scope;
  const gate = useMemo<WalletDisclosureGate>(() => {
    const captured = props.scope;
    const assertScope = (): void => {
      if (scope.current !== captured || document.visibilityState !== 'visible') throw new UserFacingError({ key: 'wallet.disclosure.cancelled' });
    };
    return async (request, signal) => {
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
  useLayoutEffect(() => { controller.allowPresentation(!privacy.masked); }, [controller, privacy.masked]);
  useLayoutEffect(() => { controller.revoke(); }, [controller, props.scope]);
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
  const shown = pending !== undefined && !privacy.masked;
  return <WalletDisclosureContext.Provider value={gate}>
    <div inert={shown} aria-hidden={shown ? true : undefined}>{props.children}</div>
    {shown && <DisclosureDialog pending={pending} controller={controller} opener={opener.current} />}
  </WalletDisclosureContext.Provider>;
}
