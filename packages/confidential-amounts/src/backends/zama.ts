import type { Address, Hex } from 'viem';
import { NOT_PROTECTED_KEYS } from '../copy.js';
import { assertAmount, encodeConfidentialTransfer, encodeFinalizeUnwrap, encodePayConfidential, encodeSetOperator, encodeUnwrap } from '../calldata.js';
import { CtError } from '../errors.js';
import { assertCtChain, manifestForChain, parseAddress } from '../manifest.js';
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
 * CT-1 backend: Zama fhEVM + OpenZeppelin ERC-7984 on Ethereum Sepolia (31337 for the local mock).
 * Calldata building is pure and tested offline; encryption and decryption go through a
 * {@link ZamaSdkPort}, whose default implementation (`createZamaSdkPort`) has NOT been run against
 * a live relayer [UNVERIFIED].
 * @security Plaintext amounts are only passed to the local SDK encryptor. User-decrypt contacts the
 * hosted relayer with the stealth address, the handle and your network address; one stealth address
 * per request (CT-DEC-1), scheduled with `DecryptScheduler` (CT-DEC-2).
 */
export class ZamaBackend implements ConfidentialBackend {
  public readonly info: CtBackendInfo = CT1_INFO;
  readonly #port: ZamaSdkPort;

  /** @param port SDK access; default none (calldata builders still work). */
  public constructor(port: ZamaSdkPort) {
    this.#port = port;
  }

  /** @inheritdoc */
  public async encryptAmount(p: { chainId: number; contract: Address; user: Address; amount: bigint }): Promise<CtEncryptedInput> {
    assertCtChain(p.chainId, ID);
    manifestForChain(p.chainId);
    assertAmount(p.amount, 'amount', true);
    const contractAddress = parseAddress(p.contract, 'contract');
    const userAddress = parseAddress(p.user, 'user');
    const session = await this.#port.open({ chainId: p.chainId });
    try {
      return await session.encrypt({ contractAddress, userAddress, value: p.amount });
    } finally {
      session.close();
    }
  }

  /** @inheritdoc */
  public async buildPayCalldata(p: CtPayParams): Promise<CtTx> {
    assertCtChain(p.chainId, ID);
    manifestForChain(p.chainId);
    const enc = await this.encryptAmount({ chainId: p.chainId, contract: p.router, user: p.payer, amount: p.gross });
    return encodePayConfidential(p, enc);
  }

  /** @inheritdoc */
  public buildSetOperator(p: { chainId: number; token: Address; operator: Address; until: number; nowSec: number }): CtTx {
    assertCtChain(p.chainId, ID);
    return encodeSetOperator(p);
  }

  /** @inheritdoc */
  public async userDecrypt(p: { chainId: number; contract: Address; handle: Hex; signer: StealthSigner }): Promise<bigint> {
    assertCtChain(p.chainId, ID);
    assertHandle(p.handle, 'handle');
    const contractAddress = parseAddress(p.contract, 'contract');
    parseAddress(p.signer.address, 'signer');
    if (BigInt(p.handle) === 0n) return 0n;
    return p.signer.withKey(async (key) => {
      const session = await this.#port.open({ chainId: p.chainId, stealthKey: key });
      try {
        return await session.decryptValue({ handle: p.handle, contractAddress });
      } catch (e) {
        if (e instanceof CtError) throw e;
        throw new CtError('DECRYPT_FAILED', 'user decryption failed');
      } finally {
        session.close();
      }
    });
  }

  /** @inheritdoc */
  public buildConfidentialTransfer(p: { chainId: number; token: Address; to: Address; amountHandle: Hex }): CtTx {
    assertCtChain(p.chainId, ID);
    return encodeConfidentialTransfer(p);
  }

  /** @inheritdoc */
  public buildUnwrap(p: { chainId: number; token: Address; from: Address; to: Address; amountHandle: Hex }): CtTx {
    assertCtChain(p.chainId, ID);
    return encodeUnwrap(p);
  }

  /** @inheritdoc */
  public async finalizeUnwrap(p: { chainId: number; token: Address; requestId: Hex }): Promise<CtTx> {
    assertCtChain(p.chainId, ID);
    assertHandle(p.requestId, 'requestId');
    const session = await this.#port.open({ chainId: p.chainId });
    try {
      const { cleartext, decryptionProof } = await session.decryptPublic(p.requestId);
      return encodeFinalizeUnwrap({ token: p.token, requestId: p.requestId, cleartext, decryptionProof });
    } catch (e) {
      if (e instanceof CtError) throw e;
      throw new CtError('PROOF_UNAVAILABLE', 'public decryption proof unavailable');
    } finally {
      session.close();
    }
  }
}
