import { findChain, findToken, type Address } from '@ghostpay/chain-adapters';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice } from '../components/Common';
import { CameraImporter } from '../components/CameraImporter';
import { useManifest } from '../components/Disclosure';
import { ManifestBanner } from '../components/ManifestBanner';
import { verifyManifestForFlow } from '../lib/manifest';
import { UserFacingError, userMessage } from '../lib/errors';
import { formatUnits } from '../lib/format';
import { checkDestination, directSweep, DirectSweepOutcomeUnknownError, getSweepQuote, isUnresolvedAttempt, readBalance, reconcileSweepLock, relayedSweep, RELAYED_EXPIRY_MARGIN_SECONDS, type RelayedOrderRef, type SweepQuoteView, type SweepTarget } from '../lib/sweep';
import { RelayerRefusedError } from '../lib/relayerClient';
import { authorizeEncryptedVault, readEncryptedVault } from '../lib/keyVault';
import { captureSessionGuard } from '../lib/session';
import { useServices } from '../lib/services';
import { beginSweepAttempt, getSweepAttempt, isSweepJournalBroken, recordSweepAttempt, useApp, useSweepAttempt, useSweepJournalBroken } from '../state';
import { SweepJournalUnavailableError } from '../lib/sweepAttemptJournal';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';
import type { MessageKey } from '../i18n/catalog';

const ATTEMPT_TITLES: Partial<Record<string, MessageKey>> = {
  'unknown-after-handoff': 'sweep.attempt.unknown',
  included: 'sweep.attempt.included',
  reverted: 'sweep.attempt.reverted',
  expired: 'sweep.attempt.expired',
  refused: 'sweep.attempt.refused',
};

