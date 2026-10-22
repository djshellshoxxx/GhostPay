import type { PayloadPolicy } from './payload.js';

export const HOST = 'pay.example.test';
export const POLICY: PayloadPolicy = { allowedHosts: [HOST] };
/** Fake EVM address (not a real key). */
export const EVM = '0xa1b2c3d4e5a1b2c3d4e5a1b2c3d4e5a1b2c3d4e5';
/** BIP173 published test vector (bech32). */
export const BECH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
/** BIP350 published test vector (bech32m). */
export const BECHM = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
/** Fake base64url body; deliberately not a real envelope (this package never decodes it). */
export const B64 = 'SECRETKEYMATERIALabcdefghijklmnopqrstuvwxyz_-0123456789';
export const FRAG = `#gpi=v1.${B64}`;
export const LINK = `https://${HOST}/pay${FRAG}`;
