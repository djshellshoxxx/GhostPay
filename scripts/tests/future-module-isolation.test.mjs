// F04/F05/F10 are preserved M1 source, not enabled application features.
// Pending dependency inventory does not admit imports from production consumers.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
const isImportMeta = (node) => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword;
const within = (parent, child) => child === parent || child.startsWith(`${parent}${sep}`);

function resolveSpecifier(file, spec) {
  const path = spec.split(/[?#]/, 1)[0];
  if (path.startsWith('.')) return resolve(dirname(file), path);
  if (path.startsWith('/')) return resolve(SRC, '..', `.${path}`); // Vite project-root absolute import.
  return undefined;
}

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
    const spec = literal.text.split(/[?#]/, 1)[0];
    const forbiddenPackage = PACKAGES.some((name) => spec === name || spec.startsWith(`${name}/`));
    const resolved = resolveSpecifier(file, spec);
    const forbiddenPath = resolved !== undefined && isDormant(resolved);
    if (forbiddenPackage || forbiddenPath) blocked.push(spec);
  };
  const checkGlob = (literal) => {
    if (!literal || !ts.isStringLiteralLike(literal)) {
      blocked.push('<nonliteral glob requires review>');
      return;
    }
    const pattern = literal.text;
    if (pattern.startsWith('!')) return; // An exclusion cannot add a module.
    const magicAt = [...pattern].findIndex((char) => '*?{[('.includes(char));
    if (magicAt === -1) return check(literal);
    // A broad glob needs review whenever its fixed directory could include dormant source.
    // Exclusion patterns do not justify admission of a potentially activating positive glob.
    const fixed = pattern.slice(0, magicAt);
    const base = resolveSpecifier(file, fixed.slice(0, fixed.lastIndexOf('/') + 1) || '.');
    if (base === undefined || DIRECTORIES.some((prefix) => {
      const dormant = resolve(SRC, prefix);
      return within(base, dormant) || within(dormant, base);
    })) blocked.push(pattern);
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
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'glob' && isImportMeta(node.expression.expression)) {
      const argument = node.arguments[0];
      if (argument && ts.isArrayLiteralExpression(argument)) argument.elements.forEach(checkGlob);
      else checkGlob(argument);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' &&
      node.arguments?.[1] && ts.isPropertyAccessExpression(node.arguments[1]) &&
      node.arguments[1].name.text === 'url' && isImportMeta(node.arguments[1].expression)) {
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

test('isolation inspection catches Vite project-root imports and loader suffixes', () => {
  const file = join(SRC, 'App.tsx');
  for (const statement of [
    "import '/src/features/future/ghostproof';",
    "import './features/future/private-recurring?raw';",
    "import '@ghostpay/merchant-hooks?raw';",
    "import './features/future/merchant-dashboard#fragment';",
  ]) assert.equal(blockedImports(file, statement).length, 1, statement);
});

test('isolation inspection catches eager, broad and nonliteral Vite globs', () => {
  const file = join(SRC, 'App.tsx');
  for (const statement of [
    "const modules = import.meta.glob('./features/future/ghostproof/*.ts', { eager: true });",
    "const modules = import.meta.glob(['/src/features/future/**/*.ts']);",
    "const modules = import.meta.glob('./fea*/**/*.ts');",
    "const modules = import.meta.glob(globPattern);",
  ]) assert.equal(blockedImports(file, statement).length, 1, statement);
  assert.deepEqual(blockedImports(join(SRC, 'i18n/catalog.ts'),
    "const locales = import.meta.glob(['../../locales/*.json', '!../../locales/en.json'], { import: 'default' });"), []);
});

test('isolation inspection catches Vite worker URLs and preserves existing workers', () => {
  const file = join(SRC, 'App.tsx');
  assert.equal(blockedImports(file,
    "new Worker(new URL('./features/future/ghostproof/index.ts', import.meta.url), { type: 'module' });").length, 1);
  assert.equal(blockedImports(file, 'new URL(workerPath, import.meta.url);').length, 1);
  assert.deepEqual(blockedImports(join(SRC, 'lib/workerFactory.ts'),
    "new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });"), []);
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
