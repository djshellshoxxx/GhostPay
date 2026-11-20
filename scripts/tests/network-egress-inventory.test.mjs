import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const inventory = JSON.parse(readFileSync(resolve(root, 'docs/privacy/network-egress-inventory.json'), 'utf8'));
const sources = new Set(inventory.surfaces.flatMap((surface) => surface.sourcePaths));
const PRESERVED_SURFACE_IDS = [
  'static-assets', 'release-hash', 'bundled-manifest', 'manual-manifest-helper', 'evm-rpc-health', 'evm-deployment-readback',
  'evm-scan-bulk', 'evm-scan-indexer', 'evm-scan-verification', 'evm-secondary-verification', 'evm-payment-preflight',
  'external-wallet-provider', 'evm-payment-status', 'evm-sweep-balance', 'evm-direct-sweep', 'evm-relayer-quote',
  'evm-relayer-submit', 'evm-sweep-status', 'registry-lookup', 'registry-publication', 'policy-account', 'merchant-profile-fetch',
  'merchant-embed', 'btc-esplora-bulk', 'btc-match-proof', 'btc-worker-bridge', 'btc-oracle-bridge', 'btc-sweep', 'solana-rpc',
  'tron-rpc', 'local-invoice-and-qr', 'local-key-and-recovery', 'local-preferences-and-pins', 'external-navigation',
  'wallet-icons', 'workers-without-direct-network', 'absent-network-apis-and-updates',
];
const NETWORK_NAMES = new Set([
  'fetch', 'fetchFn', 'fetchImpl', 'fetcher', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts',
  'Worker', 'SharedWorker', 'serviceWorker', 'boundedRequest', 'authorizedOperationFetch', 'createNetworkAuthority',
  'createClient', 'createHttpRpc', 'createFetchTransport', 'fetchTransport', 'createIndexerSource', 'getRpc', 'getSecondaryRpc',
  'createRpc', 'fetchHttpTransport',
]);
// `authorize` is also a local secret-export function; only member/aliased member use denotes the network API.
const NETWORK_MEMBER_NAMES = new Set([...NETWORK_NAMES, 'authorize']);

// Source-inventory maintenance only: computed names, package internals, browser/extension traffic and actual UI consent
// still require browser/native destination tests and review. Counts detect additions even inside already inventoried files.
function networkReferences(text) {
  const source = ts.createSourceFile('inventory-probe.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const counts = {};
  const aliases = new Map();
  const add = (name) => { counts[name] = (counts[name] ?? 0) + 1; };
  const api = (node) => {
    if (ts.isIdentifier(node)) return NETWORK_NAMES.has(node.text) ? node.text : aliases.get(node.text);
    if (ts.isPropertyAccessExpression(node)) return NETWORK_MEMBER_NAMES.has(node.name.text) ? node.name.text : undefined;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      return NETWORK_MEMBER_NAMES.has(node.argumentExpression.text) ? node.argumentExpression.text : undefined;
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return api(node.expression);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return api(node.left) ?? api(node.right);
    if (ts.isConditionalExpression(node)) return api(node.whenTrue) ?? api(node.whenFalse);
    return undefined;
  };
  const findAliases = (node) => {
    if (ts.isTypeNode(node)) return;
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      if (ts.isIdentifier(node.name)) {
        const name = api(node.initializer);
        if (name !== undefined) aliases.set(node.name.text, name);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const property = element.propertyName ?? element.name;
          if (ts.isIdentifier(property) && NETWORK_MEMBER_NAMES.has(property.text) && ts.isIdentifier(element.name)) aliases.set(element.name.text, property.text);
        }
      }
    }
    ts.forEachChild(node, findAliases);
  };
  findAliases(source);
  const visit = (node) => {
    if (ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) && (NETWORK_NAMES.has(node.text) || (node.text === 'authorize' && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node))) {
      const p = node.parent;
      const declaration = (ts.isParameter(p) || ts.isVariableDeclaration(p) || ts.isPropertySignature(p) ||
        ts.isMethodSignature(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name === node;
      const propertyKey = ts.isPropertyAssignment(p) && p.name === node;
      if (!declaration && !propertyKey) add(`reference:${node.text}`);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && NETWORK_MEMBER_NAMES.has(node.argumentExpression.text)) add(`reference:${node.argumentExpression.text}`);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = api(node.expression);
      if (name !== undefined) add(`call:${name}`);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments?.[0] !== undefined && ts.isStringLiteralLike(node.arguments[0]) && /^(?:https?:)?\/\//.test(node.arguments[0].text)) add('call:remote-import');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}
const referencesNetwork = (text) => Object.keys(networkReferences(text)).length !== 0;

function productionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : productionFiles(path);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !/\.test\.|\.testutil\./.test(entry.name) ? [path] : [];
  });
}

