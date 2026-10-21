// Generates policy-scheme.json (scheme 0x47500002) from fixed TEST-ONLY keys. Run from the repo root:
//   node test-vectors/generate-policy-scheme.mjs
// Expected values come ONLY from independent sources, never from @ghostpay/policy-scheme:
//   - owner EOA / ephemeral key / view tag / owner private key: @scopelift/stealth-address-sdk
//     (scheme-1 maths, loaded through Vite's SSR loader exactly like generate.mjs);
//   - abi.encode, keccak256, CREATE/CREATE2 addresses, EIP-712 digests and signatures: viem
//     (`encodeAbiParameters`, `getContractAddress`, `hashTypedData`, `privateKeyToAccount().signTypedData`);
//   - the limits merkle tree: the small OpenZeppelin-StandardMerkleTree re-implementation below,
//     written separately from the package code.
// The deployment addresses are CREATE(deployer, nonce 0 / 1) of DEPLOYER_KEY on a fresh chain 31337:
// packages/policy-scheme/src/anvil.test.ts deploys the real contracts with that key and checks every
// predicted account address, typehash and domain separator in this file against them.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readVersion = (name) => JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;
const h32 = (n) => '0x' + n.toString(16).padStart(64, '0');
const toBytes = (hex) => Uint8Array.from(hex.slice(2).match(/../g).map((b) => parseInt(b, 16)));
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const MAX = 2n ** 256n - 1n;

// TEST-ONLY keys and addresses. Public in this repository; never use them for anything real.
const DEPLOYER_KEY = h32(0xc1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1n);
const CHAIN_ID = 31337;
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const NATIVE = '0x0000000000000000000000000000000000000000';
const DEST_A = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const DEST_B = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const TREES = [
  { id: 'tree-1', note: 'single unlimited native leaf (root == leaf, empty proof)', limits: [{ token: NATIVE, limit: MAX, windowSeconds: 0n }] },
  { id: 'tree-2', note: 'two leaves', limits: [{ token: NATIVE, limit: 10n ** 18n, windowSeconds: 86400n }, { token: USDC, limit: 5_000_000_000n, windowSeconds: 604800n }] },
  { id: 'tree-3', note: 'three leaves (unbalanced)', limits: [{ token: NATIVE, limit: 1n, windowSeconds: 1n }, { token: USDC, limit: MAX, windowSeconds: 0n }, { token: DAI, limit: 10n ** 21n, windowSeconds: 2n ** 64n - 1n }] },
  {
    id: 'tree-5',
    note: 'five leaves, extreme values',
    limits: [
      { token: NATIVE, limit: 3n * 10n ** 18n, windowSeconds: 3600n },
      { token: USDC, limit: 1_000_000n, windowSeconds: 60n },
      { token: DAI, limit: MAX - 1n, windowSeconds: 1n },
      { token: WETH, limit: MAX, windowSeconds: 12345n },
      { token: DEST_B, limit: 7n, windowSeconds: 7n },
    ],
  },
];

