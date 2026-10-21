import type { ReactNode } from 'react';
import { ChainFeeList, LIMITS, ObserverTable } from '../components/Disclosure';

export function About(): ReactNode {
  return (
    <section aria-labelledby="about-h">
      <h2 id="about-h">About and privacy</h2>
      <p>
        GhostPay creates one-time (stealth) addresses so that a seller&rsquo;s receiving address is not published. It is a static page: there is no GhostPay server, account or analytics, and it loads no third-party code or fonts.
      </p>

      <h3>What GhostPay does not hide</h3>
      <ul className="plain-list">
        {LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>

      <h3>Who learns what</h3>
      <ObserverTable />

      <h3>Fees</h3>
      <ChainFeeList />
      <p className="hint">
        Gas-sponsored sweeps charge max(110 % of the gas cost, 0.5 % of the amount), capped at 3 %, shown in the quote before you sign. The optional gas buffer and the delay are free.
      </p>

      <h3>How to verify this release</h3>
      <ol>
        <li>Compare the SHA-256 shown on the Home page with the hash published by the maintainers for this release.</li>
        <li>Prefer opening the app from the host the maintainers name, over HTTPS. A response header policy (CSP, no-referrer) only applies on hosts that support it; GitHub Pages cannot set headers.</li>
        <li>Before sending, check that the final screen and your wallet show the same contract, one-time address, amounts and fee recipient.</li>
      </ol>
      <p className="hint">No external audit of this software has been performed.</p>
    </section>
  );
}
