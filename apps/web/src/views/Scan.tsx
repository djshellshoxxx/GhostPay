import { findChain, tokensForChain, type RpcClient } from '@ghostpay/chain-adapters';
import { unsafeRevealSecret } from '@ghostpay/core-crypto';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Field, Mono, Notice } from '../components/Common';
import { useManifest } from '../components/Disclosure';
import { formatUnits } from '../lib/format';
import { manifestBlockText } from '../lib/manifest';
import { userMessage } from '../lib/errors';
import { runScan, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { useServices } from '../lib/services';
import { requireSession } from '../lib/session';
import type { TagPayload } from '../lib/tags';
import { useApp } from '../state';

export function Scan(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [chainId, setChainId] = useState<number>(services.chains[0]?.chainId ?? 84532);
  const [start, setStart] = useState('');
  const [resume, setResume] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);
  const [reorgNote, setReorgNote] = useState<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const manifest = useManifest(chainId);
  const checkpoint = services.checkpoints.load(chainId);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  if (app.session === undefined) {
    return (
      <section aria-labelledby="scan-h">
        <h2 id="scan-h">Scan and receive</h2>
        <Notice kind="info">Load or generate seller keys first.</Notice>
        <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>Go to Seller keys</button>
      </section>
    );
  }

  const begin = (): void => {
    setError(undefined);
    setDone(undefined);
    setReorgNote(undefined);
    void (async () => {
      try {
        const chain = findChain(chainId);
        if (chain === undefined || manifest?.status !== 'loaded') throw new Error('manifest');
        const rpc: RpcClient | undefined = await app.getRpc(chainId);
        if (rpc === undefined) {
          setError('Configure an RPC for this chain in Settings first.');
          return;
        }
        let cursor = resume ? checkpoint : undefined;
        if (cursor === undefined) {
          if (!/^\d{1,15}$/.test(start.trim())) {
            setError('Enter the block number to start scanning from.');
            return;
          }
          cursor = { nextBlock: BigInt(start.trim()) };
        }
        const secrets = requireSession();
        const viewingKey = unsafeRevealSecret(secrets.keys.viewingSecret);
        const ctl = new AbortController();
        abort.current = ctl;
        setRunning(true);
        app.setMatches([]);
        let found: ScanMatch[] = [];
        const res = await runScan({
          chain,
          manifest: manifest.manifest,
          client: rpc,
          cursor,
          spendingPublicKeyHex: app.session?.spendingPublicKey ?? '',
          viewingKey,
          createWorker: services.createScanWorker,
          signal: ctl.signal,
          checkpoints: services.checkpoints,
          onProgress: setProgress,
          onMatch: (m) => {
            found.push(m);
            app.setMatches([...found]);
          },
          onReorg: (to, dropped) => {
            found = found.filter((m) => m.announcement.blockNumber < to);
            app.setMatches([...found]);
            setReorgNote(
              `A chain reorganisation was detected: ${String(dropped)} payment${dropped === 1 ? ' was' : 's were'} removed from the list (block ${to.toString()} and later). They are listed again only if they are still on the canonical chain.`,
            );
            app.announce('Chain reorganisation detected during the scan.');
          },
        });
        setDone(ctl.signal.aborted ? `Cancelled. ${String(res.scanned)} announcements checked.` : `Finished. ${String(res.scanned)} announcements checked, ${String(res.matches.length)} payments found.`);
        app.announce('Scan finished.');
      } catch (e) {
        setError(e instanceof Error && e.message === 'manifest' ? 'Payments are disabled on this chain: no deployment manifest is loaded, so the announcer address is unknown.' : userMessage(e));
      } finally {
        setRunning(false);
      }
    })();
  };

  return (
    <section aria-labelledby="scan-h">
      <h2 id="scan-h">Scan and receive</h2>
      <p>
        Announcements are downloaded from your RPC and checked inside a dedicated worker. The worker gets public logs and your viewing key for this scan only; it cannot reach the network.
      </p>
      <div className="stack">
        <Field label="Chain">
          {(id) => (
            <select id={id} value={chainId} onChange={(e) => { setChainId(Number(e.target.value)); }} disabled={running}>
              {services.chains.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
        {manifest === undefined && <p className="hint" role="status">Loading the deployment manifest and checking it against the chain…</p>}
        {manifest !== undefined && manifest.status !== 'loaded' && <Notice kind="warn">{manifestBlockText(manifest)}</Notice>}
        <Field label="Start block" hint={checkpoint === undefined ? 'The first block to scan from.' : `A checkpoint exists at block ${checkpoint.nextBlock.toString()}.`}>
          {(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" value={start} onChange={(e) => { setStart(e.target.value); }} disabled={running} />}
        </Field>
        {checkpoint !== undefined && (
          <div className="check">
            <input id="resume" type="checkbox" checked={resume} onChange={(e) => { setResume(e.target.checked); }} />
            <label htmlFor="resume">Resume from checkpoint</label>
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={begin} disabled={running || manifest === undefined}>Start scan</button>
          <button type="button" className="btn" onClick={() => { abort.current?.abort(); }} disabled={!running}>Cancel</button>
          {checkpoint !== undefined && (
            <button type="button" className="btn" onClick={() => { services.checkpoints.clear(chainId); setResume(false); app.announce('Checkpoint cleared.'); }} disabled={running}>
              Clear checkpoint
            </button>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" className="status">
        {progress !== undefined && `Scanned up to block ${progress.nextBlock.toString()}; ${String(progress.scanned)} announcements checked, ${String(progress.matches)} payments found${progress.skipped > 0 ? `, ${String(progress.skipped)} malformed logs skipped` : ''}.`}
        {running && progress === undefined && 'Starting…'}
      </div>
      {done !== undefined && <Notice kind="ok">{done}</Notice>}
      {error !== undefined && <Notice kind="error">{error}</Notice>}
      {reorgNote !== undefined && <Notice kind="warn" title="Reorganisation">{reorgNote}</Notice>}

      <Matches chainId={chainId} />
      <Tags chainId={chainId} />
    </section>
  );
}

function formatAmount(kind: 'native' | 'erc20', token: string, amount: bigint, chainId: number): string {
  if (kind === 'native') return `${formatUnits(amount, 18)} ${findChain(chainId)?.nativeSymbol ?? 'native'}`;
  const t = tokensForChain(chainId).find((x) => x.address.toLowerCase() === token.toLowerCase());
  return t === undefined ? `${amount.toString()} units of unlisted token ${token}` : `${formatUnits(amount, t.decimals)} ${t.symbol}`;
}

const CLAIMED_REASON: Readonly<Record<string, string>> = {
  no_metadata: 'the payment has no readable amount',
  native_unverifiable: 'native-coin amounts from direct payers cannot be verified here',
  token_not_allowlisted: 'the token is not on the allowlist',
  no_transfer_found: 'no matching token transfer to this address was found',
  verification_failed: 'your RPC could not confirm the transfer',
  not_checked: 'it was not checked',
};

/** The amount line. A `claimed` amount is labelled as the payer's claim and is never worded as money received. */
export function describeAmount(m: ScanMatch, chainId: number): { readonly verified: boolean; readonly text: string } {
  const v = m.verification;
  if (v.status === 'verified') {
    return { verified: true, text: `Verified: ${formatAmount(m.metadata?.kind ?? 'erc20', v.token, v.amount, chainId)}` };
  }
  const why = CLAIMED_REASON[v.reason] ?? 'it could not be verified';
  if (v.claimed === undefined || m.metadata === undefined) return { verified: false, text: `Amount not verified (${why})` };
  return { verified: false, text: `Claimed by the payer, not verified: ${formatAmount(m.metadata.kind, v.claimed.token, v.claimed.amount, chainId)} (${why})` };
}

function finality(m: ScanMatch, chainId: number): string {
  const depth = findChain(chainId)?.finalityDepth ?? 0;
  const n = m.confirmations.toString();
  return m.final
    ? `Final (${n} confirmations when scanned)`
    : `Not final: ${n} of ${String(depth + 1)} confirmations when scanned. A reorganisation can still remove this payment; do not treat it as received yet.`;
}

function Matches(props: { readonly chainId: number }): ReactNode {
  const app = useApp();
  const services = useServices();
  const [tags, setTags] = useState<Readonly<Record<string, string>>>({});
  const [label, setLabel] = useState<Readonly<Record<string, string>>>({});
  const [err, setErr] = useState<string | undefined>(undefined);
  const unlocked = services.vault.unlocked;
  const matches = app.matches;

  useEffect(() => {
    let live = true;
    if (!unlocked) {
      setTags({});
      return;
    }
    void (async () => {
      const next: Record<string, string> = {};
      for (const m of matches) {
        try {
          const t = await services.vault.find(props.chainId, m.stealthAddress);
          if (t !== undefined) next[m.announcement.id] = t.clientLabel;
        } catch {
          /* undecryptable tags are reported in the tag list */
        }
      }
      if (live) setTags(next);
    })();
    return () => {
      live = false;
    };
  }, [matches, unlocked, services, props.chainId]);

  if (matches.length === 0) return <p className="hint">No payments found yet.</p>;
  return (
    <div>
      <h3>Payments found</h3>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <ul className="plain-list matches">
        {matches.map((m) => {
          const id = m.announcement.id;
          return (
            <li key={id} className="card">
              <p>
                <strong>{describeAmount(m, props.chainId).text}</strong> in block {m.announcement.blockNumber.toString()}
                {m.viaRouter ? '' : ' (paid directly, no GhostPay fee)'}
              </p>
              <p className={m.final ? 'hint' : 'pending'}>{finality(m, props.chainId)}</p>
              {!describeAmount(m, props.chainId).verified && (
                <p className="hint">Anyone can announce a payment with any amount. Only a verified amount is evidence of money received; check the balance before you rely on it.</p>
              )}
              <p>One-time address: <Mono>{m.stealthAddress}</Mono></p>
              {tags[id] !== undefined && <p>Tag: <strong className="wrap">{tags[id]}</strong></p>}
              {unlocked && (
                <div className="row">
                  <div className="field">
                    <label htmlFor={`tag-${id}`}>Client tag (stored encrypted on this device)</label>
                    <input id={`tag-${id}`} value={label[id] ?? ''} maxLength={200} onChange={(e) => { setLabel({ ...label, [id]: e.target.value }); }} />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const payload: TagPayload = { stealthAddress: m.stealthAddress, announcementId: id, logIndex: m.announcement.logIndex, clientLabel: label[id] ?? '' };
                      services.vault.save(props.chainId, payload).then(
                        () => {
                          setErr(undefined);
                          setTags({ ...tags, [id]: payload.clientLabel.trim() });
                          app.announce('Tag saved.');
                        },
                        (e: unknown) => {
                          setErr(userMessage(e));
                        },
                      );
                    }}
                  >
                    Save tag
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={() => { app.selectForSweep({ match: m, chainId: props.chainId }); app.setView('sweep'); }}>
                Sweep this payment
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Tags(props: { readonly chainId: number }): ReactNode {
  const app = useApp();
  const services = useServices();
  const [, force] = useState(0);
  const [list, setList] = useState<readonly TagPayload[] | undefined>(undefined);
  const [err, setErr] = useState<string | undefined>(undefined);
  const unlocked = services.vault.unlocked;

  const refresh = (): void => {
    services.vault.list(props.chainId).then(setList, (e: unknown) => {
      setErr(userMessage(e));
    });
  };

  return (
    <div>
      <h3>Local client tags</h3>
      <p className="hint">
        Tags never leave this browser. They are encrypted with a key derived from your viewing key and stored in IndexedDB as ciphertext. They are readable while unlocked, so lock when you step away; the vault also locks after {app.settings.lockTimeoutMin} idle minutes.
      </p>
      {err !== undefined && <Notice kind="error">{err}</Notice>}
      <div className="actions">
        {!unlocked ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                const key = unsafeRevealSecret(requireSession().keys.viewingSecret);
                services.vault.unlock(key).then(
                  () => {
                    setErr(undefined);
                    force((n) => n + 1);
                    refresh();
                    app.announce('Tags unlocked.');
                  },
                  (e: unknown) => {
                    setErr(userMessage(e));
                  },
                );
              } catch (e) {
                setErr(userMessage(e));
              }
            }}
          >
            Unlock tags
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => { services.vault.lock(); setList(undefined); force((n) => n + 1); app.announce('Tags locked.'); }}>
            Lock tags
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Delete every local tag on this device? This cannot be undone.')) {
              services.vault.wipe().then(
                () => {
                  setList(undefined);
                  force((n) => n + 1);
                  app.announce('All tags deleted.');
                },
                (e: unknown) => {
                  setErr(userMessage(e));
                },
              );
            }
          }}
        >
          Delete all tags
        </button>
      </div>
      {unlocked && list !== undefined && (
        <ul className="plain-list">
          {list.map((t) => (
            <li key={t.announcementId}>
              <span className="wrap">{t.clientLabel}</span> <Mono>{t.stealthAddress}</Mono>
            </li>
          ))}
          {list.length === 0 && <li>No tags yet.</li>}
        </ul>
      )}
    </div>
  );
}
