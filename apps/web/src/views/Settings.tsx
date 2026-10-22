import { useState, type FormEvent, type ReactNode } from 'react';
import { Field, Notice } from '../components/Common';
import { userMessage } from '../lib/errors';
import { checkDelayRange, checkRelayerUrl, checkRpcUrl, type Settings as SettingsData } from '../lib/settings';
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
      <Notice kind="warn" title="Settings can be changed outside this page">
        Anything that can write to this site&rsquo;s browser storage, including another local user, malware or an extension, can change these RPC, relayer and pinned-signer settings. Review the endpoints and signer keys before relying on them. A second RPC can reveal disagreements, but it does not make either provider trustworthy by itself.
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
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
