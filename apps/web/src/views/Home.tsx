import { useEffect, useState, type ReactNode } from 'react';
import { ChainFeeList, LIMITS } from '../components/Disclosure';
import { Mono } from '../components/Common';
import { computeReleaseHash, entryScriptUrl } from '../lib/release';
import { useServices } from '../lib/services';
import { useApp } from '../state';

export function Home(): ReactNode {
  const app = useApp();
  const services = useServices();
  const [hash, setHash] = useState<{ file: string; sha256: string } | 'unavailable' | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const src = entryScriptUrl(document);
    if (src === undefined) {
      setHash('unavailable');
      return;
    }
    computeReleaseHash(src, services.fetchFn, window.location.origin).then(
      (h) => {
        if (live) setHash(h);
      },
      () => {
        if (live) setHash('unavailable');
      },
    );
    return () => {
      live = false;
    };
  }, [services]);

  return (
    <section aria-labelledby="home-h">
      <h2 id="home-h">What do you want to do?</h2>
      <div className="cards">
        <article className="card">
          <h3>Seller</h3>
          <p>Create keys and invoices, then scan for payments you have received.</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('seller'); }}>
            Seller keys
          </button>
        </article>
        <article className="card">
          <h3>Pay</h3>
          <p>Open an invoice link, review every amount, and pay from your own wallet.</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('pay'); }}>
            Pay an invoice
          </button>
        </article>
        <article className="card">
          <h3>Sweep</h3>
          <p>Move received funds from a one-time address to your own wallet.</p>
          <button type="button" className="btn btn-primary" onClick={() => { app.setView('sweep'); }}>
            Sweep funds
          </button>
        </article>
      </div>

      <h3>Privacy limits in short</h3>
      <ul className="plain-list">
        {LIMITS.slice(0, 4).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p>
        <button type="button" className="link-btn" onClick={() => { app.setView('about'); }}>
          Read the full privacy notes and observer table
        </button>
      </p>

      <h3>Fees</h3>
      <ChainFeeList />

      <h3>Release check (informational only)</h3>
      <p>
        SHA-256 of the app script you are running, as fetched by this page from its own host:{' '}
        {hash === undefined ? 'computing…' : hash === 'unavailable' ? 'not available in this environment' : (
          <>
            <Mono>{hash.sha256}</Mono> ({hash.file})
          </>
        )}
      </p>
      <p className="hint">
        This is not a verification. A compromised host, or a malicious mirror, controls both this page and the answer to the request that produced this number, so it can show you any hash. To check a release, hash the served files from another machine and compare with the signed list the maintainers publish elsewhere (see About).
      </p>
    </section>
  );
}
