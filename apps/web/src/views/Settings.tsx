import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CameraImporter } from '../components/CameraImporter';
import { QrFrame } from '../components/QrFrame';
import {
  applySettingsExchange, buildSettingsExport, DEFAULT_EXPORT_SECTIONS, defaultExchangeSelection, EXCHANGE_SECTIONS, exportSectionAvailable,
  exportSettingsExchange, needsTrustConfirmation, parseSettingsExchange, previewSettingsExchange, selectionChangesSomething, weakensPreferences,
  type ExchangeSection, type SettingsExchangePreview, type SettingsExchangeSelection, type SharedSettings,
} from '../lib/settingsExchange';
import { shortHex } from '../lib/format';
import type { MessageKey } from '../i18n/sourceCatalog';
import { Field, Notice } from '../components/Common';
import { displayMessage, captureUserMessage, type DisplayMessage, UserFacingError } from '../lib/errors';
import { checkDelayRange, checkRelayerUrl, checkRpcUrl, type Settings as SettingsData } from '../lib/settings';
import { applyParanoidPreset, browserStorage, checkIndexerUrl, checkScanEndpoint, describeScanDisclosureMessages, loadScanPrivacy, saveScanPrivacy, type ScanPrivacySettings, type ScanTransportKind } from '../lib/scanPrivacy';
import { MAX_FLOOD_PER_BLOCK, PRIVACY_TRANSFER_WINDOW_BLOCKS, loadScanLanes, saveScanLanes, type ScanLaneSettings } from '../lib/scanSpam';
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
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: DisplayMessage } | undefined>(undefined);
  const [checks, setChecks] = useState<Record<string, DisplayMessage>>({});
  const testRevision = useRef(new Map<number, number>());
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const invalidateTest = (chainId: number): void => {
    testRevision.current.set(chainId, (testRevision.current.get(chainId) ?? 0) + 1);
    setChecks((current) => { const next = { ...current }; delete next[chainId]; return next; });
  };

  // A saved-settings change invalidates pending RPC tests (the exchange section resets its own review and export).
  useEffect(() => {
    for (const [chainId, revision] of testRevision.current) testRevision.current.set(chainId, revision + 1);
    setChecks({});
  }, [s]);

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
        setMessage({ kind: 'error', text: { key: 'settings.error.pins' } });
        return;
      }
      const next: SettingsData = { rpcUrls, rpcUrlsSecondary, relayerUrl: checkRelayerUrl(relayer), delayMinSec: minSec, delayMaxSec: maxSec, lockTimeoutMin: lock, theme, autoClearFragment: autoClear, pinnedSigners };
      const saved = app.updateSettings(next);
      setMessage(saved ? { kind: 'ok', text: { key: 'settings.saved' } } : { kind: 'warn', text: { key: 'settings.storageUnavailable' } });
      app.announce(t('settings.announce'));
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error && err.message === 'lock' ? { key: 'settings.error.lock' } : captureUserMessage(err) });
    }
  };

  const onTest = (chainId: number): void => {
    const chain = services.chains.find((c) => c.chainId === chainId);
    const url = rpc[String(chainId)] ?? '';
    if (chain === undefined) return;
    const revision = (testRevision.current.get(chainId) ?? 0) + 1;
    testRevision.current.set(chainId, revision);
    const current = (): boolean => mounted.current && testRevision.current.get(chainId) === revision;
    setChecks((c) => ({ ...c, [chainId]: { key: 'settings.rpc.checking' } }));
    void (async () => {
      try {
        await services.createRpc(chain, checkRpcUrl(url));
        if (current()) setChecks((c) => ({ ...c, [chainId]: { key: 'settings.rpc.connected' } }));
      } catch (err) {
        if (current()) setChecks((c) => ({ ...c, [chainId]: err instanceof Error && err.name === 'ChainAdapterError' ? { key: 'settings.rpc.failed' } : captureUserMessage(err) }));
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
              <Field label={t('settings.rpc.url', { chain: c.name })} help={{ label: t('help.about', { control: t('settings.rpc.url', { chain: c.name }) }), text: t('help.rpc') }}>
                {(id, describedBy) => <input id={id} aria-describedby={describedBy} type="url" dir="ltr" spellCheck={false} value={rpc[String(c.chainId)] ?? ''} onChange={(e) => { invalidateTest(c.chainId); setRpc({ ...rpc, [String(c.chainId)]: e.target.value }); }} />}
              </Field>
              <button type="button" className="btn" onClick={() => { onTest(c.chainId); }}>{t('settings.rpc.test', { chain: c.name })}</button>
              <p role="status" className="hint">{displayMessage(checks[c.chainId] ?? '', t)}</p>
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
          <Field label={t('settings.lock.idleLabel')} hint={t('settings.lock.keysHint')}>
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
      <SettingsExchangeSection onApplied={(next, applied) => {
        // Only the form fields of applied sections follow the import; other unsaved edits stay as typed.
        if (applied.preferences === true) { setMinSec(next.delayMinSec); setMaxSec(next.delayMaxSec); setLock(next.lockTimeoutMin); setTheme(next.theme); setAutoClear(next.autoClearFragment); }
        if (applied.rpcUrls === true) setRpc({ ...next.rpcUrls });
        if (applied.rpcUrlsSecondary === true) setRpc2({ ...next.rpcUrlsSecondary });
        if (applied.relayerUrl === true) setRelayer(next.relayerUrl);
        if ((applied.addSigners ?? []).length > 0 || applied.removeSigners === true) setPins(next.pinnedSigners.join('\n'));
        setMessage(undefined);
      }} />
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
    </section>
  );
}

// i18n-use: settings.exchange.section.preferences settings.exchange.section.rpcUrls settings.exchange.section.rpcUrlsSecondary settings.exchange.section.relayerUrl settings.exchange.section.pinnedSigners settings.exchange.yes settings.exchange.no
const SECTION_LABEL: Readonly<Record<ExchangeSection, MessageKey>> = {
  preferences: 'settings.exchange.section.preferences',
  rpcUrls: 'settings.exchange.section.rpcUrls',
  rpcUrlsSecondary: 'settings.exchange.section.rpcUrlsSecondary',
  relayerUrl: 'settings.exchange.section.relayerUrl',
  pinnedSigners: 'settings.exchange.section.pinnedSigners',
};
const THEME_LABEL: Readonly<Record<SettingsData['theme'], MessageKey>> = { system: 'settings.theme.system', light: 'settings.theme.light', dark: 'settings.theme.dark' };
const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return url; } };
const fingerprint = (key: string): string => shortHex(key, 10, 8);

