// Independent fixture encoder + Keccak implementation; no GhostPay source imports.
// Uses keccak 3.0.4 already present in the root lockfile (not a runtime dependency).
const assert = require('node:assert/strict');
const createKeccak = require('keccak/js');
const fields = [
  [1, '0000000000000001'], [2, '61'], [3, '0000000000000001'], [4, '00'.repeat(32)],
  [5, '0000000000000000'], [6, '0000000000000001'], [7, '0000000000000002'],
  [0x30, '61'], [0x31, '62'], [0x32, '00'.repeat(31) + '01'],
];
const bytes = Buffer.concat(fields.map(([tag, hex]) => {
  const value = Buffer.from(hex, 'hex');
  const head = Buffer.alloc(5); head[0] = tag; head.writeUInt32BE(value.length, 1);
  return Buffer.concat([head, value]);
}));
const digest = createKeccak('keccak256').update(Buffer.concat([
  Buffer.from('GhostPay.MerchantMultisig.Proposal.v1\0', 'utf8'), bytes,
])).digest('hex');
assert.equal(digest, '6b85df017eb9fec758ca2ee681b5cf237dfe5c176f6a25cddc6b141dee88c208');
console.log(JSON.stringify({ bytes: bytes.toString('hex'), digest, verifiedBy: 'keccak@3.0.4 JavaScript implementation' }));