const ACCOUNTS = [
  { id: 'acct-001', spend: h32(0x1111111111111111111111111111111111111111111111111111111111111111n), view: h32(0x2222222222222222222222222222222222222222222222222222222222222222n), eph: h32(0x3333333333333333333333333333333333333333333333333333333333333333n), policy: { destination: DEST_A, delaySeconds: 86400n, tree: 'tree-2' } },
  { id: 'acct-002', spend: h32(1n), view: h32(2n), eph: h32(3n), policy: { destination: DEST_B, delaySeconds: 3600n, tree: null } },
  { id: 'acct-003', spend: h32(N - 1n), view: h32(N - 2n), eph: h32(N - 3n), policy: { destination: DEST_A, delaySeconds: 2592000n, tree: 'tree-5' } },
  { id: 'acct-004', spend: h32(0xdeadbeefn), view: h32(0xcafebaben), eph: h32(0xfeedfacen), policy: { destination: DEST_B, delaySeconds: 7200n, tree: 'tree-1' } },
];

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  ssr: { noExternal: ['@scopelift/stealth-address-sdk'] },
});
try {
  const sdk = await server.ssrLoadModule('@scopelift/stealth-address-sdk');
  const { secp256k1 } = await server.ssrLoadModule('@noble/curves/secp256k1.js');
  const viem = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { encodeAbiParameters, keccak256, concat, getContractAddress, hashTypedData, toHex, getAddress } = viem;
  const { generateStealthAddress, checkStealthAddress, computeStealthKey, VALID_SCHEME_ID } = sdk;
  const pub = (priv) => '0x' + Buffer.from(secp256k1.getPublicKey(toBytes(priv), true)).toString('hex');
  const enc = (types, values) => encodeAbiParameters(types.map((type) => ({ type })), values);

  // --- limits trees (independent StandardMerkleTree re-implementation) ---
  const leafOf = (l) => keccak256(keccak256(enc(['address', 'uint256', 'uint64'], [l.token, l.limit, l.windowSeconds])));
  const pair = (a, b) => keccak256(concat(BigInt(a) < BigInt(b) ? [a, b] : [b, a]));
  const trees = TREES.map((t) => {
    const leaves = t.limits.map((l) => ({ ...l, leaf: leafOf(l) })).sort((a, b) => (BigInt(a.leaf) < BigInt(b.leaf) ? -1 : 1));
    const nodes = new Array(2 * leaves.length - 1);
    leaves.forEach((l, i) => (nodes[nodes.length - 1 - i] = l.leaf));
    for (let i = nodes.length - 1 - leaves.length; i >= 0; i--) nodes[i] = pair(nodes[2 * i + 1], nodes[2 * i + 2]);
    const proofOf = (i) => {
      const p = [];
      for (let k = nodes.length - 1 - i; k > 0; k = Math.floor((k - 1) / 2)) p.push(nodes[k % 2 === 1 ? k + 1 : k - 1]);
      return p;
    };
    const entries = leaves.map((l, i) => {
      const proof = proofOf(i);
      let h = l.leaf;
      for (const s of proof) h = pair(h, s);
      if (h !== nodes[0]) throw new Error(`proof self-check failed ${t.id}`);
      return { token: l.token, limit: l.limit.toString(), windowSeconds: l.windowSeconds.toString(), leaf: l.leaf, proof };
    });
    return { id: t.id, note: t.note, root: nodes[0], tree: nodes, leaves: entries };
  });
  const treeById = Object.fromEntries(trees.map((t) => [t.id, t]));

  // --- deployment (CREATE addresses of the deployer's first two transactions) ---
  const deployer = privateKeyToAccount(DEPLOYER_KEY).address;
  const implementation = getContractAddress({ from: deployer, nonce: 0n });
  const factory = getContractAddress({ from: deployer, nonce: 1n });
  const initCode = concat(['0x3d602d80600a3d3981f3363d3d373d3d3d363d73', implementation, '0x5af43d82803e903d91602b57fd5bf3']);
  const initCodeHash = keccak256(initCode);

  const typeStr = {
    Withdraw: 'Withdraw(address token,uint256 amount,uint256 deadline,uint256 nonce,bytes32 limitLeafHash)',
    CancelWithdraw: 'CancelWithdraw(bytes32 id)',
    ProposeDestination: 'ProposeDestination(address newDestination,uint256 deadline,uint256 nonce)',
    CancelDestination: 'CancelDestination(bytes32 id)',
  };
  const typehashes = Object.fromEntries(Object.entries(typeStr).map(([k, v]) => [k, keccak256(toHex(v))]));
  const types = {
    Withdraw: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'limitLeafHash', type: 'bytes32' },
    ],
    CancelWithdraw: [{ name: 'id', type: 'bytes32' }],
    ProposeDestination: [
      { name: 'newDestination', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
    CancelDestination: [{ name: 'id', type: 'bytes32' }],
  };

  const ZERO = '0x' + '00'.repeat(32);
  const accounts = [];
  const withdraws = [];
  for (const c of ACCOUNTS) {
    const spendingPublicKey = pub(c.spend);
    const viewingPublicKey = pub(c.view);
    const s1meta = 'st:eth:' + spendingPublicKey + viewingPublicKey.slice(2);
    const out = generateStealthAddress({ stealthMetaAddressURI: s1meta, schemeId: VALID_SCHEME_ID.SCHEME_ID_1, ephemeralPrivateKey: toBytes(c.eph) });
    if (!checkStealthAddress({ ephemeralPublicKey: out.ephemeralPublicKey, schemeId: VALID_SCHEME_ID.SCHEME_ID_1, spendingPublicKey, userStealthAddress: out.stealthAddress, viewingPrivateKey: c.view, viewTag: out.viewTag })) {
      throw new Error(`SDK self-check failed ${c.id}`);
    }
    const ownerPrivateKey = computeStealthKey({ ephemeralPublicKey: out.ephemeralPublicKey, schemeId: VALID_SCHEME_ID.SCHEME_ID_1, spendingPrivateKey: c.spend, viewingPrivateKey: c.view });
    const ownerSigner = privateKeyToAccount(ownerPrivateKey);
    if (ownerSigner.address !== getAddress(out.stealthAddress)) throw new Error(`owner key mismatch ${c.id}`);
    const tree = c.policy.tree === null ? null : treeById[c.policy.tree];
    const limitsRoot = tree === null ? ZERO : tree.root;
    const policyHash = keccak256(enc(['address', 'uint256', 'bytes32'], [c.policy.destination, c.policy.delaySeconds, limitsRoot]));
    const salt = keccak256(enc(['address', 'bytes32'], [out.stealthAddress, policyHash]));
    const accountAddress = getContractAddress({ opcode: 'CREATE2', from: factory, salt, bytecodeHash: initCodeHash });
    accounts.push({
      id: c.id,
      spendingPrivateKey: c.spend,
      viewingPrivateKey: c.view,
      ephemeralPrivateKey: c.eph,
      spendingPublicKey,
      viewingPublicKey,
      scheme1MetaAddress: s1meta,
      metaAddress: 'st:eth:gp2:' + spendingPublicKey + viewingPublicKey.slice(2) + policyHash.slice(2),
      policy: { destination: c.policy.destination, delaySeconds: c.policy.delaySeconds.toString(), limitsRoot, tree: c.policy.tree },
      policyHash,
      ephemeralPublicKey: out.ephemeralPublicKey,
      viewTag: out.viewTag,
      ownerAddress: getAddress(out.stealthAddress),
      ownerPrivateKey,
      salt,
      accountAddress,
    });

    // --- EIP-712 orders for this account ---
    const domain = { name: 'GhostPayPolicyAccount', version: '1', chainId: CHAIN_ID, verifyingContract: accountAddress };
    const domainSeparator = keccak256(
      enc(['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'], [keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')), keccak256(toHex('GhostPayPolicyAccount')), keccak256(toHex('1')), BigInt(CHAIN_ID), accountAddress]),
    );
    const leafEntry = tree === null ? null : tree.leaves.find((l) => l.token === NATIVE);
    const amount = leafEntry === null || leafEntry === undefined || BigInt(leafEntry.limit) === MAX ? 10n ** 15n : BigInt(leafEntry.limit) < 10n ** 15n ? BigInt(leafEntry.limit) : 10n ** 15n;
    const w = { token: NATIVE, amount, deadline: 2n ** 40n, nonce: BigInt(accounts.length) * 1000n + 7n, limitLeafHash: leafEntry ? leafEntry.leaf : ZERO };
    const wStruct = keccak256(enc(['bytes32', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'], [typehashes.Withdraw, w.token, w.amount, w.deadline, w.nonce, w.limitLeafHash]));
    const wDigest = hashTypedData({ domain, types, primaryType: 'Withdraw', message: w });
    if (wDigest !== keccak256(concat(['0x1901', domainSeparator, wStruct]))) throw new Error('digest cross-check');
    const cw = { id: wStruct };
    const pd = { newDestination: c.policy.destination === DEST_A ? DEST_B : DEST_A, deadline: 2n ** 40n, nonce: w.nonce + 1n };
    const pdStruct = keccak256(enc(['bytes32', 'address', 'uint256', 'uint256'], [typehashes.ProposeDestination, pd.newDestination, pd.deadline, pd.nonce]));
    const cd = { id: pdStruct };
    const sign = (primaryType, message) => ownerSigner.signTypedData({ domain, types, primaryType, message });
    withdraws.push({
      account: c.id,
      accountAddress,
      chainId: CHAIN_ID,
      domainSeparator,
      withdraw: { message: { ...w, amount: w.amount.toString(), deadline: w.deadline.toString(), nonce: w.nonce.toString() }, limitProof: leafEntry ? { limit: leafEntry.limit, windowSeconds: leafEntry.windowSeconds, proof: leafEntry.proof } : { limit: '0', windowSeconds: '0', proof: [] }, structHash: wStruct, digest: wDigest, signature: await sign('Withdraw', w) },
      cancelWithdraw: { message: cw, structHash: keccak256(enc(['bytes32', 'bytes32'], [typehashes.CancelWithdraw, cw.id])), digest: hashTypedData({ domain, types, primaryType: 'CancelWithdraw', message: cw }), signature: await sign('CancelWithdraw', cw) },
      proposeDestination: { message: { ...pd, deadline: pd.deadline.toString(), nonce: pd.nonce.toString() }, structHash: pdStruct, digest: hashTypedData({ domain, types, primaryType: 'ProposeDestination', message: pd }), signature: await sign('ProposeDestination', pd) },
      cancelDestination: { message: cd, structHash: keccak256(enc(['bytes32', 'bytes32'], [typehashes.CancelDestination, cd.id])), digest: hashTypedData({ domain, types, primaryType: 'CancelDestination', message: cd }), signature: await sign('CancelDestination', cd) },
    });
  }

  const doc = {
    description: 'GhostPay scheme 0x47500002 (policy-guarded stealth account) vectors. Keys are TEST-ONLY and public.',
    generatedAt: new Date().toISOString().slice(0, 10),
    generator: 'test-vectors/generate-policy-scheme.mjs',
    provenance: {
      sdk: '@scopelift/stealth-address-sdk',
      sdkVersion: readVersion('@scopelift/stealth-address-sdk'),
      viemVersion: readVersion('viem'),
      nobleCurvesVersion: readVersion('@noble/curves'),
      node: process.version,
      contracts: 'packages/contracts/src/PolicyAccount.sol, PolicyAccountFactory.sol (OpenZeppelin 5.6.1 Clones)',
    },
    schemeId: '0x47500002',
    deployment: { chainId: CHAIN_ID, deployerPrivateKey: DEPLOYER_KEY, deployer, implementation, factory, cloneInitCodeHash: initCodeHash, note: 'implementation = CREATE(deployer, 0), factory = CREATE(deployer, 1) with constructor (implementation, 0x0, 0, feeRecipient)' },
    typeStrings: typeStr,
    typehashes,
    limitTrees: trees.map((t) => ({ ...t })),
    invalidTrees: [
      { note: 'duplicate token', limits: [{ token: USDC, limit: '1', windowSeconds: '1' }, { token: USDC.toLowerCase(), limit: '2', windowSeconds: '1' }], error: 'DUPLICATE_TOKEN' },
      { note: 'empty', limits: [], error: 'EMPTY_TREE' },
      { note: 'limited leaf with zero window', limits: [{ token: USDC, limit: '5', windowSeconds: '0' }], error: 'INVALID_LIMIT' },
      { note: 'zero limit', limits: [{ token: USDC, limit: '0', windowSeconds: '5' }], error: 'INVALID_LIMIT' },
      { note: 'window above uint64', limits: [{ token: USDC, limit: '5', windowSeconds: (2n ** 64n).toString() }], error: 'INVALID_LIMIT' },
    ],
    accounts,
    orders: withdraws,
  };
  const json = JSON.stringify(doc, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
  writeFileSync(resolve(here, 'policy-scheme.json'), json);
  console.log(`wrote ${accounts.length} accounts, ${trees.length} trees`);
} finally {
  await server.close();
}
