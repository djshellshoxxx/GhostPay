import type { Address, Hex } from 'viem';
import { NOT_PROTECTED_KEYS } from '../copy.js';
import { assertAmount, encodeConfidentialTransfer, encodeFinalizeUnwrap, encodePayConfidential, encodeSetOperator, encodeUnwrap } from '../calldata.js';
import { assertCtChain, parseAddress } from '../manifest.js';
import { assertHandle } from '../metadata.js';
import type { ConfidentialBackend, CtBackendInfo, CtEncryptedInput, CtPayParams, CtTx, StealthSigner } from '../types.js';
import { CleartextLedger } from './ledger.js';

const ID = 'ctm-cleartext';

/** Static description of CT-M. */
export const CTM_INFO: CtBackendInfo = {
  id: ID,
  chains: [31337],
  trust: 'none',
  maturity: 'test-double',
  licence: 'UNLICENSED (this repository)',
  relayerOrigin: null,
  whatItHides: [],
  whatItDoesNotHide: ['CT_M_NO_PRIVACY', ...NOT_PROTECTED_KEYS],
};

/**
 * CT-M backend: same calldata and semantics as CT-1, executed against an in-memory
 * {@link CleartextLedger} instead of fhEVM. For local development and CI only.
 * @security NO PRIVACY. Refuses every chain except 31337. Never shown in a production UI.
 */
export class CleartextBackend implements ConfidentialBackend {
  public readonly info: CtBackendInfo = CTM_INFO;

  /** @param ledger The simulated chain state shared with the test harness. */
  public constructor(public readonly ledger: CleartextLedger) {}

  /** @inheritdoc */
  public encryptAmount(p: { chainId: number; contract: Address; user: Address; amount: bigint }): Promise<CtEncryptedInput> {
    try {
      assertCtChain(p.chainId, ID);
      assertAmount(p.amount, 'amount', true);
      const { handle, inputProof } = this.ledger.registerInput(parseAddress(p.user, 'user'), parseAddress(p.contract, 'contract'), p.amount);
      return Promise.resolve({ handle, inputProof });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** @inheritdoc */
  public async buildPayCalldata(p: CtPayParams): Promise<CtTx> {
    assertCtChain(p.chainId, ID);
    const enc = await this.encryptAmount({ chainId: p.chainId, contract: p.router, user: p.payer, amount: p.gross });
    return encodePayConfidential(p, { handle: enc.handle, inputProof: enc.inputProof });
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
    const contract = parseAddress(p.contract, 'contract');
    const address = parseAddress(p.signer.address, 'signer');
    // Exercise the same scoped-key path as the real backend so key handling is covered in tests.
    return p.signer.withKey(() => Promise.resolve(this.ledger.userDecrypt(p.handle, address, contract)));
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
  public finalizeUnwrap(p: { chainId: number; token: Address; requestId: Hex }): Promise<CtTx> {
    try {
      assertCtChain(p.chainId, ID);
      assertHandle(p.requestId, 'requestId');
      const { cleartext, proof } = this.ledger.publicDecrypt(p.requestId);
      return Promise.resolve(encodeFinalizeUnwrap({ token: p.token, requestId: p.requestId, cleartext, decryptionProof: proof }));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
