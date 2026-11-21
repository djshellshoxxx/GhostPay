// F04/F05/F10 are preserved M1 source, not enabled application features.
// Pending dependency inventory does not admit imports from production consumers.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../../apps/web/src/', import.meta.url));
const DIRECTORIES = ['merchant-dashboard', 'ghostproof', 'private-recurring']
  .map((name) => `features/future/${name}/`);
const PACKAGES = ['@ghostpay/ux-receipts', '@ghostpay/merchant-billing', '@ghostpay/merchant-hooks'];
const localPath = (file) => relative(SRC, file).split('\\').join('/');
const isDormant = (file) => DIRECTORIES.some((prefix) =>
  localPath(file) === prefix.slice(0, -1) || localPath(file).startsWith(prefix));

function productionSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return productionSources(file);
    return /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(?:test|testutil)\./.test(entry.name) && !localPath(file).startsWith('test/') ? [file] : [];
  });
}

function blockedImports(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  assert.equal(source.parseDiagnostics.length, 0, `Cannot inspect malformed source: ${localPath(file)}`);
  const blocked = [];
  const check = (literal) => {
    if (!literal || !ts.isStringLiteralLike(literal)) {
      blocked.push('<nonliteral module import requires review>');
      return;
    }
    const spec = literal.text;
    const forbiddenPackage = PACKAGES.some((name) => spec === name || spec.startsWith(`${name}/`));
    const forbiddenPath = spec.startsWith('.') && isDormant(resolve(dirname(file), spec));
    if (forbiddenPackage || forbiddenPath) blocked.push(spec);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) check(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      check(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      check(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return blocked;
}

test('production imports keep the three dormant M1 modules and their new dependencies disconnected', () => {
  for (const prefix of DIRECTORIES) {
    assert.ok(productionSources(join(SRC, prefix)).length > 0, `Missing preserved module: ${prefix}`);
  }
  const sources = productionSources(SRC).filter((file) => !isDormant(file));
  assert.ok(sources.length > 100, 'Expected to inspect the full production source tree');
  const violations = sources.flatMap((file) => blockedImports(file, readFileSync(file, 'utf8'))
    .map((spec) => `${localPath(file)} imports ${spec}`));
  assert.deepEqual(violations, []);
});

test('isolation inspection detects static, side-effect, re-export, dynamic and CommonJS imports', () => {
  const file = join(SRC, 'views/Example.tsx');
  for (const statement of [
    "import { verifyReceipt } from '@ghostpay/ux-receipts';",
    "import '@ghostpay/merchant-hooks';",
    "export { periodAt } from '@ghostpay/merchant-billing';",
    "const module = import('../features/future/ghostproof/index.js');",
    "const module = import(`../features/future/private-recurring/index`);",
    "const module = require('../features/future/merchant-dashboard/index');",
    "import '../features/future/ghostproof';",
    "export * from '../features/future/private-recurring/';",
    "import '../features/future/merchant-dashboard';",
    "import module = require('@ghostpay/merchant-billing/internal');",
  ]) assert.equal(blockedImports(file, statement).length, 1, statement);
});

test('isolation inspection resolves parent paths and includes app-shell and worker consumers', () => {
  assert.equal(blockedImports(join(SRC, 'App.tsx'),
    "import './features/future/ghostproof/index';").length, 1);
  assert.equal(blockedImports(join(SRC, 'lib/scanner.worker.ts'),
    "export * from '../features/future/private-recurring/model';").length, 1);
  assert.equal(blockedImports(join(SRC, 'lib/sub/consumer.ts'),
    "import '../../features/future/merchant-dashboard/../ghostproof/index';").length, 1);
});

test('isolation inspection rejects nonliteral module imports and malformed source', () => {
  const file = join(SRC, 'App.tsx');
  assert.equal(blockedImports(file, 'const module = import(selectedModule);').length, 1);
  assert.throws(() => blockedImports(file, "import { broken from '@ghostpay/ux-receipts'"), /malformed source/);
});

test('isolation inspection ignores comments and displayed strings and preserves existing imports', () => {
  assert.deepEqual(blockedImports(join(SRC, 'lib/generic.ts'),
    'const preserve = <T>(value: T): T => value;'), []);
  assert.deepEqual(blockedImports(join(SRC, 'views/Example.tsx'), `
    // import '@ghostpay/ux-receipts';
    const explanation = "import('@ghostpay/merchant-billing')";
    import { parseStrictJson } from '@ghostpay/invoice-schema';
    export { value } from '../lib/example';
  `), []);
});
