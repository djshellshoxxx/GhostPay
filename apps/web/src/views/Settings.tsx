import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref, type ReactNode } from 'react';
import { SettingsLeaveGuard, useSettingsValidation } from './SettingsDraft';
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
import { MetadataRetentionControls } from '../components/MetadataRetentionControls';
import { displayMessage, captureUserMessage, type DisplayMessage, UserFacingError } from '../lib/errors';
import { checkDelayRange, checkRelayerUrl, checkRpcUrl, INVOICE_LINK_CLIPBOARD_DELAYS_SEC, invoiceLinkClipboardDelay, type Settings as SettingsData } from '../lib/settings';
import { SCAN_PRIVACY_KEY, applyParanoidPreset, browserStorage, checkIndexerUrl, checkScanEndpoint, describeScanDisclosureMessages, loadScanPrivacy, saveScanPrivacy, type ScanPrivacySettings, type ScanTransportKind } from '../lib/scanPrivacy';
import { MAX_FLOOD_PER_BLOCK, PRIVACY_TRANSFER_WINDOW_BLOCKS, SCAN_LANES_KEY, loadScanLanes, saveScanLanes, type ScanLaneSettings } from '../lib/scanSpam';
import { useServices } from '../lib/services';
import { useApp } from '../state';
import { LanguagePicker } from '../i18n/LanguagePicker';
import { SOURCE_TRANSLATOR, useI18nOptional } from '../i18n/context';

/** `typed`, with each chain whose saved value went from `before` to `after` showing the new one. */
function followMap(typed: Readonly<Record<string, string>>, before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): Record<string, string> {
  const out = { ...typed };
  for (const chain of Object.keys({ ...before, ...after })) if (before[chain] !== after[chain]) out[chain] = after[chain] ?? '';
  return out;
}

