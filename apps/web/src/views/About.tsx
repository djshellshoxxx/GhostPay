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
      <p>
        The SHA-256 on Home is informational: this page computes it from a script fetched from the same host. A compromised host could serve both the app and the hash it wants you to see, so that check does not establish that the release is authentic.
      </p>
      <ol>
        <li>Download the published release and its checksum from a second channel, then verify the files locally with the published SHA256SUMS.</li>
        <li>When a release key is built into this app, the deployment manifest must have a valid signature from one of those keys. That signature only helps if you have verified the app bundle itself.</li>
        <li>Check that the deployment addresses and code match the chain through an RPC you trust. A second independent RPC can expose disagreements, but agreement alone does not prove either provider is honest.</li>
        <li>Before sending, check that the final screen and your wallet show the same contract, one-time address, amounts and fee recipient.</li>
        <li>Hosting headers such as CSP and Referrer-Policy only apply on hosts that support them; static hosts may not be able to enforce every policy.</li>
      </ol>
      <p className="hint">No external audit of this software has been performed.</p>
    </section>
  );
}