test('network inventory has unique complete records and references existing sources and tests', () => {
  assert.equal(inventory.schemaVersion, 2);
  assert.match(inventory.source.baseCommit, /^[0-9a-f]{40}$/);
  assert.equal(inventory.surfaces.length, 37, 'preserve all original surface IDs; additions require an explicit inventory review');
  assert.equal(new Set(inventory.surfaces.map((surface) => surface.id)).size, inventory.surfaces.length);
  assert.deepEqual(inventory.surfaces.map((surface) => surface.id).sort(), [...PRESERVED_SURFACE_IDS].sort());
  for (const surface of inventory.surfaces) {
    assert.match(surface.id, /^[a-z][a-z0-9-]+$/);
    for (const key of ['trigger', 'destination', 'transport', 'authorization', 'privatePath', 'failureBehavior', 'ownership', 'status', 'endpointSelection', 'redirectBehavior', 'credentialAndReferrerBehavior', 'cancellationSupport', 'deadlineBehavior', 'errorSanitization', 'privacyImplications', 'qualification']) {
      assert.equal(typeof surface[key], 'string', `${surface.id}: ${key}`);
      assert.ok(surface[key].length > 0, `${surface.id}: empty ${key}`);
    }
    assert.equal(typeof surface.automatic, 'boolean', `${surface.id}: automatic`);
    assert.ok(['application-action', 'local-only', 'external-browser-or-wallet'].includes(surface.authority.boundary), `${surface.id}: authority boundary`);
    assert.ok(Array.isArray(surface.authority.actions), `${surface.id}: action list`);
    if (surface.authority.boundary === 'application-action') {
      assert.ok(surface.authority.actions.length > 0, `${surface.id}: no explicit action`);
      assert.ok(['rpc', 'indexer', 'relayer', 'resource'].includes(surface.authority.category));
      assert.ok(['exact', 'prefix'].includes(surface.authority.endpointMatch));
      assert.ok(surface.sourcePaths.includes('apps/web/src/lib/networkAuthorization.ts'));
    }
    assert.ok(surface.testPaths?.length > 0, `${surface.id}: missing automated coverage references`);
    for (const key of ['flows', 'sourcePaths', 'symbols', 'sensitiveData', 'profile']) assert.ok(Array.isArray(surface[key]), `${surface.id}: ${key}`);
    assert.ok(surface.sourcePaths.length > 0, `${surface.id}: no sources`);
    for (const path of [...surface.sourcePaths, ...(surface.testPaths ?? [])]) {
      assert.ok(!path.startsWith('/') && !path.split('/').includes('..'), `${surface.id}: path must be repository-relative`);
      assert.ok(existsSync(resolve(root, path)), `${surface.id}: missing ${path}`);
    }
    assert.ok(surface.profile.length > 0 && surface.profile.every((profile) => ['full', 'lean'].includes(profile)));
  }
});

test('every explicit production web network reference is represented in the inventory', () => {
  const files = [...productionFiles(resolve(root, 'apps/web/src')), ...productionFiles(resolve(root, 'apps/web/public'))];
  assert.ok(files.length > 50, 'source traversal must not be empty');
  const missing = files.filter((path) => referencesNetwork(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path).replaceAll('\\', '/')).filter((path) => !sources.has(path));
  assert.deepEqual(missing, [], 'review and inventory a new network dispatcher before allowing it');
});

