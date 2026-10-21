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
        The SHA-256 shown on the Home page is <strong>informational only</strong>. It is computed by the page you are running, from files fetched from the same host, so a compromised host can show you the hash it wants you to see. It cannot detect that threat. Real verification happens outside this page:
      </p>
      <ol>
        <li>On a different machine or network, download the release files from the host and compute <code>sha256sum</code> over every served file. Compare with the <code>SHA256SUMS</code> the maintainers publish for the release tag, obtained from a second channel (the project repository, not the same host).</li>
        <li>If release keys were compiled into this build, the deployment manifest must carry a signature from one of them; the app says &ldquo;unsigned manifest&rdquo; when there is none. Keys that ship inside the same bundle only help if you checked the bundle itself in step 1.</li>
        <li>The contract addresses and fee recipient are read back from the chain through your RPC before any payment, and shown as read from the chain. Use a second independent RPC in Settings to detect a lying provider.</li>
        <li>Before sending, check that the final screen and your wallet show the same contract, one-time address, amounts and fee recipient.</li>
        <li>A response header policy (CSP, no-referrer, frame blocking) only applies on hosts that support it; GitHub Pages and meta-tag-only hosting cannot enforce all of it.</li>
      </ol>
      <p className="hint">No external audit of this software has been performed.</p>
    </section>
  );
}
