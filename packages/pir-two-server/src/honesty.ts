/**
 * Honest UI/doc copy for the `pir2` scan mode (spec NP-C-2, NP-P-7, MH-SCAN-3). Single source: UI and
 * docs must render these strings, not paraphrase them. Wording rule: never "anonymous", "untraceable" or "mix".
 */
export const PIR2_CLAIMS = Object.freeze({
  id: 'pir2',
  label: 'Two-server PIR scanning (research PoC, testnet only)',
  hides: Object.freeze([
    'Which page of the log database you fetch, from each single server, as long as the two servers do not collude.',
  ] as const),
  doesNotHide: Object.freeze([
    'Your IP address: the servers still see who connects (combine with a network profile, which hides only the IP).',
    'That you use PIR at all, and when you query.',
    'Anything on-chain: the announcement log is public data.',
    'Anything if the two servers collude or are run by one operator: they can compare queries and learn exactly which page you read.',
    'A malicious server cannot be corrected: a wrong answer is detected and discarded, not repaired.',
    'Timing: only a dummy-page schedule is used; there is no stronger timing protection.',
  ] as const),
  trustAssumption:
    'Needs two servers run by two independent operators that do not share logs or collude. If one operator runs both, there is NO privacy from that operator.',
  scope:
    'Teaching-grade XOR scheme: bandwidth and server work grow linearly with database size; suitable for a testnet slice only.',
  noCollusionNotice:
    'Privacy holds only if the two PIR servers do not collude. This tool cannot check that: it only refuses two servers on the same host or domain.',
});

/** Text shown when the user deliberately points both servers at one operator (testing only). */
export const SAME_OPERATOR_NOTICE =
  'Both PIR servers share one operator or domain: this gives NO privacy from that operator. Use for testing only.';