/**
 * My-devices transfer. Export: explicit section checklist (preferences preselected) with an exact listing of the
 * payload. Import: parse, per-section current-vs-imported review with endpoint and trust sections unticked, a second
 * confirmation for relayer and signer changes, then one validated save. Scanning alone never applies anything, and
 * no imported endpoint is contacted while reviewing.
 */
function SettingsExchangeSection({ onApplied }: { readonly onApplied: (next: SettingsData, applied: SettingsExchangeSelection) => void }): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const s = app.settings;
  const uid = useId();
  const chainIds = useMemo(() => services.chains.map((c) => c.chainId), [services.chains]);
  const chainLabel = (chainId: string): string => services.chains.find((c) => String(c.chainId) === chainId)?.name ?? chainId;
  const [sections, setSections] = useState<readonly ExchangeSection[]>(DEFAULT_EXPORT_SECTIONS);
  const [transfer, setTransfer] = useState<string | undefined>();
  const [exportError, setExportError] = useState<DisplayMessage | undefined>();
  const [preview, setPreview] = useState<SettingsExchangePreview | undefined>();
  const [selection, setSelection] = useState<SettingsExchangeSelection>({});
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: DisplayMessage } | undefined>(undefined);

  // A saved-settings change invalidates both an imported review and an already displayed export.
  useEffect(() => { setPreview(undefined); setTransfer(undefined); setExportError(undefined); setConfirming(false); }, [s, chainIds]);

  const prefsValue = (p: SharedSettings): string => t('settings.exchange.prefsValue', {
    min: p.delayMinSec, max: p.delayMaxSec, minutes: p.lockTimeoutMin, theme: t(THEME_LABEL[p.theme]),
    autoclear: t(p.autoClearFragment ? 'settings.exchange.yes' : 'settings.exchange.no'),
  });
  const relayerValue = (url: string): string => (url === '' ? t('settings.exchange.none') : url);
  const included = buildSettingsExport(s, sections, chainIds);
  const listing: string[] = [];
  const item = (section: ExchangeSection, value: string): void => { listing.push(t('settings.exchange.item', { label: t(SECTION_LABEL[section]), value })); };
  if (included.preferences !== undefined) item('preferences', prefsValue(included.preferences));
  for (const section of ['rpcUrls', 'rpcUrlsSecondary'] as const) {
    for (const [chainId, url] of Object.entries(included[section] ?? {})) item(section, t('settings.exchange.chainHost', { chain: chainLabel(chainId), chainId, host: hostOf(url) }));
  }
  if (included.relayerUrl !== undefined) item('relayerUrl', included.relayerUrl === '' ? t('settings.exchange.noRelayer') : hostOf(included.relayerUrl));
  for (const key of included.pinnedSigners ?? []) item('pinnedSigners', fingerprint(key));
  const endpointsIncluded = included.rpcUrls !== undefined || included.rpcUrlsSecondary !== undefined || (included.relayerUrl ?? '') !== '';

  const toggleSection = (section: ExchangeSection, on: boolean): void => {
    setSections((current) => (on ? [...current.filter((x) => x !== section), section] : current.filter((x) => x !== section)));
    setTransfer(undefined); setExportError(undefined);
  };
  const onExport = (): void => {
    try { setTransfer(exportSettingsExchange(s, sections, chainIds)); setExportError(undefined); }
    catch (err) { setTransfer(undefined); setExportError(captureUserMessage(err)); }
  };

  const select = (patch: SettingsExchangeSelection): void => { setSelection((current) => ({ ...current, ...patch })); setConfirming(false); };
  const discard = (): void => { setPreview(undefined); setConfirming(false); };
  const doApply = (): void => {
    if (preview === undefined) return;
    let next: SettingsData;
    let saved: boolean;
    // Validate everything first, then one save call; any failure leaves settings and form fields untouched.
    try {
      next = applySettingsExchange(app.settings, preview, selection);
      saved = app.updateSettings(next);
    } catch (err) {
      setConfirming(false);
      setMessage({ kind: 'error', text: err instanceof UserFacingError ? captureUserMessage(err) : { key: 'settings.exchange.applyFailed' } });
      return;
    }
    onApplied(next, selection);
    setPreview(undefined); setConfirming(false);
    setMessage(saved ? { kind: 'ok', text: { key: 'settings.saved' } } : { kind: 'warn', text: { key: 'settings.storageUnavailable' } });
  };
  const onApply = (): void => {
    if (preview !== undefined && needsTrustConfirmation(preview, selection) && !confirming) { setConfirming(true); return; }
    doApply();
  };

  const sectionToggle = (section: 'preferences' | 'rpcUrls' | 'rpcUrlsSecondary' | 'relayerUrl'): ReactNode => (
    <div className="check">
      <input id={`${uid}-apply-${section}`} type="checkbox" checked={selection[section] === true} onChange={(e) => { select({ [section]: e.target.checked }); }} />
      <label htmlFor={`${uid}-apply-${section}`}>{t('settings.exchange.applySection', { section: t(SECTION_LABEL[section]) })}</label>
    </div>
  );
  const unchanged = <p className="hint">{t('settings.exchange.unchanged')}</p>;
  const table = (rows: readonly { readonly key: string; readonly label: string; readonly current: string; readonly incoming: string; readonly changed: boolean }[]): ReactNode => (
    <table>
      <thead><tr><th scope="col">{t('settings.exchange.column.setting')}</th><th scope="col">{t('settings.exchange.column.current')}</th><th scope="col">{t('settings.exchange.column.incoming')}</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.key}><th scope="row">{r.label}</th><td dir="ltr">{r.current}</td><td dir="ltr">{r.incoming}{!r.changed && <> ({t('settings.exchange.unchanged')})</>}</td></tr>
      ))}</tbody>
    </table>
  );
  const mapSection = (section: 'rpcUrls' | 'rpcUrlsSecondary'): ReactNode => {
    const diff = preview?.[section];
    if (diff === undefined) return null;
    return (
      <fieldset key={section}>
        <legend>{t(SECTION_LABEL[section])}</legend>
        {table(diff.entries.map((e) => ({ key: e.chainId, label: t('settings.exchange.chainHost', { chain: chainLabel(e.chainId), chainId: e.chainId, host: hostOf(e.incoming) }),
          current: e.current ?? t('settings.exchange.none'), incoming: e.incoming, changed: e.changed })))}
        <p className="hint">{t('settings.exchange.rpcMergeHint')}</p>
        {diff.changed ? sectionToggle(section) : unchanged}
      </fieldset>
    );
  };
  const signers = preview?.pinnedSigners;
  const adds = selection.addSigners ?? [];
  const canApply = preview !== undefined && selectionChangesSomething(preview, selection);

  return (
    <section className="panel" aria-labelledby="settings-transfer-h">
      <h3 id="settings-transfer-h">{t('settings.exchange.title')}</h3>
      <p>{t('settings.exchange.description')}</p>
      <fieldset>
        <legend>{t('settings.exchange.exportLegend')}</legend>
        <p className="hint">{t('settings.exchange.exportHint')}</p>
        {EXCHANGE_SECTIONS.map((section) => {
          const available = exportSectionAvailable(s, section, chainIds);
          const id = `${uid}-export-${section}`;
          return (
            <div className="check" key={section}>
              <input id={id} type="checkbox" disabled={!available} checked={available && sections.includes(section)} aria-describedby={available ? undefined : `${id}-empty`} onChange={(e) => { toggleSection(section, e.target.checked); }} />
              <label htmlFor={id}>{t(SECTION_LABEL[section])}</label>
              {!available && <span id={`${id}-empty`} className="hint"> {t('settings.exchange.nothingSaved')}</span>}
            </div>
          );
        })}
        <h4>{t('settings.exchange.includedHeading')}</h4>
        {listing.length === 0 ? <p>{t('settings.exchange.includedNothing')}</p> : <ul aria-label={t('settings.exchange.includedHeading')}>{listing.map((line, i) => <li key={i} dir="auto">{line}</li>)}</ul>}
        {endpointsIncluded && <Notice kind="warn">{t('settings.exchange.privacyWarning')}</Notice>}
        <button type="button" className="btn" disabled={listing.length === 0} onClick={onExport}>{t('settings.exchange.export')}</button>
        {exportError !== undefined && <Notice kind="error">{displayMessage(exportError, t)}</Notice>}
      </fieldset>
      {transfer !== undefined && <><QrFrame kind="device" text={transfer} caption={t('settings.exchange.title')} allowExport={!sections.some((x) => x === 'rpcUrls' || x === 'rpcUrlsSecondary' || x === 'relayerUrl')} /><button type="button" className="btn" onClick={() => { setTransfer(undefined); }}>{t('settings.exchange.hide')}</button></>}
      <CameraImporter label={t('settings.exchange.import')} scopeKey={s} onInputChange={discard} onText={(text, signal) => {
        const incoming = parseSettingsExchange(text, chainIds);
        if (signal.aborted) return false;
        const next = previewSettingsExchange(app.settings, incoming, chainIds);
        setPreview(next); setSelection(defaultExchangeSelection(next)); setConfirming(false); setMessage(undefined); return true;
      }} />
      {preview !== undefined && <div>
        <h4>{t('settings.exchange.review')}</h4>
        <p className="hint">{t('settings.exchange.reviewHint')}</p>
        {!preview.changed && <p role="status">{t('settings.exchange.noChanges')}</p>}
        {preview.preferences !== undefined && <fieldset>
          <legend>{t(SECTION_LABEL.preferences)}</legend>
          {table([{ key: 'preferences', label: t(SECTION_LABEL.preferences), current: prefsValue(preview.preferences.current), incoming: prefsValue(preview.preferences.incoming), changed: preview.preferences.changed }])}
          {preview.preferences.changed ? sectionToggle('preferences') : unchanged}
        </fieldset>}
        {mapSection('rpcUrls')}
        {mapSection('rpcUrlsSecondary')}
        {preview.relayerUrl !== undefined && <fieldset>
          <legend>{t(SECTION_LABEL.relayerUrl)}</legend>
          {table([{ key: 'relayer', label: t(SECTION_LABEL.relayerUrl), current: relayerValue(preview.relayerUrl.current), incoming: relayerValue(preview.relayerUrl.incoming), changed: preview.relayerUrl.changed }])}
          <p className="hint">{t('settings.exchange.relayerTrustHint')}</p>
          {preview.relayerUrl.changed ? sectionToggle('relayerUrl') : unchanged}
        </fieldset>}
        {signers !== undefined && <fieldset>
          <legend>{t(SECTION_LABEL.pinnedSigners)}</legend>
          <p className="hint">{t('settings.exchange.signersTrustHint')}</p>
          <p>{t('settings.exchange.signersUnchanged', { count: signers.unchanged })}</p>
          {signers.added.map((key) => (
            <div className="check" key={key}>
              <input id={`${uid}-pin-${key}`} type="checkbox" checked={adds.includes(key)} onChange={(e) => { select({ addSigners: e.target.checked ? [...adds, key] : adds.filter((k) => k !== key) }); }} />
              <label htmlFor={`${uid}-pin-${key}`} title={key}>{t('settings.exchange.signerAdd', { fingerprint: fingerprint(key) })}</label>
            </div>
          ))}
          {signers.removed.length > 0 && <>
            <ul>{signers.removed.map((key) => <li key={key} title={key}>{t('settings.exchange.signerRemoved', { fingerprint: fingerprint(key) })}</li>)}</ul>
            <div className="check">
              <input id={`${uid}-unpin`} type="checkbox" checked={selection.removeSigners === true} onChange={(e) => { select({ removeSigners: e.target.checked }); }} />
              <label htmlFor={`${uid}-unpin`}>{t('settings.exchange.signersRemove', { count: signers.removed.length })}</label>
            </div>
          </>}
          {!signers.changed && unchanged}
        </fieldset>}
        {confirming && <div role="alertdialog" aria-labelledby={`${uid}-confirm-h`} aria-describedby={`${uid}-confirm-d`} className="panel">
          <h4 id={`${uid}-confirm-h`}>{t('settings.exchange.confirmTitle')}</h4>
          <p id={`${uid}-confirm-d`}>{t('settings.exchange.confirmBody')}</p>
          <ul>
            {(['rpcUrls', 'rpcUrlsSecondary'] as const).flatMap((section) => selection[section] === true ? (preview[section]?.entries ?? []).filter((e) => e.changed).map((e) => (
              <li key={`${section}-${e.chainId}`} dir="auto">{t('settings.exchange.confirmRpc', { section: t(SECTION_LABEL[section]), chain: chainLabel(e.chainId), chainId: e.chainId, from: e.current === undefined ? t('settings.exchange.none') : hostOf(e.current), to: hostOf(e.incoming) })}</li>
            )) : [])}
            {selection.preferences === true && weakensPreferences(preview.preferences) && preview.preferences !== undefined && <li>{t('settings.exchange.confirmWeaker', { value: prefsValue(preview.preferences.incoming) })}</li>}
            {selection.relayerUrl === true && preview.relayerUrl?.changed === true && <li dir="auto">{t('settings.exchange.confirmRelayer', { from: relayerValue(preview.relayerUrl.current), to: relayerValue(preview.relayerUrl.incoming) })}</li>}
            {adds.map((key) => <li key={`add-${key}`} title={key}>{t('settings.exchange.confirmPin', { fingerprint: fingerprint(key) })}</li>)}
            {selection.removeSigners === true && (signers?.removed ?? []).map((key) => <li key={`rm-${key}`} title={key}>{t('settings.exchange.confirmUnpin', { fingerprint: fingerprint(key) })}</li>)}
          </ul>
          <button type="button" className="btn btn-primary" onClick={doApply}>{t('settings.exchange.confirm')}</button>
          <button type="button" className="btn" onClick={() => { setConfirming(false); }}>{t('settings.exchange.back')}</button>
        </div>}
        {preview.changed && !confirming && <>
          <button type="button" className="btn" disabled={!canApply} aria-describedby={canApply ? undefined : `${uid}-apply-hint`} onClick={onApply}>{t('settings.exchange.apply')}</button>
          {!canApply && <p id={`${uid}-apply-hint`} className="hint">{t('settings.exchange.selectSomething')}</p>}
        </>}
        <button type="button" className="btn" onClick={discard}>{t('settings.exchange.discard')}</button>
      </div>}
      {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
    </section>
  );
}