export function Sweep(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const sel = app.sweepTarget;
  const chainId = sel?.chainId;
  const manifest = useManifest(chainId);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<'relayer' | 'direct'>('relayer');
  const [balance, setBalance] = useState<bigint | undefined>(undefined);
  const [quote, setQuote] = useState<SweepQuoteView | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hash, setHash] = useState<string | undefined>(undefined);
  const [vaultState, setVaultState] = useState<'checking' | 'empty' | 'saved' | 'error'>('checking');
  const [vaultPass, setVaultPass] = useState('');
  const [vaultPhase, setVaultPhase] = useState<'idle' | 'authorizing' | 'action'>('idle');
  const operation = useRef(0);
  const authEpoch = useRef(0);
  // GP-SWEEP-OUTCOME-01: app-session record of the last direct sweep from this address; survives navigation.
  const attempt = useSweepAttempt(chainId, sel?.match.stealthAddress);
  const journalBroken = useSweepJournalBroken();
  const signingLocked = journalBroken || (attempt !== undefined && isUnresolvedAttempt(attempt));
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void readEncryptedVault().then(
      (saved) => { if (live) setVaultState(saved === undefined ? 'empty' : 'saved'); },
      () => { if (live) setVaultState('error'); },
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setVaultPass('');
    authEpoch.current += 1;
    return () => { authEpoch.current += 1; };
  }, [app.session]);

  const meta = sel?.match.metadata;
  const tokenAddr: Address | 'native' | undefined = meta === undefined ? undefined : meta.kind === 'native' ? 'native' : meta.token;
  const tokenCfg = chainId === undefined || tokenAddr === undefined || tokenAddr === 'native' ? undefined : findToken(chainId, tokenAddr);
  const decimals = tokenAddr === 'native' ? 18 : (tokenCfg?.decimals ?? 18);
  const symbol = tokenAddr === 'native' ? (chainId === undefined ? '' : (findChain(chainId)?.nativeSymbol ?? '')) : (tokenCfg?.symbol ?? t('sweep.tokenFallback'));

  useEffect(() => {
    let live = true;
    if (chainId === undefined || sel === undefined || tokenAddr === undefined) return;
    void (async () => {
      try {
        const rpc = await app.getRpc(chainId);
        if (rpc === undefined) return;
        const b = await readBalance(rpc, sel.match.stealthAddress, tokenAddr);
        if (live) setBalance(b);
      } catch (e) {
        if (live) setError(userMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [app, chainId, sel, tokenAddr]);

  if (sel === undefined || chainId === undefined || tokenAddr === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">{t('sweep.title')}</h2>
        <Notice kind="info">{t('sweep.choosePayment')}</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('scan'); }}>{t('sweep.goToScan')}</button>
      </section>
    );
  }
  if (app.session === undefined) {
    return (
      <section aria-labelledby="sw-h">
        <h2 id="sw-h">{t('sweep.title')}</h2>
        <Notice kind="info">{t('sweep.keysGone')}</Notice>
      </section>
    );
  }

  const target: SweepTarget = { chainId, token: tokenAddr, owner: sel.match.stealthAddress, announcement: sel.match.announcement };
  const loaded = manifest?.status === 'loaded' ? manifest.manifest : undefined;
  const relayerOk = tokenCfg?.permit === true && app.settings.relayerUrl !== '';
  const nowSec = (): number => Math.floor(services.nowMs() / 1000);

  const guard = async (fn: (assertCurrent: () => void) => Promise<boolean | void>): Promise<void> => {
    const id = ++operation.current;
    const epoch = authEpoch.current;
    const liveSession = captureSessionGuard();
    const assertCurrent = (): void => {
      if (authEpoch.current !== epoch) throw new UserFacingError(t('sweep.vaultCancelledKeys'));
      liveSession();
    };
    setBusy(true);
    setVaultPhase('authorizing');
    setError(undefined);
    try {
      const vaultGuard = await authorizeEncryptedVault(vaultPass);
      assertCurrent();
      vaultGuard?.();
      setVaultPhase('action');
      const assertAuthorized = (): void => { assertCurrent(); vaultGuard?.(); };
      const broadcast = await fn(assertAuthorized);
      // Once the transport accepts a transaction/order, a session lock cannot make it unsent.
      if (broadcast !== true) assertAuthorized();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setVaultPass('');
      if (operation.current === id) {
        setBusy(false);
        setVaultPhase('idle');
      }
    }
  };

  /** WEB-APP-01: read the manifest back from the chain before anything is signed or requested from it. */
  const verified = async (rpc: Awaited<ReturnType<typeof app.getRpc>>): Promise<void> => {
    if (manifest === undefined) throw new Error('state');
    const checked = await verifyManifestForFlow(manifest, rpc);
    if (checked.status !== 'loaded') throw new UserFacingError(checked.status === 'invalid' ? checked.reason : t('sweep.paymentsDisabledChain'));
  };

  const onQuote = (): void => {
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      const nextQuote = await getSweepQuote(app.settings.relayerUrl, { ...target, token: tokenAddr }, dest, balance, nowSec(), loaded.feeRecipient, services.fetchFn);
      assertCurrent();
      setQuote(nextQuote);
    });
  };

  const onRelay = (): void => {
    if (signingLocked) return;
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || rpc === undefined || quote === undefined || balance === undefined || tokenAddr === 'native') throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      assertNoUnresolvedAttempt();
      // The order's lock is persisted before it is posted; a failed write aborts without contacting the relayer.
      const handoff: { order?: RelayedOrderRef } = {};
      const onBeforeHandoff = (order: RelayedOrderRef): void => {
        beginSweepAttempt({ chainId, owner: target.owner, order, status: 'unknown-after-handoff' });
        handoff.order = order;
      };
      let submitted: string;
      try {
        submitted = await relayedSweep({ target: { ...target, token: tokenAddr }, manifest: loaded, destination: dest, amount: balance, quote: quote.quote, relayerUrl: app.settings.relayerUrl, rpc, nowSeconds: nowSec, fetchFn: services.fetchFn, onBeforeHandoff });
      } catch (e) {
        // Only an explicit pre-broadcast refusal releases the lock; timeouts, 409 and 5xx stay unresolved until the
        // chain shows the order executed or expired.
        if (handoff.order !== undefined && e instanceof RelayerRefusedError && e.beforeBroadcast) {
          recordSweepAttempt({ chainId, owner: target.owner, order: handoff.order, status: 'refused' });
        }
        throw e;
      }
      setHash(submitted);
      // The relayed transaction may still land: keep signing disarmed for this address until its status is checked.
      recordSweepAttempt({ chainId, owner: target.owner, ...(handoff.order === undefined ? {} : { order: handoff.order }), expectedHash: submitted.toLowerCase() as `0x${string}`, status: 'submitted' });
      app.announce(t('sweep.announceRelayer'));
      return true;
    });
  };

  const onDirect = (): void => {
    if (signingLocked) return;
    void guard(async (assertCurrent) => {
      const rpc = await app.getRpc(chainId);
      assertCurrent();
      await verified(rpc);
      assertCurrent();
      if (loaded === undefined || rpc === undefined || balance === undefined) throw new Error('state');
      const dest = checkDestination(destination, target.owner, loaded);
      assertNoUnresolvedAttempt();
      let res: Awaited<ReturnType<typeof directSweep>>;
      try {
        res = await directSweep({ target, manifest: loaded, destination: dest, amount: balance, rpc, onBeforeHandoff: beginSweepAttempt });
      } catch (e) {
        // The bytes may already be on the network: keep the lock (already persisted before handoff) disarmed.
        if (e instanceof DirectSweepOutcomeUnknownError) recordSweepAttempt(e.attempt);
        throw e;
      }
      recordSweepAttempt(res.attempt);
      app.announce(t('sweep.announceBroadcast'));
      return true;
    });
  };

  const assertNoUnresolvedAttempt = (): void => {
    if (isSweepJournalBroken()) throw new SweepJournalUnavailableError();
    const current = getSweepAttempt(chainId, target.owner);
    if (current !== undefined && isUnresolvedAttempt(current)) {
      throw new UserFacingError(t('sweep.pendingBlocksSigning'));
    }
  };

  const pendingNote = t(attempt?.order !== undefined ? 'sweep.note.pendingRelayed' : 'sweep.note.pendingDirect');

  const onCheckStatus = (): void => {
    if (attempt === undefined) return;
    setChecking(true);
    setCheckNote(undefined);
    void (async () => {
      try {
        const rpc = await app.getRpc(attempt.chainId);
        if (rpc === undefined) {
          setCheckNote(t('sweep.note.noRpc'));
          return;
        }
        const next = await reconcileSweepLock(rpc, attempt);
        if (next.status !== attempt.status) recordSweepAttempt(next);
        else setCheckNote(pendingNote);
      } catch (e) {
        setCheckNote(e instanceof UserFacingError ? e.message : t('sweep.note.checkFailed'));
      } finally {
        setChecking(false);
      }
    })();
  };

  const cancelVaultCheck = (): void => {
    authEpoch.current += 1;
    setVaultPass('');
    setError(t('sweep.vaultCancelled'));
  };

  return (
    <section aria-labelledby="sw-h">
      <h2 id="sw-h">{t('sweep.title')}</h2>
      <dl className="details">
        <dt>{t('sweep.chain')}</dt>
        <dd>{findChain(chainId)?.name ?? String(chainId)}</dd>
        <dt>{t('sweep.oneTimeAddress')}</dt>
        <dd><Mono>{target.owner}</Mono></dd>
        <dt>{t('sweep.asset')}</dt>
        <dd>{symbol} {tokenAddr === 'native' ? '' : <Mono>{tokenAddr}</Mono>}</dd>
        <dt>{t('sweep.balanceOnChain')}</dt>
        <dd>{balance === undefined ? t('sweep.balanceUnknown') : `${formatUnits(balance, decimals)} ${symbol}`}</dd>
      </dl>
      <ManifestBanner manifest={manifest} />
      {manifest !== undefined && loaded === undefined && <Notice kind="warn">{t('sweep.noManifest')}</Notice>}
      {tokenAddr !== 'native' && tokenCfg === undefined && <Notice kind="error">{t('sweep.tokenNotAllowed')}</Notice>}
      <Notice kind="warn" title={t('sweep.payerFollow.title')}>
        {t('sweep.payerFollow.body')}
      </Notice>

      <div className="stack">
        <Field label={t('sweep.destination.label')}>{(id) => <input id={id} spellCheck={false} value={destination} onChange={(e) => { setDestination(e.target.value); setQuote(undefined); }} placeholder="0x…" />}</Field>
        {vaultState === 'saved' && (
          <Field label={t('sweep.vaultPass.label')} hint={t('sweep.vaultPass.hint')}>
            {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={vaultPass} onChange={(e) => { setVaultPass(e.target.value); }} />}
          </Field>
        )}
        {vaultState === 'checking' && <p role="status">{t('sweep.vaultChecking')}</p>}
        {vaultState === 'error' && <Notice kind="error">{t('sweep.vaultError')}</Notice>}
        {loaded !== undefined && (
          <CameraImporter
            label={t('sweep.importQr')}
            onText={(text) => {
              try {
                const checked = checkDestination(text, target.owner, loaded);
                setDestination(checked);
                setQuote(undefined);
                setError(undefined);
                return true;
              } catch (e) {
                setError(userMessage(e));
                return false;
              }
            }}
          />
        )}
        <fieldset>
          <legend>{t('sweep.feeLegend')}</legend>
          <div className="check">
            <input id="m-relay" type="radio" name="mode" checked={mode === 'relayer'} onChange={() => { setMode('relayer'); }} />
            <label htmlFor="m-relay">{t('sweep.modeRelayer')}</label>
          </div>
          <div className="check">
            <input id="m-direct" type="radio" name="mode" checked={mode === 'direct'} onChange={() => { setMode('direct'); }} />
            <label htmlFor="m-direct">{t('sweep.modeDirect')}</label>
          </div>
        </fieldset>

        {mode === 'relayer' ? (
          <>
            {!relayerOk && <Notice kind="info">{t('sweep.relayerNeeds')}</Notice>}
            <button type="button" className="btn" onClick={onQuote} disabled={busy || !relayerOk || balance === undefined || balance === 0n}>{t('sweep.getQuote')}</button>
            {quote !== undefined && (
              <div className="panel">
                <p>{t('sweep.relayerFee', { amount: `${formatUnits(quote.quote.fee, decimals)} ${symbol}` })} <Mono>{quote.quote.feeTo}</Mono></p>
                <p>{t('sweep.youReceive', { amount: `${formatUnits(quote.net, decimals)} ${symbol}` })}</p>
                <button type="button" className="btn btn-primary" onClick={onRelay} disabled={busy || signingLocked}>{t('sweep.signRelayer')}</button>
              </div>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onDirect} disabled={busy || signingLocked || balance === undefined || balance === 0n}>{t('sweep.signDirect')}</button>
        )}
      </div>

      {busy && <p role="status">{t('sweep.working')}</p>}
      {busy && vaultPhase === 'authorizing' && <button type="button" className="btn" onClick={cancelVaultCheck}>{t('sweep.cancelVault')}</button>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {journalBroken && <Notice kind="warn" title={t('sweep.journalBroken.title')}>{t('sweep.journalBroken.body')}</Notice>}
      {attempt !== undefined && (
        <Notice
          kind={attempt.status === 'submitted' || attempt.status === 'included' ? 'ok' : 'warn'}
          title={t(attempt.order !== undefined && attempt.status === 'included' ? 'sweep.attempt.executed' : ATTEMPT_TITLES[attempt.status] ?? 'sweep.submitted')}
        >
          {attempt.status === 'unknown-after-handoff' && <>{attempt.order === undefined
            ? t('sweep.attempt.unknownDirect')
            : t('sweep.attempt.unknownRelayed', { deadline: new Date(attempt.order.deadline * 1000).toISOString(), minutes: String(RELAYED_EXPIRY_MARGIN_SECONDS / 60) })}<br /></>}
          {attempt.status === 'expired' && <>{t('sweep.attempt.expiredBody')}<br /></>}
          {attempt.status === 'refused' && attempt.order !== undefined && <>{t('sweep.attempt.refusedBody', { deadline: new Date(attempt.order.deadline * 1000).toISOString() })}<br /></>}
          {attempt.expectedHash !== undefined && (
            <>
              {t('sweep.txHash')} <Mono>{attempt.expectedHash}</Mono> <CopyButton text={attempt.expectedHash} label={t('sweep.copyHash')} />
              {attempt.order !== undefined && <> {t('sweep.attempt.relayerHashUnverified')}</>}
              <br />
              {t('sweep.checkExplorer')}
            </>
          )}
          {isUnresolvedAttempt(attempt) && (
            <>
              <br />
              <button type="button" className="btn" onClick={onCheckStatus} disabled={checking}>{t('sweep.checkStatus')}</button>
            </>
          )}
          {checkNote !== undefined && <><br />{checkNote}</>}
        </Notice>
      )}
      {hash !== undefined && (
        <Notice kind="ok" title={t('sweep.submitted')}>
          {t('sweep.txHash')} <Mono>{hash}</Mono> <CopyButton text={hash} label={t('sweep.copyHash')} />
          <br />
          {t('sweep.checkExplorer')}
        </Notice>
      )}
    </section>
  );
}
