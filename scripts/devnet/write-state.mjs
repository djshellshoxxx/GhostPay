#!/usr/bin/env node
// Extracts devnet contract + token addresses from the forge broadcast into scripts/devnet/.state/devnet.json.
// Usage: write-state.mjs <broadcast run-latest.json> <out.json> <rpcUrl>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , bPath, out, rpc] = process.argv;
if (!bPath || !out || !rpc) {
  console.error('usage: write-state.mjs <broadcast> <out> <rpcUrl>');
  process.exit(1);
}
const b = JSON.parse(readFileSync(bPath, 'utf8'));
const creates = b.transactions.filter((t) => t.transactionType === 'CREATE');
const one = (name, pred = () => true) => {
  const t = creates.filter((x) => x.contractName === name && pred(x));
  if (t.length !== 1) throw new Error(`expected one ${name}, found ${t.length}`);
  return t[0].contractAddress;
};
const tokenBySymbol = (name, symbol) => one(name, (x) => x.arguments?.[1] === `"${symbol}"` || x.arguments?.[1] === symbol);
const state = {
  rpcUrl: rpc,
  chainId: 31337,
  announcer: one('ERC5564Announcer'),
  router: one('GhostPayRouter'),
  sweepRelayer: one('GhostPaySweepRelayer'),
  tokens: {
    USDC: { address: tokenBySymbol('DevPermitStablecoin', 'USDC'), decimals: 6, permit: true, name: 'Devnet USD Coin' },
    DAI: { address: tokenBySymbol('DevPermitStablecoin', 'DAI'), decimals: 18, permit: true, name: 'Devnet Dai' },
    USDT: { address: one('DevPlainStablecoin'), decimals: 6, permit: false, name: 'Devnet Tether USD' },
  },
  // Public anvil mnemonic accounts (local only). Indices follow `anvil` default listing.
  accounts: {
    deployer: 0,
    feeRecipient: 1,
    payer: 2,
    relayerHot: 3,
    sellerFunder: 4,
  },
};
writeFileSync(out, `${JSON.stringify(state, null, 2)}\n`);
console.error(`wrote ${out}`);
