import { useState, type FormEvent, type ReactNode } from 'react';
import { Field, Notice } from '../components/Common';
import { UserFacingError, userMessage } from '../lib/errors';
import { checkDelayRange, checkRelayerUrl, checkRpcUrl, type Settings as SettingsData } from '../lib/settings';
import { useServices } from '../lib/services';
import { useApp } from '../state';

export function Settings(): ReactNode {
  const app = useApp();
  const services = useServices();
  const s = app.settings;
  const [rpc, setRpc] = useState<Record<string, string>>({ ...s.rpcUrls });
  const [rpc2, setRpc2] = useState<Record<string, string>>({ ...s.secondaryRpcUrls });
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
      const secondaryRpcUrls: Record<string, string> = {};
      for (const [k, v] of Object.entries(rpc2)) if (v.trim() !== '') secondaryRpcUrls[k] = checkRpcUrl(v);
      for (const k of Object.keys(secondaryRpcUrls)) {
        if (rpcUrls[k] === undefined) throw new UserFacingError('A second RPC needs a primary RPC for the same chain.');
        if (new URL(rpcUrls[k]).origin === new URL(secondaryRpcUrls[k] as string).origin) {
          throw new UserFacingError('The second RPC must be an independent provider, not the same origin as the first.');
        }
      }
      checkDelayRange(minSec, maxSec);
      if (!Number.isInteger(lock) || lock < 1 || lock > 240) throw new Error('lock');
      const pinnedSigners = pins
        .split('\n')
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l !== '');
      if (pinnedSigners.some((p) => !/^(?:02|03)[0-9a-f]{64}$/.test(p))) {
        setMessage({ kind: 'error', text: 'Pinned signer keys must be 66 hexadecimal characters starting with 02 or 03, one per line.' });
        return;
      }
      const next: SettingsData = { rpcUrls, secondaryRpcUrls, relayerUrl: checkRelayerUrl(relayer), delayMinSec: minSec, delayMaxSec: maxSec, lockTimeoutMin: lock, theme, autoClearFragment: autoClear, pinnedSigners };
      const saved = app.updateSettings(next);
      setMessage(saved ? { kind: 'ok', text: 'Settings saved.' } : { kind: 'warn', text: 'Browser storage is unavailable, so these settings apply to this tab only.' });
      app.announce('Settings updated.');
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error && err.message === 'lock' ? 'Lock timeout must be 1 to 240 minutes.' : userMessage(err) });
    }
  };

  const onTest = (chainId: number): void => {
    const chain = services.chains.find((c) => c.chainId === chainId);
    const url = rpc[String(chainId)] ?? '';
    if (chain === undefined) return;
    setChecks((c) => ({ ...c, [chainId]: 'Checking…' }));
    void (async () => {
      try {
        await services.createRpc(chain, checkRpcUrl(url));
        setChecks((c) => ({ ...c, [chainId]: 'Connected. The endpoint reports the expected chain id.' }));
      } catch (err) {
        setChecks((c) => ({ ...c, [chainId]: err instanceof Error && err.name === 'ChainAdapterError' ? 'Failed: the endpoint is unreachable or reports a different chain.' : userMessage(err) }));
      }
    })();
  };

  return (
    <section aria-labelledby="set-h">
      <h2 id="set-h">Settings</h2>
      <Notice kind="info">
        Settings are kept in this browser in plain text, including RPC URLs. Do not put a URL there that contains a secret you would not store in plain text. No key is ever stored.
      </Notice>
      <Notice kind="warn" title="Settings are not tamper-protected">
        Anything that can write to this site&rsquo;s browser storage (another local user, malware, an extension) can silently change these settings: add a hostile RPC, a pinned signer key or another relayer. The contracts are re-read from the chain through whatever RPC is set here, so check the RPC addresses on this page before paying or sweeping, and use a second independent RPC if you can.
      </Notice>
      <form onSubmit={onSave} className="stack" noValidate>
        <fieldset>
          <legend>RPC endpoints</legend>
          <p className="hint">Only https:// and wss:// are accepted, with no username or password. The chain id is verified when the endpoint is used. No default RPC is built in.</p>
          {services.chains.map((c) => (
            <div key={c.chainId} className="row">
              <Field label={`${c.name} RPC URL`}>
                {(id) => <input id={id} type="url" spellCheck={false} value={rpc[String(c.chainId)] ?? ''} onChange={(e) => { setRpc({ ...rpc, [String(c.chainId)]: e.target.value }); }} />}
              </Field>
              <Field label={`${c.name} second RPC URL (optional, independent provider)`} hint="When set, contract read-backs, balances, receipts and log queries must be identical on both providers; a single lying or censoring provider is then detected. Leave empty to trust one provider.">
                {(id, d) => <input id={id} aria-describedby={d} type="url" spellCheck={false} value={rpc2[String(c.chainId)] ?? ''} onChange={(e) => { setRpc2({ ...rpc2, [String(c.chainId)]: e.target.value }); }} />}
              </Field>
              <button type="button" className="btn" onClick={() => { onTest(c.chainId); }}>Test {c.name}</button>
              <p role="status" className="hint">{checks[c.chainId] ?? ''}</p>
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>Relayer</legend>
          <Field label="Relayer URL (optional)" hint="https only. The relayer sees the one-time address, destination, token, amount and timing of each sweep it handles.">
            {(id, d) => <input id={id} aria-describedby={d} type="url" spellCheck={false} value={relayer} onChange={(e) => { setRelayer(e.target.value); }} />}
          </Field>
        </fieldset>
        <fieldset>
          <legend>Payment delay (optional feature)</legend>
          <Field label="Minimum delay (seconds)">{(id) => <input id={id} type="number" min={0} value={minSec} onChange={(e) => { setMinSec(Number(e.target.value)); }} />}</Field>
          <Field label="Maximum delay (seconds)">{(id) => <input id={id} type="number" min={0} value={maxSec} onChange={(e) => { setMaxSec(Number(e.target.value)); }} />}</Field>
        </fieldset>
        <fieldset>
          <legend>Safety and appearance</legend>
          <Field label="Lock local tags after idle minutes" hint="Keys stay in memory until you wipe them or close the tab.">
            {(id, d) => <input id={id} aria-describedby={d} type="number" min={1} max={240} value={lock} onChange={(e) => { setLock(Number(e.target.value)); }} />}
          </Field>
          <Field label="Theme">
            {(id) => (
              <select id={id} value={theme} onChange={(e) => { setTheme(e.target.value as SettingsData['theme']); }}>
                <option value="system">Follow system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            )}
          </Field>
          <div className="check">
            <input id="autoclear" type="checkbox" checked={autoClear} onChange={(e) => { setAutoClear(e.target.checked); }} />
            <label htmlFor="autoclear">Remove the invoice from the address bar after reading it</label>
          </div>
          <Field label="Pinned seller signing keys (one per line)" hint="Only keys you pin are described as pinned. Get them from the seller over a channel you trust.">
            {(id, d) => <textarea id={id} aria-describedby={d} rows={3} spellCheck={false} value={pins} onChange={(e) => { setPins(e.target.value); }} />}
          </Field>
        </fieldset>
        <button type="submit" className="btn btn-primary">Save settings</button>
      </form>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}
    </section>
  );
}
