import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Absolute path of a file in `test-vectors/`. */
export function vectorPath(name: string): string {
  return fileURLToPath(new URL(`../../btc-silent-payments/test-vectors/${name}`, import.meta.url));
}

export function readVectorText(name: string): string {
  return readFileSync(vectorPath(name), 'utf8');
}

export interface VinJson {
  txid: string;
  vout: number;
  scriptSig: string;
  txinwitness: string;
  prevout: { scriptPubKey: { hex: string } };
  private_key?: string;
}

export interface RecipientJson {
  address: string;
  scan_pub_key: string;
  spend_pub_key: string;
  count?: number;
}

export interface SendingJson {
  given: { vin: VinJson[]; recipients: RecipientJson[] };
  expected: {
    outputs: string[][];
    shared_secrets: (string | null)[];
    input_private_key_sum?: string;
    input_pub_keys: string[];
  };
}

export interface ReceivedOutputJson {
  priv_key_tweak: string;
  pub_key: string;
  signature: string;
}

export interface ReceivingJson {
  given: {
    vin: VinJson[];
    outputs: string[];
    key_material: { spend_priv_key: string; scan_priv_key: string };
    labels: number[];
  };
  expected: {
    addresses: string[];
    outputs?: ReceivedOutputJson[];
    n_outputs?: number;
    tweak: string | null;
    shared_secret: string | null;
    input_pub_key_sum?: string;
  };
}

export interface CaseJson {
  comment: string;
  sending: SendingJson[];
  receiving: ReceivingJson[];
}

export function loadSendReceiveVectors(): CaseJson[] {
  return JSON.parse(readVectorText('send_and_receive_test_vectors.json')) as CaseJson[];
}
