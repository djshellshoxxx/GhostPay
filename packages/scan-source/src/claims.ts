import { PIR2_CLAIMS } from '@ghostpay/pir-two-server';
import type { ScanMode } from './types.js';

/** Honest, user-facing description of one scan mode. UI must render these strings verbatim (NP-C-1/2). */
export interface ScanModeClaims {
  readonly id: ScanMode;
  readonly label: string;
  /** True for the spec default. */
  readonly isDefault: boolean;
  readonly hides: readonly string[];
  readonly doesNotHide: readonly string[];
  /** Trust assumption shown in the option help. */
  readonly trust: string;
}

/**
 * Per-mode claims copied from network-privacy.md (sections 2, 4.7, 4.8) and metadata-hardening.md (MH-SCAN-1..3).
 * Wording rule: never "anonymous", "untraceable" or "mix".
 */
export const SCAN_MODE_CLAIMS: Readonly<Record<ScanMode, ScanModeClaims>> = Object.freeze({
  range: {
    id: 'range',
    label: 'Full range download (default)',
    isDefault: true,
    hides: ['Which announcements are yours: the whole range is fetched and matched on your device.'],
    doesNotHide: [
      'Your IP address.',
      'The block range you scan and when (padded to a coarse grid, which blurs but does not remove it).',
      'That you scan GhostPay announcements.',
      'Anything on-chain.',
    ],
    trust: 'Your RPC provider sees your IP and scan range. A lying RPC can hide payments from you.',
  },
  'indexer-tor': {
    id: 'indexer-tor',
    label: 'Public-log indexer (use through your network profile)',
    isDefault: false,
    hides: ['Which announcements are yours (matching is local). Your IP only if the network profile you chose is not direct.'],
    doesNotHide: [
      'Your IP address when the profile is direct. A proxy hides the IP from the server, not what you send.',
      'The block range you scan and when.',
      'That you use this indexer.',
      'Anything on-chain.',
    ],
    trust: 'The indexer operator sees the padded range. It is cross-checked against a second source, but it could still omit records.',
  },
  pir2: {
    id: 'pir2',
    label: PIR2_CLAIMS.label,
    isDefault: false,
    hides: PIR2_CLAIMS.hides,
    doesNotHide: PIR2_CLAIMS.doesNotHide,
    trust: PIR2_CLAIMS.trustAssumption,
  },
  'light-client': {
    id: 'light-client',
    label: 'Light-client verification',
    isDefault: false,
    hides: [],
    doesNotHide: [
      'Your queries: it verifies answers, it does not hide queries.',
      'Your IP address and scan range from the upstream it talks to.',
      'Log completeness unless the light client proves log inclusion (not verified in this PoC).',
    ],
    trust: 'Light client software is unaudited here. It checks block identity against a verified header chain.',
  },
});

/** Returns the claims for a mode. */
export function describeScanMode(mode: ScanMode): ScanModeClaims {
  return SCAN_MODE_CLAIMS[mode];
}
