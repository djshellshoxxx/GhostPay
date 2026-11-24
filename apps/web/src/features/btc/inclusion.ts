import { SilentPaymentError, verifyTxOutputProof, type HeaderChain, type ReceivedOutput } from '@ghostpay/btc-silent-payments';
import type { EsploraClient } from './esplora';

/** Never accept an oracle-reported match without proving its exact output against a locally checked header. */
export async function verifyMatchedOutput(client: EsploraClient, headers: HeaderChain, output: ReceivedOutput, signal?: AbortSignal): Promise<true> {
  const expected = headers.hashAt(output.height);
  if (expected === undefined || expected !== output.blockHash) throw new SilentPaymentError('REORG_DETECTED');
  if (output.txid === undefined || output.vout === undefined || output.amountSats === undefined) throw new SilentPaymentError('INVALID_RESPONSE');
  const [rawTransactionHex, merkle, headerHex] = await Promise.all([
    client.rawTransaction(output.txid, signal), client.merkleProof(output.txid, signal), client.blockHeader(expected, signal),
  ]);
  if (signal?.aborted === true) throw new SilentPaymentError('ABORTED');
  if (headers.hashAt(output.height) !== expected) throw new SilentPaymentError('REORG_DETECTED');
  return verifyTxOutputProof({ rawTransactionHex, txid: output.txid, vout: output.vout, amountSats: output.amountSats,
    xOnlyPublicKey: output.xOnlyPublicKey, expectedBlockHash: expected, expectedHeight: output.height, headerHex, merkle });
}