test('shipped SDK and transport boundaries are represented, with library-only adapters distinguished', () => {
  for (const path of [
    'packages/net-transport/src/fetchTransport.ts', 'packages/chain-adapters/src/rpc.ts',
    'packages/solana-stealth/src/rpc.ts', 'packages/tron-adapter/src/rpc.ts',
    'packages/btc-silent-payments/src/scan/grpcWebUnary.ts', 'apps/web/src/features/btc/esplora.ts',
  ]) assert.ok(sources.has(path), `missing transport: ${path}`);
  assert.ok(inventory.nonShippedAdapters.some((item) => item.path === 'packages/net-transport/src/fetchAdapter.ts'));
  assert.ok(inventory.policyScopeStatement.includes('static inventory alone is not proof'));
  for (const path of ['apps/web/src/lib/networkAuthorization.ts', 'apps/web/src/lib/networkOperation.ts', 'apps/web/src/lib/boundedRequest.ts']) assert.ok(sources.has(path), `missing action/boundary helper: ${path}`);
});

test('inventory detector recognizes calls and aliases without flagging type declarations or comments', () => {
  for (const text of ['fetch("/")', 'const send = globalThis.fetch', 'service.fetchFn("/")', 'new WebSocket("wss://invalid")', 'self["fetch"]("/")', 'const send = globalThis.fetch; send("/")', 'const { fetch: send } = window; send("/")', 'boundedRequest(sender, url, init, options)', 'network.authorize(action)', 'authorizedOperationFetch(services, requests)', 'app.getRpc(chain, action)', 'import("https://remote.test/module.js")', 'navigator.serviceWorker.register("/worker.js")']) {
    assert.equal(referencesNetwork(text), true, text);
  }
  for (const text of ['type F = typeof fetch;', 'interface Service { fetchFn: typeof fetch; }', '// fetch("/")', 'const text = "fetch";', 'function authorize() {} authorize();']) {
    assert.equal(referencesNetwork(text), false, text);
  }
});


function referenceSnapshot() {
  const files = new Set([
    ...productionFiles(resolve(root, 'apps/web/src')),
    ...productionFiles(resolve(root, 'apps/web/public')),
    ...[...sources].filter((path) => path.startsWith('packages/') && /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path)).map((path) => resolve(root, path)),
  ]);
  return Object.fromEntries([...files].sort().flatMap((path) => {
    const refs = networkReferences(readFileSync(path, 'utf8'));
    return Object.keys(refs).length === 0 ? [] : [[relative(root, path).replaceAll('\\', '/'), refs]];
  }));
}

const currentReferences = referenceSnapshot();
// Maintenance command after reviewing each changed surface:
// node scripts/tests/network-egress-inventory.test.mjs --refresh-reference-counts
// This refreshes only counts, never surface records or assertions; missing source ownership still fails below.
if (process.argv.includes('--refresh-reference-counts')) {
  inventory.networkReferenceCounts = currentReferences;
  writeFileSync(resolve(root, 'docs/privacy/network-egress-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
}

test('reference counts detect new dispatchers inside known modules as well as new files', () => {
  assert.deepEqual(currentReferences, inventory.networkReferenceCounts, 'network references changed: review dispatch authority and refresh the documented snapshot');
  for (const path of Object.keys(currentReferences)) assert.ok(sources.has(path), `network references have no surface record: ${path}`);
  const one = networkReferences('fetch("/a")');
  const two = networkReferences('fetch("/a"); fetch("/b")');
  assert.equal(one['call:fetch'], 1);
  assert.equal(two['call:fetch'], 2);
  assert.equal(networkReferences('const send = globalThis.fetch; send("/a"); send("/b");')['call:fetch'], 2);
});

test('inventoried authorization actions exist and local/external operations gain no implicit grant', () => {
  const text = readFileSync(resolve(root, 'apps/web/src/lib/networkAuthorization.ts'), 'utf8');
  const source = ts.createSourceFile('networkAuthorization.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === 'NetworkAction');
  assert.ok(declaration !== undefined && ts.isUnionTypeNode(declaration.type));
  const actions = new Set(declaration.type.types.filter(ts.isLiteralTypeNode).map((node) => node.literal.text));
  for (const surface of inventory.surfaces) {
    for (const action of surface.authority.actions) assert.ok(actions.has(action), `${surface.id}: unknown action ${action}`);
    if (surface.authority.boundary !== 'application-action') assert.deepEqual(surface.authority.actions, [], `${surface.id}: external/local operation must not be assigned app network authority`);
  }
});
