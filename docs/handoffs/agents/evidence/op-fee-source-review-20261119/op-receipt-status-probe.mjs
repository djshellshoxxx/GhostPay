import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = '/workspace/scratch/6eafdb04d91b/GhostPay-op-fees';
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');
const { createPublicClient, createWalletClient, custom, defineChain, toHex } = await import(pathToFileURL(require.resolve('viem')).href);
const current = '0aef3a254da123c4ec2d873bc0490cf22c739709';
const prior = 'a6bcaf38c4aa1f1dfc21e593816b4ac1a980ab1e';
const output = { kind: 'read-only-source-probe-not-package-qualification', node: process.version, viem: require('viem/package.json').version, cases: [] };
const hash = `0x${'ab'.repeat(32)}`;
const block = `0x${'cd'.repeat(32)}`;
const account = { address: '0x0000000000000000000000000000000000000001', type: 'json-rpc' };
const chain = defineChain({ id: 84532, name: 'local fake', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://unused.invalid'] } } });

for (const revision of [prior, current]) {
  const local = join(here, 'op-receipt-status-probe', revision);
  mkdirSync(local, { recursive: true });
  writeFileSync(join(local, 'package.json'), '{"type":"module"}\n');
  if (!existsSync(join(local, 'node_modules'))) symlinkSync(join(repo, 'node_modules'), join(local, 'node_modules'), 'dir');
  const sourceHashes = {};
  for (const name of revision === current ? ['chain', 'errors', 'opFees'] : ['chain', 'errors']) {
    const source = execFileSync('git', ['-C', repo, 'show', `${revision}:apps/relayer/src/${name}.ts`], { encoding: 'utf8' });
    sourceHashes[name] = createHash('sha256').update(source).digest('hex');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    writeFileSync(join(local, `${name}.js`), compiled.outputText);
  }
  const { createViemChainClient } = await import(pathToFileURL(join(local, 'chain.js')).href);
  for (const rpcStatus of ['0x1', undefined, '0x2', '0x02']) {
    const methods = [];
    const transport = custom({ request: async ({ method }) => {
      methods.push(method);
      if (method === 'eth_call') return toHex(10n, { size: 32 });
      if (method === 'eth_getTransactionReceipt') return {
        transactionHash: hash, blockHash: block, blockNumber: '0x10',
        ...(rpcStatus === undefined ? {} : { status: rpcStatus }),
        gasUsed: '0x186a0', effectiveGasPrice: '0x3b9aca00', logs: [],
        transactionIndex: '0x0', cumulativeGasUsed: '0x186a0', l1Fee: '0x64',
      };
      throw new Error('Unexpected fake method');
    } }, { retryCount: 0 });
    const client = createViemChainClient({ publicClient: createPublicClient({ chain, transport }), walletClient: createWalletClient({ chain, transport, account }), account, chain });
    try {
      const receipt = await client.getReceipt(hash);
      output.cases.push({ revision, sourceHashes, inputStatus: rpcStatus ?? 'missing', result: receipt, resultStatusType: typeof receipt?.status, methods });
    } catch (error) {
      output.cases.push({ revision, sourceHashes, inputStatus: rpcStatus ?? 'missing', error: error.message, methods });
    }
  }
}
const data = JSON.stringify(output, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';
writeFileSync(join(here, 'op-receipt-status-probe.json'), data);
console.log(data);