/** Spec 10 / 05 options. Own storage key and own save, so the main settings form and its exchange format are unchanged. */
// i18n-use: settings.scanLanes.errFlood
function ScanPrivacySection(): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  const [cfg, setCfg] = useState<ScanPrivacySettings>(() => loadScanPrivacy(browserStorage()));
  // Spec 05 lane and privacy-set options: own key, saved by the same button.
  const [lanes, setLanes] = useState<ScanLaneSettings>(() => loadScanLanes(browserStorage()));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: DisplayMessage } | undefined>(undefined);
  const set = (patch: Partial<ScanPrivacySettings>): void => { setCfg((c) => ({ ...c, ...patch })); setMessage(undefined); };
  const setLane = (patch: Partial<ScanLaneSettings>): void => { setLanes((c) => ({ ...c, ...patch })); setMessage(undefined); };
  const num = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));

  const onSave = (e: FormEvent): void => {
    e.preventDefault();
    try {
      const endpoints: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.endpoints)) if (v.trim() !== '') endpoints[k] = checkScanEndpoint(v, cfg.transport);
      const indexerUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.indexerUrls)) if (v.trim() !== '') indexerUrls[k] = checkIndexerUrl(v, cfg.transport);
      const ok = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;
      if (!ok(cfg.windowBlocks, 0, 100_000)) throw new UserFacingError({ key: 'settings.scanPrivacy.errWindow' });
      if (!ok(cfg.jitterMinMs, 0, 10_000) || !ok(cfg.jitterMaxMs, 0, 10_000) || cfg.jitterMinMs > cfg.jitterMaxMs) throw new UserFacingError({ key: 'settings.scanPrivacy.errDelays' });
      if (!ok(cfg.openLaneBudget, 1, 100_000)) throw new UserFacingError({ key: 'settings.scanPrivacy.errBudget' });
      if (!ok(lanes.floodPerBlock, 1, MAX_FLOOD_PER_BLOCK)) throw new UserFacingError({ key: 'settings.scanLanes.errFlood' });
      const next = { ...cfg, endpoints, indexerUrls };
      setCfg(next);
      const saved = saveScanPrivacy(browserStorage(), next) && saveScanLanes(browserStorage(), lanes);
      setMessage(saved ? { kind: 'ok', text: { key: 'settings.scanPrivacy.saved' } } : { kind: 'warn', text: { key: 'settings.scanPrivacy.refused' } });
    } catch (err) {
      setMessage({ kind: 'error', text: captureUserMessage(err) });
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
        <Field label={t('settings.scanLanes.flood')} hint={t('settings.scanLanes.floodHint')}>
          {(id, d) => <input id={id} aria-describedby={d} type="number" min={1} max={MAX_FLOOD_PER_BLOCK} value={Number.isNaN(lanes.floodPerBlock) ? '' : lanes.floodPerBlock} onChange={(e) => { setLane({ floodPerBlock: num(e.target.value) }); }} />}
        </Field>
        <div className="check">
          <input id="scan-spam-score" type="checkbox" checked={lanes.spamScoring} onChange={(e) => { setLane({ spamScoring: e.target.checked }); }} />
          <label htmlFor="scan-spam-score">{t('settings.scanLanes.score')}</label>
        </div>
        <div className="check">
          <input id="scan-privacy-transfers" type="checkbox" checked={lanes.privacySetTransfers} onChange={(e) => { setLane({ privacySetTransfers: e.target.checked }); }} />
          <label htmlFor="scan-privacy-transfers">{t('settings.scanLanes.transfers')}</label>
        </div>
        <p className="hint">{t('settings.scanLanes.transfersHint', { blocks: String(PRIVACY_TRANSFER_WINDOW_BLOCKS) })}</p>
        <h3>{t('settings.scanPrivacy.learnsHeading')}</h3>
        <ul>
          {describeScanDisclosureMessages(cfg, { hasSecondary: Object.values(app.settings.rpcUrlsSecondary).some((u) => u !== '') }).map((row) => (
            <li key={row.party.key}><strong>{displayMessage(row.party, t)}:</strong> {displayMessage(row.learns, t)}</li>
          ))}
          {lanes.privacySetTransfers && <li><strong>{t('scanPrivacy.disclosure.rpcParty')}:</strong> {t('scanLanes.disclosure.transfers', { blocks: String(PRIVACY_TRANSFER_WINDOW_BLOCKS) })}</li>}
        </ul>
        <div className="actions">
          <button type="button" className="btn" onClick={() => { set(applyParanoidPreset(cfg)); }}>{t('settings.scanPrivacy.paranoid')}</button>
          <button type="submit" className="btn btn-primary">{t('settings.scanPrivacy.save')}</button>
        </div>
        {message !== undefined && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
      </fieldset>
    </form>
  );
}
