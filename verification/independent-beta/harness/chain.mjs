// W5 independent payment-state verifier: deterministic synthetic EVM chain.
// Original work for verification/independent-beta (UNLICENSED, repository licence). No production code is imported.
//
// The chain is the harness's single source of truth for "what happened on-chain". It is deliberately tiny:
// blocks are numbered from GENESIS, block hashes encode (fork, number) so a reorg changes every hash above the fork
// point, and a transaction is either unknown, in the mempool, mined in a canonical block, or dropped.

export const CHAIN_ID = 84532; // Base Sepolia, the chain the app's E2E fake manifest targets.
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const GENESIS = 500;

const hex = (n) => `0x${n.toString(16)}`;
const pad64 = (s) => s.replace(/^0x/, '').toLowerCase().padStart(64, '0');

/** Deterministic block hash: 8 hex digits of fork id, 56 of block number. */
export function blockHash(fork, number) {
  return `0x${fork.toString(16).padStart(8, '0')}${number.toString(16).padStart(56, '0')}`;
}

export class SyntheticChain {
  constructor() {
    this.fork = 1;
    this.head = GENESIS;
    /** number -> { fork, txs: string[] } for canonical blocks above GENESIS. */
    this.blocks = new Map();
    /** hash -> { params, state: 'mempool'|'mined'|'dropped', block?: number, success: boolean, nonce: number } */
    this.txs = new Map();
    this.nonces = new Map(); // from(lowercase) -> next nonce assigned at submission
    this.log = []; // ordered chain events for the run record
  }

  /** Called by the mock wallet when it broadcasts: the transaction enters the mempool. */
  submit(hash, params) {
    const from = String(params.from ?? '').toLowerCase();
    const nonce = this.nonces.get(from) ?? 0;
    this.nonces.set(from, nonce + 1);
    this.txs.set(hash.toLowerCase(), { params, state: 'mempool', success: true, nonce });
    this.log.push({ op: 'submit', hash, nonce });
  }

  blockFork(number) {
    if (number <= GENESIS) return 0;
    return this.blocks.get(number)?.fork ?? this.fork;
  }

  hashOf(number) {
    return blockHash(this.blockFork(number), number);
  }

  /** Mine one new block containing the given mempool transactions (may be empty). */
  mine(hashes = [], { success = true } = {}) {
    this.head += 1;
    const included = [];
    for (const h of hashes) {
      const tx = this.txs.get(h.toLowerCase());
      if (tx === undefined || tx.state !== 'mempool') continue;
      tx.state = 'mined';
      tx.block = this.head;
      tx.success = success;
      included.push(h.toLowerCase());
    }
    this.blocks.set(this.head, { fork: this.fork, txs: included });
    this.log.push({ op: 'mine', block: this.head, included, success });
    return this.head;
  }

  advance(n) {
    for (let i = 0; i < n; i += 1) this.mine([]);
  }

  /** Remove the newest `depth` blocks; their transactions return to the mempool. New empty blocks replace them. */
  reorg(depth) {
    const floor = Math.max(GENESIS, this.head - depth);
    const oldHead = this.head;
    this.fork += 1;
    const orphaned = [];
    for (let n = floor + 1; n <= oldHead; n += 1) {
      for (const h of this.blocks.get(n)?.txs ?? []) {
        const tx = this.txs.get(h);
        tx.state = 'mempool';
        delete tx.block;
        orphaned.push(h);
      }
      this.blocks.delete(n);
    }
    this.head = floor;
    // Replacement branch is at least as long as the old one so a naive "highest block wins" client still sees it.
    for (let n = floor + 1; n <= oldHead; n += 1) this.mine([]);
    this.log.push({ op: 'reorg', depth, floor, oldHead, orphaned, fork: this.fork });
    return orphaned;
  }

  drop(hash) {
    const tx = this.txs.get(hash.toLowerCase());
    if (tx !== undefined && tx.state === 'mempool') tx.state = 'dropped';
    this.log.push({ op: 'drop', hash });
  }