function mapChanged(draft: Readonly<Record<string, string>>, saved: Readonly<Record<string, string>>): boolean {
  return Object.keys({ ...draft, ...saved }).some((key) => (draft[key] ?? '') !== (saved[key] ?? ''));
}

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
  const [lock, setLock] = useState(String(s.lockTimeoutMin));
  const [theme, setTheme] = useState<SettingsData['theme']>(s.theme);
  const [clipboardDelaySec, setClipboardDelaySec] = useState(s.invoiceLinkClipboardDelaySec);
  const [autoClear, setAutoClear] = useState(s.autoClearFragment);
  const [pins, setPins] = useState(s.pinnedSigners.join('\n'));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: DisplayMessage } | undefined>(undefined);
  const [checks, setChecks] = useState<Record<string, DisplayMessage>>({});
  const testRevision = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const validation = useSettingsValidation();
  const [saveRefused, setSaveRefused] = useState(false);
  // i18n-use: settings.unsaved settings.draft.clean settings.rpc.url settings.rpc.secondary.label settings.rpc.test settings.rpc.testSecondary settings.announce settings.storageUnavailable
  const dirty = saveRefused || mapChanged(rpc, s.rpcUrls) || mapChanged(rpc2, s.rpcUrlsSecondary)
    || relayer !== s.relayerUrl || minSec !== s.delayMinSec || maxSec !== s.delayMaxSec || lock !== String(s.lockTimeoutMin)
    || theme !== s.theme || clipboardDelaySec !== s.invoiceLinkClipboardDelaySec || autoClear !== s.autoClearFragment
    || pins !== s.pinnedSigners.join('\n');
  const [scanDirty, setScanDirty] = useState(false);
  const scanSave = useRef<() => boolean>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // The saved values this form last followed. Another tab's save is shown wherever it changed one, so that saving this
  // form cannot put the old value back; fields it did not change keep what was typed.
  const followed = useRef(s);
  useEffect(() => {
    const before = followed.current;
    if (before === s) return;
    followed.current = s;
    let changed = false;
    const follow = <K extends keyof SettingsData>(key: K, show: (value: SettingsData[K]) => void): void => {
      if (JSON.stringify(before[key]) === JSON.stringify(s[key])) return;
      changed = true;
      show(s[key]);
    };
    follow('rpcUrls', (to) => { setRpc((typed) => followMap(typed, before.rpcUrls, to)); });
    follow('rpcUrlsSecondary', (to) => { setRpc2((typed) => followMap(typed, before.rpcUrlsSecondary, to)); });
    follow('relayerUrl', setRelayer);
    follow('delayMinSec', setMinSec);
    follow('delayMaxSec', setMaxSec);
    follow('lockTimeoutMin', (minutes) => { setLock(String(minutes)); });
    follow('theme', setTheme);
    follow('invoiceLinkClipboardDelaySec', setClipboardDelaySec);
    follow('autoClearFragment', setAutoClear);
    follow('pinnedSigners', (to) => { setPins(to.join('\n')); });
    if (changed) setMessage({ kind: 'warn', text: { key: 'settings.changedElsewhere' } });
  }, [s]);

  const invalidateTest = (key: string): void => {
    testRevision.current.set(key, (testRevision.current.get(key) ?? 0) + 1);
    setChecks((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  // Imports and cross-tab saves can change an endpoint without an input change event.
  const lastUrls = useRef({ primary: rpc, secondary: rpc2 });
  useLayoutEffect(() => {
    for (const [kind, urls] of [['primary', rpc], ['secondary', rpc2]] as const) {
      const before = lastUrls.current[kind];
      for (const chainId of Object.keys({ ...before, ...urls })) {
        if ((before[chainId] ?? '') !== (urls[chainId] ?? '')) invalidateTest(`${kind}-${chainId}`);
      }
    }
    lastUrls.current = { primary: rpc, secondary: rpc2 };
  }, [rpc, rpc2]);

  const save = (): boolean => {
    let field = '';
    validation.clear();
    setMessage(undefined);
    try {
      const readUrls = (values: Record<string, string>, kind: string): Record<string, string> => {
        const urls: Record<string, string> = {};
        for (const [chainId, url] of Object.entries(values)) {
          if (url.trim() === '') continue;
          field = `${kind}-${chainId}`;
          urls[chainId] = checkRpcUrl(url);
        }
        return urls;
      };
      const rpcUrls = readUrls(rpc, 'primary');
      const rpcUrlsSecondary = readUrls(rpc2, 'secondary');
      field = 'relayer';
      const relayerUrl = checkRelayerUrl(relayer);
      field = !Number.isInteger(minSec) || minSec < 0 || minSec > 86400 ? 'minSec' : 'maxSec';
      checkDelayRange(minSec, maxSec);
      field = 'lock';
      const lockTimeoutMin = Number(lock);
      if (!Number.isInteger(lockTimeoutMin) || lockTimeoutMin < 1 || lockTimeoutMin > 240) throw new UserFacingError({ key: 'settings.error.lock' });
      const pinnedSigners = pins.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean);
      field = 'pins';
      if (pinnedSigners.some((pin) => !/^(?:02|03)[0-9a-f]{64}$/.test(pin))) throw new UserFacingError({ key: 'settings.error.pins' });
      field = '';
      const next: SettingsData = {
        rpcUrls, rpcUrlsSecondary, relayerUrl, delayMinSec: minSec, delayMaxSec: maxSec,
        lockTimeoutMin, theme, autoClearFragment: autoClear, invoiceLinkClipboardDelaySec: clipboardDelaySec, pinnedSigners,
      };
      const saved = app.updateSettings(next);
      followed.current = next;
      setRpc(rpcUrls);
      setRpc2(rpcUrlsSecondary);
      setRelayer(relayerUrl);
      setLock(String(lockTimeoutMin));
      setPins(pinnedSigners.join('\n'));
      setSaveRefused(!saved);
      setMessage(saved ? { kind: 'ok', text: { key: 'settings.saved' } } : { kind: 'warn', text: { key: 'settings.storageUnavailable' } });
      if (saved) app.announce(t('settings.announce'));
      return saved;
    } catch (err) {
      const text = captureUserMessage(err);
      if (field && validation.form.current?.elements.namedItem(field)) validation.reject(field, text);
      else setMessage({ kind: 'error', text });
      return false;
    }
  };

  const onTest = (chainId: number, kind: 'primary' | 'secondary'): void => {
    const chain = services.chains.find((c) => c.chainId === chainId);
    if (chain === undefined) return;
    const key = `${kind}-${chainId}`;
    const url = (kind === 'primary' ? rpc : rpc2)[chainId] ?? '';
    const revision = (testRevision.current.get(key) ?? 0) + 1;
    testRevision.current.set(key, revision);
    const current = (): boolean => mounted.current && testRevision.current.get(key) === revision;
    setChecks((c) => ({ ...c, [key]: { key: 'settings.rpc.checking' } }));
    void (async () => {
      try {
        await services.createRpc(chain, checkRpcUrl(url));
        if (current()) setChecks((c) => ({ ...c, [key]: { key: 'settings.rpc.connected' } }));
      } catch (err) {
        if (current()) setChecks((c) => ({ ...c, [key]: err instanceof Error && err.name === 'ChainAdapterError' ? { key: 'settings.rpc.failed' } : captureUserMessage(err) }));
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
      {/* #287 item 4: device-local, default-off preferences for closing on-screen previews; they save immediately. */}
      <MetadataRetentionControls manual={false} />
      <MetadataRetentionControls scope="proof" manual={false} />
      <form ref={validation.form} onSubmit={(e) => { e.preventDefault(); save(); }}
        onChange={() => { validation.clear(); setMessage((prior) => prior?.kind === 'ok' ? prior : undefined); }} className="stack" noValidate>
        <p className="hint" role="status">{t(dirty ? 'settings.unsaved' : 'settings.draft.clean')}</p>
        <fieldset>
          <legend>{t('settings.rpc.legend')}</legend>
          <p className="hint">{t('settings.rpc.hint')}</p>
          {services.chains.map((c) => (
            <div key={c.chainId} className="rpc-row">
              {(['primary', 'secondary'] as const).map((kind) => {
                const primary = kind === 'primary';
                const key = `${kind}-${c.chainId}`;
                const label = t(primary ? 'settings.rpc.url' : 'settings.rpc.secondary.label', { chain: c.name });
                return (
                  <Field key={kind} label={label} error={validation.fieldError(key)} {...(primary
                    ? { help: { label: t('help.about', { control: label }), text: t('help.rpc') } }
                    : { hint: t('settings.rpc.secondary.hint') })}>
                    {(id, d) => <input id={id} {...validation.control(key)} aria-describedby={d} type="url" dir="ltr" spellCheck={false}
                      value={(primary ? rpc : rpc2)[c.chainId] ?? ''} onChange={(e) => {
                        const value = e.target.value;
                        (primary ? setRpc : setRpc2)((urls) => ({ ...urls, [c.chainId]: value }));
                      }} />}
                  </Field>
                );
              })}
              {(['primary', 'secondary'] as const).map((kind) => {
                const label = t(kind === 'primary' ? 'settings.rpc.test' : 'settings.rpc.testSecondary', { chain: c.name });
                return (
                  <div key={kind} className="rpc-test-row">
                    <button type="button" className="btn" onClick={() => onTest(c.chainId, kind)}>{label}</button>
                    <p role="status" aria-label={label} className="hint">{displayMessage(checks[`${kind}-${c.chainId}`] ?? '', t)}</p>
                  </div>
                );
              })}
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>{t('settings.relayer.legend')}</legend>
          <Field error={validation.fieldError('relayer')} label={t('settings.relayer.label')} hint={t('settings.relayer.hint')}>
            {(id, d) => <input id={id} {...validation.control('relayer')} aria-describedby={d} type="url" spellCheck={false} value={relayer} onChange={(e) => { setRelayer(e.target.value); }} />}
          </Field>
        </fieldset>
        <fieldset>
          <legend>{t('settings.delay.legend')}</legend>
          <Field error={validation.fieldError('minSec')} label={t('settings.delay.min')}>{(id, d) => <input id={id} {...validation.control('minSec')} aria-describedby={d} type="number" min={0} value={minSec} onChange={(e) => { setMinSec(Number(e.target.value)); }} />}</Field>
          <Field error={validation.fieldError('maxSec')} label={t('settings.delay.max')}>{(id, d) => <input id={id} {...validation.control('maxSec')} aria-describedby={d} type="number" min={0} value={maxSec} onChange={(e) => { setMaxSec(Number(e.target.value)); }} />}</Field>
          <p className="hint">{t('settings.delay.range', { min: minSec, max: maxSec })}</p>
        </fieldset>
        <fieldset>
          <legend>{t('settings.safety.legend')}</legend>
          <Field error={validation.fieldError('lock')} label={t('settings.lock.idleLabel')} hint={t('settings.lock.keysHint')}>
            {(id, d) => <input id={id} {...validation.control('lock')} aria-describedby={d} type="number" min={1} max={240} value={lock} onChange={(e) => { setLock(e.target.value); }} />}
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
          <Field label={t('settings.invoiceClipboard.label')} hint={t('settings.invoiceClipboard.hint')}>
            {(id, describedBy) => (
              <select id={id} aria-describedby={describedBy} value={clipboardDelaySec}
                onChange={(e) => { setClipboardDelaySec(invoiceLinkClipboardDelay(Number(e.target.value))); }}>
                <option value={0}>{t('settings.invoiceClipboard.off')}</option>
                {INVOICE_LINK_CLIPBOARD_DELAYS_SEC.map((seconds) => (
                  <option key={seconds} value={seconds}>{t('settings.invoiceClipboard.seconds', { seconds })}</option>
                ))}
              </select>
            )}
          </Field>
          <Field error={validation.fieldError('pins')} label={t('settings.pins.label')} hint={t('settings.pins.hint')}>
            {(id, d) => <textarea id={id} {...validation.control('pins')} aria-describedby={d} rows={3} spellCheck={false} value={pins} onChange={(e) => { setPins(e.target.value); }} />}
          </Field>
          <p className="hint">{t('settings.pins.count', { count: pins.split('\n').filter((line) => line.trim() !== '').length })}</p>
        </fieldset>
        <button type="submit" className="btn btn-primary">{t('settings.save')}</button>
        {message !== undefined && (message.kind !== 'ok' || !dirty) && <Notice kind={message.kind}>{displayMessage(message.text, t)}</Notice>}
      </form>
      <ScanPrivacySection saveRef={scanSave} onDirty={setScanDirty} />
      <SettingsLeaveGuard dirty={dirty || scanDirty} save={() => (!dirty || save()) && (!scanDirty || scanSave.current?.() === true)} />
      <SettingsExchangeSection onApplied={(next, applied, saved) => {
        validation.clear();
        setSaveRefused(!saved);
        // Only the form fields of applied sections follow the import; other unsaved edits stay as typed.
        followed.current = next;
        if (applied.preferences === true) { setMinSec(next.delayMinSec); setMaxSec(next.delayMaxSec); setLock(String(next.lockTimeoutMin)); setTheme(next.theme); setAutoClear(next.autoClearFragment); }
        if (applied.rpcUrls === true) setRpc({ ...next.rpcUrls });
        if (applied.rpcUrlsSecondary === true) setRpc2({ ...next.rpcUrlsSecondary });
        if (applied.relayerUrl === true) setRelayer(next.relayerUrl);
        if ((applied.addSigners ?? []).length > 0 || applied.removeSigners === true) setPins(next.pinnedSigners.join('\n'));
        setMessage(undefined);
      }} />
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
function SettingsExchangeSection({ onApplied }: { readonly onApplied: (next: SettingsData, applied: SettingsExchangeSelection, saved: boolean) => void }): ReactNode {
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
    onApplied(next, selection, saved);
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

/** Compare both raw storage records before writing, including when the storage event is still queued. */
function storedScanRecords() {
  const read = (key: string): string | null | undefined => { try { return browserStorage()?.getItem(key); } catch { return undefined; } };
  return { privacy: read(SCAN_PRIVACY_KEY), lanes: read(SCAN_LANES_KEY) };
}

function followValue<T>(draft: T, before: T, saved: T): T {
  return Object.is(before, saved) ? draft : saved;
}

function changedFields<T extends object>(draft: T, saved: T, except: readonly (keyof T)[] = []): boolean {
  const keys = Object.keys({ ...draft, ...saved }) as (keyof T)[];
  return keys.some((key) => !except.includes(key) && !Object.is(draft[key], saved[key]));
}

function sameScanRoute(a: ScanPrivacySettings, b: ScanPrivacySettings): boolean {
  return a.transport === b.transport && a.source === b.source && a.requireProxy === b.requireProxy;
}

function followScanPrivacy(draft: ScanPrivacySettings, before: ScanPrivacySettings, saved: ScanPrivacySettings): ScanPrivacySettings {
  if (before.unreadable || saved.unreadable) return saved;
  // Endpoints belong to their transport and source. Never copy a draft endpoint into a different route.
  const newEndpoints = mapChanged(before.endpoints, saved.endpoints) || mapChanged(before.indexerUrls, saved.indexerUrls);
  const useSavedRoute = !sameScanRoute(before, saved) || (!sameScanRoute(before, draft) && newEndpoints);
  const route = useSavedRoute ? saved : draft;
  const delayChanged = before.jitterMinMs !== saved.jitterMinMs || before.jitterMaxMs !== saved.jitterMaxMs;
  return {
    ...route,
    endpoints: useSavedRoute ? saved.endpoints : followMap(draft.endpoints, before.endpoints, saved.endpoints),
    indexerUrls: useSavedRoute ? saved.indexerUrls : followMap(draft.indexerUrls, before.indexerUrls, saved.indexerUrls),
    windowBlocks: followValue(draft.windowBlocks, before.windowBlocks, saved.windowBlocks),
    openLaneBudget: followValue(draft.openLaneBudget, before.openLaneBudget, saved.openLaneBudget),
    jitterMinMs: delayChanged ? saved.jitterMinMs : draft.jitterMinMs,
    jitterMaxMs: delayChanged ? saved.jitterMaxMs : draft.jitterMaxMs,
  };
}

function followScanLanes(draft: ScanLaneSettings, before: ScanLaneSettings, saved: ScanLaneSettings): ScanLaneSettings {
  if (before.unreadable || saved.unreadable) return saved;
  return {
    matchCover: followValue(draft.matchCover, before.matchCover, saved.matchCover),
    privacySetTransfers: followValue(draft.privacySetTransfers, before.privacySetTransfers, saved.privacySetTransfers),
    spamScoring: followValue(draft.spamScoring, before.spamScoring, saved.spamScoring),
    floodPerBlock: followValue(draft.floodPerBlock, before.floodPerBlock, saved.floodPerBlock),
  };
}

/** Spec 10 / 05 options. Own storage key and own save, so the main settings form and its exchange format are unchanged. */
// i18n-use: settings.scanLanes.errFlood
function ScanPrivacySection({ saveRef, onDirty }: {
  readonly saveRef: Ref<() => boolean>;
  readonly onDirty: (dirty: boolean) => void;
}): ReactNode {
  const app = useApp();
  const services = useServices();
  const i18n = useI18nOptional();
  const t = i18n?.t ?? SOURCE_TRANSLATOR.t;
  // What this form was filled from: saving over a newer save could undo a private path or cover lookups turned on there.
  const [initialRecords] = useState(storedScanRecords);
  const filledFrom = useRef(initialRecords);
  const reviewBeforeLeaving = useRef(false);
  const [cfg, setCfg] = useState<ScanPrivacySettings>(() => loadScanPrivacy(browserStorage()));
  // Spec 05 lane and privacy-set options: own key, saved by the same button.
  const [lanes, setLanes] = useState<ScanLaneSettings>(() => loadScanLanes(browserStorage()));
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: DisplayMessage } | undefined>(undefined);
  const baseline = useRef({ cfg, lanes });
  const [saveRefused, setSaveRefused] = useState(false);
  const dirty = saveRefused || mapChanged(cfg.endpoints, baseline.current.cfg.endpoints)
    || mapChanged(cfg.indexerUrls, baseline.current.cfg.indexerUrls)
    || changedFields(cfg, baseline.current.cfg, ['endpoints', 'indexerUrls'])
    || changedFields(lanes, baseline.current.lanes);
  useLayoutEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const validation = useSettingsValidation();
  const set = (patch: Partial<ScanPrivacySettings>): void => { setCfg((c) => ({ ...c, ...patch })); setMessage(undefined); };
  const setLane = (patch: Partial<ScanLaneSettings>): void => { setLanes((c) => ({ ...c, ...patch })); setMessage(undefined); };
  const num = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));

  const clearValidation = validation.clear;
  const refreshStored = useCallback((): boolean => {
    const records = storedScanRecords();
    const previous = filledFrom.current;
    if (records.privacy === previous.privacy && records.lanes === previous.lanes) return false;
    const stored = { cfg: loadScanPrivacy(browserStorage()), lanes: loadScanLanes(browserStorage()) };
    const before = baseline.current;
    filledFrom.current = records;
    baseline.current = stored;
    if (records.privacy !== previous.privacy) {
      setCfg((draft) => records.privacy == null ? stored.cfg : followScanPrivacy(draft, before.cfg, stored.cfg));
    }
    if (records.lanes !== previous.lanes) {
      setLanes((draft) => records.lanes == null ? stored.lanes : followScanLanes(draft, before.lanes, stored.lanes));
    }
    clearValidation();
    setSaveRefused(false);
    reviewBeforeLeaving.current = true;
    setMessage({ kind: 'warn', text: { key: 'settings.changedElsewhere' } });
    return true;
  }, [clearValidation]);

  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea !== null && event.storageArea !== browserStorage()) return;
      if (event.key === null || event.key === SCAN_PRIVACY_KEY || event.key === SCAN_LANES_KEY) refreshStored();
    };
    window.addEventListener('storage', onStorage);
    refreshStored();
    return () => { window.removeEventListener('storage', onStorage); };
  }, [refreshStored]);

  const save = (leaving = false): boolean => {
    const needsReview = refreshStored() || (leaving && reviewBeforeLeaving.current);
    reviewBeforeLeaving.current = false;
    if (needsReview) {
      setMessage({ kind: 'warn', text: { key: 'settings.changedElsewhere' } });
      return false;
    }
    validation.clear();
    setMessage(undefined);
    let field = '';
    try {
      const endpoints: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.endpoints)) {
        if (v.trim() === '') continue;
        field = `endpoint-${k}`;
        endpoints[k] = checkScanEndpoint(v, cfg.transport);
      }
      const indexerUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(cfg.indexerUrls)) {
        if (v.trim() === '') continue;
        field = `indexer-${k}`;
        indexerUrls[k] = checkIndexerUrl(v, cfg.transport);
      }
      const ok = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;
      field = 'window';
      if (!ok(cfg.windowBlocks, 0, 100_000)) throw new UserFacingError({ key: 'settings.scanPrivacy.errWindow' });
      field = !ok(cfg.jitterMinMs, 0, 10_000) ? 'jitterMin' : 'jitterMax';
      if (!ok(cfg.jitterMinMs, 0, 10_000) || !ok(cfg.jitterMaxMs, 0, 10_000) || cfg.jitterMinMs > cfg.jitterMaxMs) throw new UserFacingError({ key: 'settings.scanPrivacy.errDelays' });
      field = 'budget';
      if (!ok(cfg.openLaneBudget, 1, 100_000)) throw new UserFacingError({ key: 'settings.scanPrivacy.errBudget' });
      field = 'flood';
      if (!ok(lanes.floodPerBlock, 1, MAX_FLOOD_PER_BLOCK)) throw new UserFacingError({ key: 'settings.scanLanes.errFlood' });
      field = '';
      const next = { ...cfg, endpoints, indexerUrls };
      const savedPrivacy = saveScanPrivacy(browserStorage(), next);
      const saved = savedPrivacy && saveScanLanes(browserStorage(), lanes);
      // Preserve unsaved edits if only one of the two local writes succeeded.
      if (savedPrivacy) {
        baseline.current.cfg = loadScanPrivacy(browserStorage());
        setCfg(baseline.current.cfg);
      }
      if (saved) {
        baseline.current.lanes = loadScanLanes(browserStorage());
        setLanes(baseline.current.lanes);
      }
      setSaveRefused(!saved);
      filledFrom.current = storedScanRecords();
      setMessage(saved ? { kind: 'ok', text: { key: 'settings.scanPrivacy.saved' } } : { kind: 'warn', text: { key: 'settings.scanPrivacy.refused' } });
      return saved;
    } catch (err) {
      const text = captureUserMessage(err);
      if (field && validation.form.current?.elements.namedItem(field)) validation.reject(field, text);
      else setMessage({ kind: 'error', text });
      return false;
    }
  };
  useImperativeHandle(saveRef, () => () => save(true));

  return (
    <form ref={validation.form} onChange={() => { validation.clear(); reviewBeforeLeaving.current = false; }} onSubmit={(e) => { e.preventDefault(); save(); }} className="stack" noValidate>
      <fieldset>
        <legend>{t('settings.scanPrivacy.legend')}</legend>
        <p className="hint" role="status">{t(dirty ? 'settings.unsaved' : 'settings.draft.clean')}</p>
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
          <Field error={validation.fieldError(`endpoint-${c.chainId}`)} key={c.chainId} label={t('settings.scanPrivacy.endpoint', { chain: c.name })} hint={cfg.transport === 'local-proxy' ? t('settings.scanPrivacy.endpointRequired') : t('settings.scanPrivacy.endpointOptional')}>
            {(id, d) => <input id={id} {...validation.control(`endpoint-${c.chainId}`)} aria-describedby={d} type="url" spellCheck={false} value={cfg.endpoints[String(c.chainId)] ?? ''} onChange={(e) => { set({ endpoints: { ...cfg.endpoints, [String(c.chainId)]: e.target.value } }); }} />}
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
          <Field error={validation.fieldError(`indexer-${c.chainId}`)} key={c.chainId} label={t('settings.scanPrivacy.indexerUrl', { chain: c.name })}>
            {(id, d) => <input id={id} aria-describedby={d} {...validation.control(`indexer-${c.chainId}`)} type="url" spellCheck={false} value={cfg.indexerUrls[String(c.chainId)] ?? ''} onChange={(e) => { set({ indexerUrls: { ...cfg.indexerUrls, [String(c.chainId)]: e.target.value } }); }} />}
          </Field>
        ))}
        <Field error={validation.fieldError('window')} label={t('settings.scanPrivacy.window')} hint={t('settings.scanPrivacy.windowHint')}>
          {(id, d) => <input id={id} {...validation.control('window')} aria-describedby={d} type="number" min={0} value={Number.isNaN(cfg.windowBlocks) ? '' : cfg.windowBlocks} onChange={(e) => { set({ windowBlocks: num(e.target.value) }); }} />}
        </Field>
        <Field error={validation.fieldError('jitterMin')} label={t('settings.scanPrivacy.jitterMin')}>{(id, d) => <input id={id} aria-describedby={d} {...validation.control('jitterMin')} type="number" min={0} value={Number.isNaN(cfg.jitterMinMs) ? '' : cfg.jitterMinMs} onChange={(e) => { set({ jitterMinMs: num(e.target.value) }); }} />}</Field>
        <Field error={validation.fieldError('jitterMax')} label={t('settings.scanPrivacy.jitterMax')}>{(id, d) => <input id={id} aria-describedby={d} {...validation.control('jitterMax')} type="number" min={0} value={Number.isNaN(cfg.jitterMaxMs) ? '' : cfg.jitterMaxMs} onChange={(e) => { set({ jitterMaxMs: num(e.target.value) }); }} />}</Field>
        <Field error={validation.fieldError('budget')} label={t('settings.scanPrivacy.budget')} hint={t('settings.scanPrivacy.budgetHint')}>
          {(id, d) => <input id={id} {...validation.control('budget')} aria-describedby={d} type="number" min={1} value={Number.isNaN(cfg.openLaneBudget) ? '' : cfg.openLaneBudget} onChange={(e) => { set({ openLaneBudget: num(e.target.value) }); }} />}
        </Field>
        <Field error={validation.fieldError('flood')} label={t('settings.scanLanes.flood')} hint={t('settings.scanLanes.floodHint')}>
          {(id, d) => <input id={id} {...validation.control('flood')} aria-describedby={d} type="number" min={1} max={MAX_FLOOD_PER_BLOCK} value={Number.isNaN(lanes.floodPerBlock) ? '' : lanes.floodPerBlock} onChange={(e) => { setLane({ floodPerBlock: num(e.target.value) }); }} />}
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
        {lanes.unreadable === true && <Notice kind="warn">{t('scanPrivacy.blocked.settingsUnreadable')}</Notice>}
        <div className="check">
          <input id="scan-match-cover" type="checkbox" checked={lanes.matchCover} onChange={(e) => { setLane({ matchCover: e.target.checked }); }} />
          <label htmlFor="scan-match-cover">{t('settings.scanLanes.matchCover')}</label>
        </div>
        <p className="hint">{t('settings.scanLanes.matchCoverHint')}</p>
        <h3>{t('settings.scanPrivacy.learnsHeading')}</h3>
        <ul>
          {describeScanDisclosureMessages(cfg, { hasSecondary: Object.values(app.settings.rpcUrlsSecondary).some((u) => u !== '') }).map((row) => (
            <li key={row.party.key}><strong>{displayMessage(row.party, t)}:</strong> {displayMessage(row.learns, t)}</li>
          ))}
          {lanes.privacySetTransfers && <li><strong>{t('scanPrivacy.disclosure.rpcParty')}:</strong> {t('scanLanes.disclosure.transfers', { blocks: String(PRIVACY_TRANSFER_WINDOW_BLOCKS) })}</li>}
          {lanes.matchCover && <li><strong>{t('scanPrivacy.disclosure.rpcParty')}:</strong> {t('scanLanes.disclosure.matchCover')}</li>}
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
