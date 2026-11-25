import type { Address, Hex } from 'viem';
import { NOT_PROTECTED_KEYS } from '../copy.js';
import {
  assertAmount,
  encodeConfidentialTransfer,
  encodeFinalizeUnwrap,
  encodePayConfidential,
  encodeSetOperator,
  encodeUnwrap,
  parseNonZeroAddress,
  validatePayParams,
} from '../calldata.js';
import { CtError, type CtErrorCode } from '../errors.js';
import {
  assertCtChain,
  assertManifestContract,
  assertManifestRouter,
  assertManifestToken,
  CT1_MANIFEST,
  manifestForChain,
  parseAddress,
  type CtChainManifest,
  type CtManifest,
} from '../manifest.js';
import { assertHandle } from '../metadata.js';
import type { ConfidentialBackend, CtBackendInfo, CtEncryptedInput, CtPayParams, CtTx, StealthSigner } from '../types.js';

const ID = 'ct1-zama';

/** Static description of CT-1 (Zama fhEVM + ERC-7984). Trust and licence facts: spec section 3. */
export const CT1_INFO: CtBackendInfo = {
  id: ID,
  chains: [11155111, 31337],
  trust: 'threshold-kms',
  maturity: 'testnet',
  licence: 'BSD-3-Clause-Clear (Zama); OpenZeppelin Confidential Contracts MIT',
  relayerOrigin: 'https://relayer.testnet.zama.org',
  whatItHides: ['CT_HIDES_AMOUNT_ONLY'],
  whatItDoesNotHide: [...NOT_PROTECTED_KEYS],
};

/** One short-lived SDK session. A session bound to a stealth key must serve exactly one decrypt request (CT-DEC-1). */
export interface ZamaSession {
  /** Encrypts a `euint64` input bound to `contractAddress` and `userAddress`. */
  encrypt(p: { contractAddress: Address; userAddress: Address; value: bigint }): Promise<{ handle: Hex; inputProof: Hex }>;
  /** User-decrypts one handle as the session's signer. */
  decryptValue(p: { handle: Hex; contractAddress: Address }): Promise<bigint>;
  /** Public-decrypts one handle; returns the cleartext and the KMS proof for `finalizeUnwrap`. */
  decryptPublic(handle: Hex): Promise<{ cleartext: bigint; decryptionProof: Hex }>;
  /** Releases workers and key material. Must be called when done. */
  close(): void;
}

/** Opens {@link ZamaSession}s. The default implementation wraps `@zama-fhe/sdk`; tests inject fakes. */
export interface ZamaSdkPort {
  /** Opens a session. `stealthKey` (if given) is the signer of user-decrypt permits. */
  open(o: { chainId: number; stealthKey?: Hex }): Promise<ZamaSession>;
}

/**
 * @internal Opens one session, runs `fn`, always closes it. Any failure that is not already a
 * {@link CtError} (raw SDK, viem or port errors, which can embed key material such as an out-of-range
 * key scalar) becomes `CtError(code, message)` with a fixed message. A failing `close` is contained.
 */
async function withSession<T>(
  port: ZamaSdkPort,
  o: { chainId: number; stealthKey?: Hex },
  fn: (s: ZamaSession) => Promise<T>,
  code: CtErrorCode,
  message: string,
): Promise<T> {
  let session: ZamaSession | undefined;
  try {
    session = await port.open(o);
    return await fn(session);
  } catch (e) {
    if (e instanceof CtError) throw e;
    throw new CtError(code, message);
  } finally {
    try {
      session?.close();
    } catch {
      // Best effort: the session is unusable either way, and its raw error must not surface.
    }
  }
}

/**
 * CT-1 backend: Zama fhEVM + OpenZeppelin ERC-7984 on Ethereum Sepolia (31337 for the local mock).
 * Calldata building is pure and tested offline; encryption and decryption go through a
 * {@link ZamaSdkPort}, whose default implementation (`createZamaSdkPort`) has NOT been run against
 * a live relayer [UNVERIFIED].
 *
 * Every builder checks its router, operator and token against the manifest's `ghostpay` entry
 * (`CHAIN_NOT_SUPPORTED` when nothing is pinned, `MANIFEST_MISMATCH` for another address). The
 * shipped {@link CT1_MANIFEST} pins no GhostPay contract, so with the default manifest every CT-1
 * builder refuses every chain until a reviewed manifest is supplied. `userDecrypt` moves no funds
 * and is not manifest-checked.
 * @security Plaintext amounts are only passed to the local SDK encryptor. User-decrypt contacts the
 * hosted relayer with the stealth address, the handle and your network address; one stealth address
 * per request (CT-DEC-1), scheduled with `DecryptScheduler` (CT-DEC-2). Errors carry fixed messages only.
 */