  /** Ground truth used by the oracle. */
  truth(hash) {
    const tx = this.txs.get(String(hash).toLowerCase());
    if (tx === undefined) return { state: 'unknown' };
    if (tx.state !== 'mined') return { state: tx.state };
    return { state: 'mined', success: tx.success, block: tx.block, confirmations: this.head - tx.block + 1 };
  }

  blockObject(number) {
    if (number > this.head || number < 0) return null;
    const txs = number > GENESIS ? this.blocks.get(number)?.txs ?? [] : [];
    return {
      number: hex(number),
      hash: this.hashOf(number),
      parentHash: this.hashOf(number - 1),
      timestamp: hex(1_760_000_000 + number * 2),
      transactions: txs,
      gasLimit: hex(30_000_000),
      gasUsed: hex(21_000 * txs.length),
      baseFeePerGas: hex(1_000_000),
      miner: `0x${'0'.repeat(40)}`,
      extraData: '0x',
      logsBloom: `0x${'0'.repeat(512)}`,
      transactionsRoot: `0x${'0'.repeat(64)}`,
      stateRoot: `0x${'0'.repeat(64)}`,
      receiptsRoot: `0x${'0'.repeat(64)}`,
      sha3Uncles: `0x${'0'.repeat(64)}`,
      difficulty: '0x0',
      size: '0x100',
      nonce: '0x0000000000000000',
      mixHash: `0x${'0'.repeat(64)}`,
      uncles: [],
    };
  }

  txObject(hash) {
    const tx = this.txs.get(String(hash).toLowerCase());
    if (tx === undefined || tx.state === 'dropped') return null;
    const p = tx.params;
    const mined = tx.state === 'mined';
    return {
      hash: String(hash).toLowerCase(),
      from: String(p.from ?? '').toLowerCase(),
      to: p.to === undefined ? null : String(p.to).toLowerCase(),
      input: p.data ?? p.input ?? '0x',
      value: p.value ?? '0x0',
      gas: p.gas ?? hex(200_000),
      gasPrice: hex(1_000_000_000),
      maxFeePerGas: p.maxFeePerGas ?? hex(2_000_000_000),
      maxPriorityFeePerGas: p.maxPriorityFeePerGas ?? hex(1_000_000),
      nonce: hex(tx.nonce),
      chainId: CHAIN_ID_HEX,
      type: '0x2',
      v: '0x0',
      r: `0x${pad64('1')}`,
      s: `0x${pad64('1')}`,
      yParity: '0x0',
      accessList: [],
      blockNumber: mined ? hex(tx.block) : null,
      blockHash: mined ? this.hashOf(tx.block) : null,
      transactionIndex: mined ? '0x0' : null,
    };
  }

  receiptObject(hash) {
    const tx = this.txs.get(String(hash).toLowerCase());
    if (tx === undefined || tx.state !== 'mined') return null;
    const p = tx.params;
    return {
      transactionHash: String(hash).toLowerCase(),
      transactionIndex: '0x0',
      blockNumber: hex(tx.block),
      blockHash: this.hashOf(tx.block),
      from: String(p.from ?? '').toLowerCase(),
      to: p.to === undefined ? null : String(p.to).toLowerCase(),
      status: tx.success ? '0x1' : '0x0',
      gasUsed: hex(21_000),
      cumulativeGasUsed: hex(21_000),
      effectiveGasPrice: hex(1_000_000_000),
      contractAddress: null,
      logs: [],
      logsBloom: `0x${'0'.repeat(512)}`,
      type: '0x2',
    };
  }

  /** Nonce as an RPC reports it: `latest` counts mined transactions, `pending` also counts the mempool. */
  nonceOf(address, tag) {
    const from = String(address).toLowerCase();
    let n = 0;
    for (const tx of this.txs.values()) {
      if (String(tx.params.from ?? '').toLowerCase() !== from) continue;
      if (tx.state === 'mined' || (tag === 'pending' && tx.state === 'mempool')) n += 1;
    }
    return n;
  }
}
