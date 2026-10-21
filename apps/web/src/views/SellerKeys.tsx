import { useState, type FormEvent, type ReactNode } from 'react';
import { CopyButton, Field, Mono, Notice, downloadText } from '../components/Common';
import { userMessage } from '../lib/errors';
import { passphraseProblem } from '../lib/keystore';
import { clearSession, exportKeystore, generateSession, importKeystore, importSession } from '../lib/session';
import { useApp } from '../state';

export function SellerKeys(): ReactNode {
  const app = useApp();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState('');
  const [view, setViewKey] = useState('');
  const [signing, setSigning] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [importPass, setImportPass] = useState('');
  const [file, setFile] = useState<File | undefined>(undefined);

  const fail = (e: unknown): void => {
    setMessage({ kind: 'error', text: userMessage(e) });
  };
  const done = (text: string): void => {
    setMessage({ kind: 'ok', text });
    app.announce(text);
  };

  const onImportRaw = (e: FormEvent): void => {
    e.preventDefault();
    try {
      importSession({ spendingKeyHex: spend, viewingKeyHex: view, ...(signing.trim() === '' ? {} : { signingKeyHex: signing }) });
      setSpend('');
      setViewKey('');
      setSigning('');
      done('Keys loaded into memory.');
    } catch (err) {
      fail(err);
    }
  };

  const onExport = (e: FormEvent): void => {
    e.preventDefault();
    const problem = passphraseProblem(pass);
    if (problem !== undefined) {
      setMessage({ kind: 'error', text: problem });
      return;
    }
    if (pass !== pass2) {
      setMessage({ kind: 'error', text: 'The two passphrases differ.' });
      return;
    }
    setBusy(true);
    setMessage({ kind: 'ok', text: 'Encrypting (this takes a moment on purpose)…' });
    exportKeystore(pass).then(
      (text) => {
        downloadText('ghostpay-keystore.json', text, 'application/json');
        setPass('');
        setPass2('');
        setBusy(false);
        done('Encrypted keystore downloaded. Keep the file and remember the passphrase: neither can be recovered.');
      },
      (err: unknown) => {
        setBusy(false);
        fail(err);
      },
    );
  };

  const onImportKeystore = (e: FormEvent): void => {
    e.preventDefault();
    if (file === undefined) {
      setMessage({ kind: 'error', text: 'Choose a keystore file first.' });
      return;
    }
    if (file.size > 8 * 1024) {
      setMessage({ kind: 'error', text: 'This is not a GhostPay keystore file.' });
      return;
    }
    setBusy(true);
    setMessage({ kind: 'ok', text: 'Decrypting…' });
    file
      .text()
      .then((text) => importKeystore(text, importPass))
      .then(
        () => {
          setImportPass('');
          setFile(undefined);
          setBusy(false);
          done('Keystore decrypted; keys are in memory.');
        },
        (err: unknown) => {
          setBusy(false);
          fail(err);
        },
      );
  };

  const s = app.session;
  return (
    <section aria-labelledby="keys-h">
      <h2 id="keys-h">Seller keys</h2>
      <Notice kind="info" title="Keys stay in memory">
        Keys are generated and used only inside this page. They are never written to browser storage. Reloading or closing the tab forgets them, so export an encrypted keystore if you want to keep them.
      </Notice>
      {message !== undefined && <Notice kind={message.kind}>{message.text}</Notice>}

      {s === undefined ? (
        <>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => { try { generateSession(); done('New keys generated in memory.'); } catch (err) { fail(err); } }}>
              Generate new keys
            </button>
          </p>
          <details>
            <summary>Import existing keys (hex)</summary>
            <form onSubmit={onImportRaw} className="stack" autoComplete="off">
              <Field label="Spending private key (64 hex characters)">{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={spend} onChange={(e) => { setSpend(e.target.value); }} />}</Field>
              <Field label="Viewing private key (64 hex characters)">{(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={view} onChange={(e) => { setViewKey(e.target.value); }} />}</Field>
              <Field label="Invoice-signing private key (optional)" hint="Leave empty to generate a separate signing key. It must not be your spending or viewing key.">
                {(id, d) => <input id={id} aria-describedby={d} type="password" autoComplete="off" spellCheck={false} value={signing} onChange={(e) => { setSigning(e.target.value); }} />}
              </Field>
              <button type="submit" className="btn">Load keys</button>
            </form>
          </details>
          <details>
            <summary>Import an encrypted keystore</summary>
            <form onSubmit={onImportKeystore} className="stack">
              <Field label="Keystore file">{(id) => <input id={id} type="file" accept="application/json,.json" onChange={(e) => { setFile(e.target.files?.[0]); }} />}</Field>
              <Field label="Passphrase">{(id) => <input id={id} type="password" autoComplete="off" value={importPass} onChange={(e) => { setImportPass(e.target.value); }} />}</Field>
              <button type="submit" className="btn" disabled={busy}>Decrypt and load</button>
            </form>
          </details>
        </>
      ) : (
        <>
          <h3>Your meta-address (public)</h3>
          <p>Share this to receive payments. It reveals no private key.</p>
          <p><Mono>{s.metaAddress}</Mono></p>
          <p><CopyButton text={s.metaAddress} label="Copy meta-address" /></p>
          <h3>Invoice-signing public key</h3>
          <p><Mono>{s.signerPublicKey}</Mono></p>
          <p className="hint">Payers see &ldquo;signature matches key …&rdquo;. They can pin this key; an unpinned key identifies nobody.</p>

          <h3>Back up (encrypted)</h3>
          <form onSubmit={onExport} className="stack" autoComplete="off">
            <Field label="Passphrase (at least 12 characters)">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass} onChange={(e) => { setPass(e.target.value); }} />}</Field>
            <Field label="Repeat passphrase">{(id) => <input id={id} type="password" autoComplete="new-password" value={pass2} onChange={(e) => { setPass2(e.target.value); }} />}</Field>
            <button type="submit" className="btn" disabled={busy}>Download encrypted keystore</button>
          </form>
          <p className="hint">Format: scrypt (N=2^17, r=8, p=1) and AES-256-GCM. The passphrase is not stored anywhere.</p>

          <h3>Forget keys</h3>
          <button type="button" className="btn btn-danger" onClick={() => { clearSession(); app.announce('Keys wiped from memory.'); setMessage({ kind: 'ok', text: 'Keys wiped from memory.' }); }}>
            Wipe keys from memory
          </button>
        </>
      )}

      <h3>Public registry</h3>
      <p className="hint">Publishing your meta-address to the ERC-6538 registry would publicly associate it with your wallet address. This release does not publish; share the meta-address directly.</p>
    </section>
  );
}
