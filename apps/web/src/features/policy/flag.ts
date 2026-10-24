/**
 * Experimental policy accounts (scheme 0x47500002, ADR-0014) are off unless the build sets
 * `VITE_GHOSTPAY_EXPERIMENTAL_POLICY=1`. Read at render time so tests can stub the environment.
 */
export const POLICY_FLAG = 'VITE_GHOSTPAY_EXPERIMENTAL_POLICY';

export function isPolicyFeatureEnabled(env: Readonly<Record<string, unknown>> = import.meta.env as Readonly<Record<string, unknown>>): boolean {
  return env[POLICY_FLAG] === '1';
}

/** Fixed banner text: shown on every policy screen. */
export const POLICY_WARNING =
  'Experimental and unaudited. Policy accounts have no external audit, no recovery path for a lost key, and no pinned deployment on any network. Use test networks and test funds only.';
