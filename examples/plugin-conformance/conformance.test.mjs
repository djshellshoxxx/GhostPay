import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginRegistry, applyPrivacySelection } from '../../packages/plugin-api/dist/index.js';

// Reviewed static fixture only. No dynamic imports, URLs or live transport.
const defaults = { delaySeconds: 600, relay: true, batchSize: 8 };
const invoice = { chainId: '31337', asset: 'native', amount: '100', expiresAt: 2_000_000_000 };
const fixture = (hooks) => ({
  manifest: {
    apiVersion: 1, id: 'org.example.fixture', name: 'Offline fixture', version: '1.0.0',
    capabilities: ['privacy:delay'],
    permissions: { network: ['api.example.com'], storage: true, downgrade: true },
  },
  hooks,
});

/** Single-process reference port; deliberately no persistent or transactional claims. */
function memoryPort() {
  const data = new Map();
  return { get: async (key) => data.get(key), set: async (key, value) => { data.set(key, value); }, delete: async (key) => { data.delete(key); }, data };
}

test('reference host intersects grants, revokes contexts and requires downgrade acknowledgement', async () => {
  const storage = memoryPort();
  const registry = new PluginRegistry({ defaults, storage, clock: () => 0 });
  let captured;
  registry.register(fixture({ privacyOptions: async (ctx) => {
    captured = ctx;
    assert.equal(ctx.network, undefined);
    await ctx.storage.set('preference', 'offline');
    return { options: [{ id: 'immediate', kind: 'delay', label: 'Immediate', value: 0, downgrade: true, downgradeReason: 'Less timing separation' }] };
  } }), { storage: true, downgrade: true });
  registry.seal();
  const result = await registry.evaluateInvoice(invoice);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.effective, defaults);
  await assert.rejects(captured.storage.get('preference'), /revoked/);
  const key = 'org.example.fixture/immediate';
  assert.throws(() => applyPrivacySelection(result, { optionKeys: [key], acknowledgedDowngrades: [] }), /selection/);
  assert.equal(applyPrivacySelection(result, { optionKeys: [key], acknowledgedDowngrades: [key] }).settings.delaySeconds, 0);
});

test('concurrent evaluations share one quota and keep every committed storage key indexed', async () => {
  const storage = memoryPort();
  const registry = new PluginRegistry({ defaults, storage });
  let counter = 0;
  registry.register(fixture({ privacyOptions: async (ctx) => { await ctx.storage.set(`k${counter++}`, 'value'); } }), { storage: true });
  const results = await Promise.all(Array.from({ length: 68 }, () => registry.evaluateInvoice(invoice)));
  assert.equal(results.filter((r) => r.failures.length === 0).length, 64);
  assert.equal(JSON.parse(storage.data.get('plugin/org.example.fixture/~index')).length, 64);
});

test('required plugin failure blocks the host and redacts plugin error text', async () => {
  const registry = new PluginRegistry({ defaults });
  registry.register(fixture({ privacyOptions: () => { throw new Error('private fixture value'); } }), {}, { required: true });
  await assert.rejects(registry.evaluateInvoice(invoice), (error) => error.code === 'REQUIRED_PLUGIN_FAILED' && !error.message.includes('private fixture value'));
});