export class ZamaBackend implements ConfidentialBackend {
  public readonly info: CtBackendInfo = CT1_INFO;
  readonly #port: ZamaSdkPort;
  readonly #manifest: CtManifest;

  /**
   * @param port SDK access (only used by `encryptAmount`, `buildPayCalldata`, `userDecrypt`, `finalizeUnwrap`).
   * @param manifest Manifest the GhostPay router and tokens are checked against (default {@link CT1_MANIFEST}, which pins none: fail closed).
   */
  public constructor(port: ZamaSdkPort, manifest: CtManifest = CT1_MANIFEST) {
    this.#port = port;
    this.#manifest = manifest;
  }

  /** @internal Chain guard plus the manifest entry of `chainId`. */
  #entry(chainId: number): CtChainManifest {
    assertCtChain(chainId, ID);
    return manifestForChain(chainId, this.#manifest);
  }

  /** @inheritdoc @throws {CtError} also `MANIFEST_MISMATCH` unless `contract` is the pinned router or a pinned token. */
  public async encryptAmount(p: { chainId: number; contract: Address; user: Address; amount: bigint }): Promise<CtEncryptedInput> {
    const entry = this.#entry(p.chainId);
    assertAmount(p.amount, 'amount', true);
    const contractAddress = parseNonZeroAddress(p.contract, 'contract');
    const userAddress = parseNonZeroAddress(p.user, 'user');
    assertManifestContract(entry, contractAddress);
    return withSession(
      this.#port,
      { chainId: p.chainId },
      (s) => s.encrypt({ contractAddress, userAddress, value: p.amount }),
      'BACKEND_UNAVAILABLE',
      'client-side encryption failed',
    );
  }

  /** @inheritdoc Validates every parameter and the pinned router and token before encrypting. */
  public async buildPayCalldata(p: CtPayParams): Promise<CtTx> {
    const entry = this.#entry(p.chainId);
    const { router, token } = validatePayParams(p);
    assertManifestRouter(entry, router);
    assertManifestToken(entry, token);
    const enc = await this.encryptAmount({ chainId: p.chainId, contract: router, user: p.payer, amount: p.gross });
    return encodePayConfidential(p, enc);
  }

  /** @inheritdoc The token must be pinned and the operator must be the pinned router. */
  public buildSetOperator(p: { chainId: number; token: Address; operator: Address; until: number; nowSec: number }): CtTx {
    const entry = this.#entry(p.chainId);
    const tx = encodeSetOperator(p);
    assertManifestToken(entry, tx.to);
    assertManifestRouter(entry, parseAddress(p.operator, 'operator'), 'operator');
    return tx;
  }

  /** @inheritdoc */
  public async userDecrypt(p: { chainId: number; contract: Address; handle: Hex; signer: StealthSigner }): Promise<bigint> {
    assertCtChain(p.chainId, ID);
    assertHandle(p.handle, 'handle', true);
    const contractAddress = parseAddress(p.contract, 'contract');
    parseAddress(p.signer.address, 'signer');
    if (BigInt(p.handle) === 0n) return 0n;
    return p.signer.withKey((key) =>
      withSession(
        this.#port,
        { chainId: p.chainId, stealthKey: key },
        (s) => s.decryptValue({ handle: p.handle, contractAddress }),
        'DECRYPT_FAILED',
        'user decryption failed',
      ),
    );
  }

  /** @inheritdoc The token must be pinned. */
  public buildConfidentialTransfer(p: { chainId: number; token: Address; to: Address; amountHandle: Hex }): CtTx {
    const entry = this.#entry(p.chainId);
    const tx = encodeConfidentialTransfer(p);
    assertManifestToken(entry, tx.to);
    return tx;
  }

  /** @inheritdoc The token must be pinned. */
  public buildUnwrap(p: { chainId: number; token: Address; from: Address; to: Address; amountHandle: Hex }): CtTx {
    const entry = this.#entry(p.chainId);
    const tx = encodeUnwrap(p);
    assertManifestToken(entry, tx.to);
    return tx;
  }

  /** @inheritdoc Validates the request id and the pinned token before opening a relayer session. */
  public async finalizeUnwrap(p: { chainId: number; token: Address; requestId: Hex }): Promise<CtTx> {
    const entry = this.#entry(p.chainId);
    assertHandle(p.requestId, 'requestId');
    const token = parseNonZeroAddress(p.token, 'token');
    assertManifestToken(entry, token);
    return withSession(
      this.#port,
      { chainId: p.chainId },
      async (s) => {
        const { cleartext, decryptionProof } = await s.decryptPublic(p.requestId);
        return encodeFinalizeUnwrap({ token, requestId: p.requestId, cleartext, decryptionProof });
      },
      'PROOF_UNAVAILABLE',
      'public decryption proof unavailable',
    );
  }
}
