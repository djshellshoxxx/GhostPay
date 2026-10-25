import { useState, type FormEvent, type ReactNode } from 'react';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import { exportSettingsExchange, parseSettingsExchange, applySettingsExchange, type SharedSettings } from '../lib/settingsExchange';
import { Field, Notice } from '../components/Common';
import { userMessage } from '../lib/errors';
import { checkDelayRange, checkRelayerUrl, checkRpcUrl, type Settings as SettingsData } from '../lib/settings';
import { applyParanoidPreset, browserStorage, checkIndexerUrl, checkScanEndpoint, describeScanDisclosure, loadScanPrivacy, saveScanPrivacy, type ScanPrivacySettings, type ScanTransportKind } from '../lib/scanPrivacy';
import { useServices } from '../lib/services';
import { useApp } from '../state';
import { LanguagePicker } from '../i18n/LanguagePicker';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

export function Settings(): ReactNode {
  const app = useApp();
  const services = useServices();
  // Settings is also rendered directly by component tests; those isolated renders intentionally use source English.
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const s = app.settings;
  const [rpc, setRpc] = useState<Record<string, string>>({ ...s.rpcUrls });
  const [rpc2, setRpc2] = useState<Record<string, string>>({ ...s.rpcUrlsSecondary });
  const [relayer, setRelayer] = useState(s.relayerUrl);
  const [minSec, setMinSec] = useState(s.delayMinSec);
  const [maxSec, setMaxSec] = useState(s.delayMaxSec);
  const [lock, setLock] = useState(s.lockTimeoutMin);
  const [theme, setTheme] = useState<SettingsData['theme']>(s.theme);
  const [autoClear, setAutoClear] = useState(s.autoClearFragment);
  const [pins, setPins] = useState(s.pinnedSigners.join('\n'));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | undefined>(undefined);
  const [transfer, setTransfer] = useState<string | undefined>();
  const [preview, setPreview] = useState<SharedSettings | undefined>();
  const [checks, setChecks] = useState<Record<string, string>>({});

  const onSave = (e: FormEvent): void => {
    e.preventDefault();
    try {
      const rpcUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(rpc)) if (v.trim() !== '') rpcUrls[k] = checkRpcUrl(v);
      const rpcUrlsSecondary: Record<string, string> = {};
      for (const [k, v] of Object.entries(rpc2)) if (v.trim() !== '') rpcUrlsSecondary[k] = checkRpcUrl(v);
      checkDelayRange(minSec, maxSec);
      if (!Number.isInteger(lock) || lock < 1 || lock > 240) throw new Error('lock');
      const pinnedSigners = pins
        .split('\n')
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l !== '');
      if (pinnedSigners.some((p) => !/^(?:02|03)[0-9a-f]{64}$/.test(p))) {
        setMessage({ kind: 'error', text: t('settings.error.pins') });
        return;
      }
      const next: SettingsData = { rpcUrls, rpcUrlsSecondary, relayerUrl: checkRelayerUrl(relayer), delayMinSec: minSec, delayMaxSec: maxSec, lockTimeoutMin: lock, theme, autoClearFragment: autoClear, pinnedSigners };
      const saved = app.updateSettings(next);
      setMessage(saved ? { kind: 'ok', text: t('settings.saved') } : { kind: 'warn', text: t('settings.storageUnavailable') });
      app.announce(t('settings.announce'));
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error && err.message === 'lock' ? t('settings.error.lock') : userMessage(err) });
    }
  };

  const onTest = (chainId: number): void => {
    const chain = services.chains.find((c) => c.chainId === chainId);
    const url = rpc[String(chainId)] ?? '';
    if (chain === undefined) return;
    setChecks((c) => ({ ...c, [chainId]: t('settings.rpc.checking') }));
    void (async () => {
      try {
        await services.createRpc(chain, checkRpcUrl(url));
        setChecks((c) => ({ ...c, [chainId]: t('settings.rpc.connected') }));
      } catch (err) {
        setChecks((c) => ({ ...c, [chainId]: err instanceof Error && err.name === 'ChainAdapterError' ? t('settings.rpc.failed') : userMessage(err) }));
      }
    })();
  };

  return (
    <section aria-labelledby="set-h">
      <h2 id="set-h">{t('settings.title')}</h2>
      {i18n !== undefined && <LanguagePicker />}
      <Notice kind="info">
        {t('settings.notice.plaintext')}
      </Notice>
      <Notice kind="warn" title={t('settings.outside.title')}>
        {t('settings.outside.body')}
      </Notice>
      <form onSubmit={onSave} className="stack" noValidate>
        <fieldset>
          <legend>{t('settings.rpc.legend')}</legend>
          <p className="hint">{t('settings.rpc.hint')}</p>
          {services.chains.map((c) => (
            <div key={c.chainId} className="row">
              <Field label={t('settings.rpc.url', { chain: c.name })}>
                {(id) => <input id={id} type="url" spellCheck={false} value={rpc[String(c.chainId)] ?? ''} onChange={(e) => { setRpc({ ...rpc, [String(c.chainId)]: e.target.value }); }} />}
              </Field>
              <button type="button" className="btn" onClick={() => { onTest(c.chainId); }}>{t('settings.rpc.test', { chain: c.name })}</button>
              <p role="status" className="hint">{checks[c.chainId] ?? ''}</p>
              <Field label={t('settings.rpc.secondary.label', { chain: c.name })} hint={t('settings.rpc.secondary.hint')}>
                {(id, d) => <input id={id} aria-describedby={d} type="url" spellCheck={false} value={rpc2[String(c.chainId)] ?? ''} onChange={(e) => { setRpc2({ ...rpc2, [String(c.chainId)]: e.target.value }); }} />}
              </Field>
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t('settings.relayer.legend')}</legend>
          <Field label={t('settings.relayer.label')} hint={t('settings.relayer.hint')}>
            {(id, d) => <input id={id} aria-describedby={d} type="url" spellCheck={false} value={relayer} onChange={(e) => { setRelayer(e.target.value); }} />}
          </Field>
        </fieldset>
        <fieldset>
          <legend>{t('settings.delay.legend')}</legend>
          <Field label={t('settings.delay.min')}>{(id) => <input id={id} type="number" min={0} value={minSec} onChange={(e) => { setMinSec(Number(e.target.value)); }} />}</Field>
          <Field label={t('settings.delay.max')}>{(id) => <input id={id} type="number" min={0} value={maxSec} onChange={(e) => { setMaxSec(Number(e.target.value)); }} />}</Field>
          <p className="hint">{t('settings.delay.range', { min: minSec, max: maxSec })}</p>
        </fieldset>
        <fieldset>
          <legend>{t('settings.safety.legend')}</legend>
          <Field label={t('settings.lock.label')} hint={t('settings.lock.hint')}>
            {(id, d) => <input id={id} aria-describedby={d} type="number" min={1} max={240} value={lock} onChange={(e) => { setLock(Number(e.target.value)); }} />}
          </Field>
          <p className="hint">{t('settings.lock.summary', { minutes: lock })}</p>
          <Field label={t('settings.theme.label')}>
            {(id) => (
              <select id={id} value={theme} onChange={(e) => { setTheme(e.target.value as SettingsData['theme']); }}>
                <option value="system">{t('settings.theme.system')}</option>
                <option value="light">{t('settings.theme.light')}</option>
                <option value="dark">{t('settings.theme.dark')}</option>
              </select>
            )}
          </Field>
          <div className="check">
            <input id="autoclear" type="checkbox" checked={autoClear} onChange={(e) => { setAutoClear(e.target.checked); }} />
            <label htmlFor="autoclear">{t('settings.autoclear.label')}</label>
          </div>
          <Field label={t('settings.pins.label')} hint={t('settings.pins.hint')}>
            {(id, d) => <textarea id={id} aria-describedby={d} rows={3} spellCheck={false} value={pins} onChange={(e) => { setPins(e.target.value); }} />}
          </Field>
          <p className="hint">{t('settings.pins.count', { count: pins.split('\n').filter((line) => line.trim() !== '').length })}</p>
        </fieldset>
        <button type="submit" className="btn btn-primary">{t('settings.save')}</button>
      </form>
      <ScanPrivacySection />
      <section className="panel" aria-labelledby="settings-transfer-h">
        <h3 id="settings-transfer-h">{t('settings.exchange.title')}</h3>
        <p>{t('settings.exchange.description')}</p>
        <button type="button" className="btn" onClick={() => { setTransfer(exportSettingsExchange(s)); }}>{t('settings.exchange.export')}</button>
        {transfer !== undefined && <><QrFrame kind="device" text={transfer} caption={t('settings.exchange.title')} /><button type="button" className="btn" onClick={() => { setTransfer(undefined); }}>{t('settings.exchange.hide')}</button></>}
        <CameraImporter label={t('settings.exchange.import')} scopeKey={s} onInputChange={() => { setPreview(undefined); }} onText={(text, signal) => {
          const next = parseSettingsExchange(text);
          if (signal.aborted) return false;
          setPreview(next); setMessage(undefined); return true;
        }} />
        {preview !== undefined && <div>
          <h4>{t('settings.exchange.review')}</h4>
          <p>{t('settings.delay.range', { min: preview.delayMinSec, max: preview.delayMaxSec })}</p>
          <p>{t('settings.lock.summary', { minutes: preview.lockTimeoutMin })}</p>
          <p>{t('settings.theme.label')}: {t(preview.theme === 'dark' ? 'settings.theme.dark' : preview.theme === 'light' ? 'settings.theme.light' : 'settings.theme.system')}</p>
          <p>{t('settings.autoclear.label')}: {t(preview.autoClearFragment ? 'settings.exchange.yes' : 'settings.exchange.no')}</p>
          <button type="button" className="btn" onClick={() => {
            const next = applySettingsExchange(app.settings, preview);
            const saved = app.updateSettings(next);
            setMinSec(next.delayMinSec); setMaxSec(next.delayMaxSec); setLock(next.lockTimeoutMin); setTheme(next.theme); setAutoClear(next.autoClearFragment);
            setPreview(undefined); setMessage(saved ? { kind: 'ok', text: t('settings.saved') } : { kind: 'warn', text: t('settings.storageUnavailable') });
          }}>{t('settings.exchange.apply')}</button>
          <button type="button" className="btn" onClick={() => { setPreview(undefined); }}>{t('settings.exchange.discard')}</button>
        </div>}
      </section>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}

/** Spec 10 / 05 options. Own storage key and own save, so the main settings form and its exchange format are unchanged. */
function ScanPrivacySection(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [cfg, setCfg] = useState<ScanPrivacySettings>(() => loadScanPrivacy(browserStorage()));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | undefined>(undefined);
  const set = (patch: Partial<ScanPrivacySettings>): void => { setCfg((c) => ({ ...c, ...patch })); setMessage(undefined); };
  const num = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));

  const onSave = (e: FormEvent): void => {
    e.preventDefault();
    try {
      const endpoints: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.endpoints)) if (v.trim() !== '') endpoints[k] = checkScanEndpoint(v, cfg.transport);
      const indexerUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.indexerUrls)) if (v.trim() !== '') indexerUrls[k] = checkIndexerUrl(v, cfg.transport);
      const ok = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;
      if (!ok(cfg.windowBlocks, 0, 100_000)) throw new Error(t('settings.scanPrivacy.errWindow'));
      if (!ok(cfg.jitterMinMs, 0, 10_000) || !ok(cfg.jitterMaxMs, 0, 10_000) || cfg.jitterMinMs > cfg.jitterMaxMs) throw new Error(t('settings.scanPrivacy.errDelays'));
      if (!ok(cfg.openLaneBudget, 1, 100_000)) throw new Error(t('settings.scanPrivacy.errBudget'));
      const next = { ...cfg, endpoints, indexerUrls };
      setCfg(next);
      setMessage(saveScanPrivacy(browserStorage(), next) ? { kind: 'ok', text: t('settings.scanPrivacy.saved') } : { kind: 'warn', text: t('settings.scanPrivacy.refused') });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error && !(err.name === 'ChainAdapterError') ? err.message : userMessage(err) });
    }
  };

  return (
    <form onSubmit={onSave} className="stack" noValidate>
      <fieldset>
        <legend>{t('settings.scanPrivacy.legend')}</legend>
        <p className="hint">
          {t('settings.scanPrivacy.hint')}
        </p>
        <Field label={t('settings.scanPrivacy.transport')}>
          {(id) => (
            <select id={id} value={cfg.transport} onChange={(e) => { set({ transport: e.target.value as ScanTransportKind }); }}>
              <option value="direct">{t('settings.scanPrivacy.transportDirect')}</option>
              <option value="tor-browser">{t('settings.scanPrivacy.transportTor')}</option>
              <option value="local-proxy">{t('settings.scanPrivacy.transportProxy')}</option>
            </select>
          )}
        </Field>
        <div className="check">
          <input id="scan-require-proxy" type="checkbox" checked={cfg.requireProxy} onChange={(e) => { set({ requireProxy: e.target.checked }); }} />
          <label htmlFor="scan-require-proxy">{t('settings.scanPrivacy.requireProxy')}</label>
        </div>
        {services.chains.map((c) => (
          <Field key={c.chainId} label={t('settings.scanPrivacy.endpoint', { chain: c.name })} hint={cfg.transport === 'local-proxy' ? t('settings.scanPrivacy.endpointRequired') : t('settings.scanPrivacy.endpointOptional')}>
            {(id, d) => <input id={id} aria-describedby={d} type="url" spellCheck={false} value={cfg.endpoints[String(c.chainId)] ?? ''} onChange={(e) => { set({ endpoints: { ...cfg.endpoints, [String(c.chainId)]: e.target.value } }); }} />}
          </Field>
        ))}
        <Field label={t('settings.scanPrivacy.source')}>
          {(id) => (
            <select id={id} value={cfg.source} onChange={(e) => { set({ source: e.target.value === 'indexer' ? 'indexer' : 'rpc' }); }}>
              <option value="rpc">{t('settings.scanPrivacy.sourceRpc')}</option>
              <option value="indexer">{t('settings.scanPrivacy.sourceIndexer')}</option>
            </select>
          )}
        </Field>
        {cfg.source === 'indexer' && services.chains.map((c) => (
          <Field key={c.chainId} label={t('settings.scanPrivacy.indexerUrl', { chain: c.name })}>
            {(id) => <input id={id} type="url" spellCheck={false} value={cfg.indexerUrls[String(c.chainId)] ?? ''} onChange={(e) => { set({ indexerUrls: { ...cfg.indexerUrls, [String(c.chainId)]: e.target.value } }); }} />}
          </Field>
        ))}
        <Field label={t('settings.scanPrivacy.window')} hint={t('settings.scanPrivacy.windowHint')}>
          {(id, d) => <input id={id} aria-describedby={d} type="number" min={0} value={Number.isNaN(cfg.windowBlocks) ? '' : cfg.windowBlocks} onChange={(e) => { set({ windowBlocks: num(e.target.value) }); }} />}
        </Field>
        <Field label={t('settings.scanPrivacy.jitterMin')}>{(id) => <input id={id} type="number" min={0} value={Number.isNaN(cfg.jitterMinMs) ? '' : cfg.jitterMinMs} onChange={(e) => { set({ jitterMinMs: num(e.target.value) }); }} />}</Field>
        <Field label={t('settings.scanPrivacy.jitterMax')}>{(id) => <input id={id} type="number" min={0} value={Number.isNaN(cfg.jitterMaxMs) ? '' : cfg.jitterMaxMs} onChange={(e) => { set({ jitterMaxMs: num(e.target.value) }); }} />}</Field>
        <Field label={t('settings.scanPrivacy.budget')} hint={t('settings.scanPrivacy.budgetHint')}>
          {(id, d) => <input id={id} aria-describedby={d} type="number" min={1} value={Number.isNaN(cfg.openLaneBudget) ? '' : cfg.openLaneBudget} onChange={(e) => { set({ openLaneBudget: num(e.target.value) }); }} />}
        </Field>
        <h4>{t('settings.scanPrivacy.learnsHeading')}</h4>
        <ul>
          {describeScanDisclosure(cfg, { hasSecondary: Object.values(app.settings.rpcUrlsSecondary).some((u) => u !== '') }).map((row) => (
            <li key={row.party}><strong>{row.party}:</strong> {row.learns}</li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="btn" onClick={() => { set(applyParanoidPreset(cfg)); }}>{t('settings.scanPrivacy.paranoid')}</button>
          <button type="submit" className="btn btn-primary">{t('settings.scanPrivacy.save')}</button>
        </div>
        {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
      </fieldset>
    </form>
  );
}
