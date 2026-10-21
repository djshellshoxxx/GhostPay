import type { Address, Hex } from 'viem';

/** A populated, unsigned transaction produced by the Railgun SDK. */
export interface PopulatedTx {
  readonly to: Address;
  readonly data: Hex;
  readonly value: bigint;
}

export type PoiStatus = 'valid' | 'pending' | 'blocked' | 'unsupported';

export interface BroadcasterFee {
  readonly feeToken: Address;
  readonly feeAmount: bigint;
}

/** A shield found by an engine rescan for one wallet. */
export interface ScannedShield {
  readonly txHash: Hex;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly token: Address;
  /** Net amount credited to the note (after the shield fee). */
  readonly amount: bigint;
  readonly spent: boolean;
  readonly treeNumber: bigint;
  readonly position: bigint;
  /** Shield fee taken from the shielded amount. */
  readonly fee: bigint;
  /** Transaction sender of the shield (S1 for entries made by this adapter). */
  readonly depositor: Address;
}

/**
 * What the adapter needs from `@railgun-community/wallet`. Shapes follow the 11.2.0 typings read on 2026-10-21
 * (`startRailgunEngine`, `createRailgunWallet`, `getShieldPrivateKeySignatureMessage`, `populateShield`,
 * `generateUnshieldProof`, `populateProvedUnshield`), but the glue that implements this port against the real SDK is NOT
 * part of this package [UNVERIFIED]: it needs the engine, LevelDB storage, quick-sync and a Waku broadcaster client.
 * The adapter treats every value the port returns as untrusted and re-checks it (EP-RG-2, EP-RG-5).
 */
export interface RailgunWalletPort {
  /** `getShieldPrivateKeySignatureMessage()`. */
  shieldMessage(): string;
  /** Turns the stealth signer's signature over {@link shieldMessage} into the shield private key (SDK convention, UNVERIFIED). */
  shieldKeyFromSignature(signature: Hex): Hex;
  /** Opens or creates the wallet for 16 bytes of HKDF output (becomes a mnemonic inside the glue). Must not log or keep `entropy`. */
  openWallet(entropy: Uint8Array): Promise<{ walletId: string; railgunAddress: string }>;
  populateShield(a: { chainId: number; shieldPrivateKey: Hex; railgunAddress: string; token: Address; amount: bigint }): Promise<PopulatedTx>;
  /**
   * Whether the wallet's own engine sees the shield `txHash` as a note of `token` that it can spend. A hostile or buggy SDK
   * could build a shield to someone else's note public key; the adapter cannot check that from calldata, so a note is only
   * `confirmed` after the wallet itself reports it (detective control: funds already sent are not recoverable by this check).
   */
  ownsShield(a: { walletId: string; chainId: number; txHash: Hex; token: Address }): Promise<boolean>;
  poiStatus(a: { walletId: string; chainId: number; token: Address }): Promise<PoiStatus>;
  /** Best broadcaster fee for unshielding `amount` of `token`; `undefined` when no broadcaster is reachable. */
  quoteBroadcasterFee(a: { chainId: number; token: Address; amount: bigint }): Promise<BroadcasterFee | undefined>;
  /** Proves and populates an unshield of `amount` to `recipient`. With `sendWithPublicWallet` the tx is meant for a self-funded address. */
  populateUnshield(a: {
    walletId: string;
    chainId: number;
    token: Address;
    amount: bigint;
    recipient: Address;
    broadcasterFee?: BroadcasterFee;
    sendWithPublicWallet: boolean;
  }): Promise<PopulatedTx>;
  /** Hands a populated unshield to a broadcaster. */
  broadcast(tx: PopulatedTx, chainId: number): Promise<Hex>;
  scanShields(a: { walletId: string; chainId: number }): AsyncIterable<ScannedShield>;
  /** SHA-256 hex of the circuit artifacts the engine loaded, keyed by file name (EP-RG-3). */
  artifactDigests(): Promise<Readonly<Record<string, string>>>;
}

/** Decoded `PoolNote.adapterData` for Railgun (version 1). Holds no secrets: keys are re-derived from the root seed. */
export interface RgNoteData {
  readonly v: 1;
  readonly proxy: Hex;
  readonly token: Hex;
  readonly treeNumber: string;
  readonly position: string;
  readonly shieldFee: string;
}
