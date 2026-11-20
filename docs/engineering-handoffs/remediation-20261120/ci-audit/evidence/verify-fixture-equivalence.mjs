import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { getAddress } from 'viem';

// Run from the repository root. Evaluate only the fixed fixture definitions and
// expressions extracted from the reviewed source, with no test/runtime mutation.
const base = 'd74af79ebabdc8cead843361c3497b46d8c421f9';
const root = process.cwd();
const deploymentPath = 'packages/chain-adapters/src/deployments.test.ts';
const cspPath = 'scripts/tests/privacy-csp-bundle.test.mjs';
const fixturePath = 'packages/chain-adapters/src/fixtures.testutil.ts';
const { connectSrc } = await import(pathToFileURL(resolve(root, 'apps/web/scripts/csp.mjs')).href);
const source = (path, prior = false) => ts.createSourceFile(path,
  prior ? execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8'),
  ts.ScriptTarget.Latest, true);
const find = (tree, predicate) => {
  let found;
  const visit = (node) => {
    if (found !== undefined) return;
    if (predicate(node)) { found = node; return; }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.notEqual(found, undefined, 'Expected reviewed fixture expression');
  return found;
};
const initializer = (tree, name) => find(tree,
  (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name).initializer.getText(tree);
const fixture = source(fixturePath);
const manifestFunction = find(fixture, (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'manifestJson');
const manifestBody = ts.transpileModule(manifestFunction.getText(fixture).replace(/^export /, ''),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const oldDeployment = source(deploymentPath, true);
const oldExpression = find(oldDeployment, (node) => ts.isCallExpression(node) &&
  node.expression.getText(oldDeployment) === 'loadDeployment' &&
  node.arguments[0]?.getText(oldDeployment).includes('.replace(')).arguments[0].getText(oldDeployment);
const newDeployment = source(deploymentPath);
const newExpression = initializer(newDeployment, 'prototypeKeyFixture');
const deploymentContext = vm.createContext({ getAddress });
vm.runInContext(`const FAKE = ${initializer(fixture, 'FAKE')};\n${manifestBody}`, deploymentContext);
const oldJson = vm.runInContext(oldExpression, deploymentContext);
const newJson = vm.runInContext(newExpression, deploymentContext);
assert.equal(newJson, oldJson);
assert.deepEqual(Object.getOwnPropertyDescriptor(JSON.parse(newJson), '__proto__')?.value, { a: 1 });
assert.equal(Object.hasOwn(JSON.parse(newJson).deployTx, '__proto__'), false);

const csp = source(cspPath);
const cspContext = vm.createContext({ connectSrc });
for (const name of ['origins', 'configured', 'policy', 'meta']) {
  vm.runInContext(`const ${name} = ${initializer(csp, name)};`, cspContext);
}
const transform = (tree) => find(tree, (node) => ts.isArrayLiteralExpression(node) && node.elements.length > 0 &&
  ts.isStringLiteral(node.elements[0]) && node.elements[0].text === 'duplicate content after valid policy')
  .elements[1].getText(tree);
const tag = vm.runInContext('meta(configured)', cspContext);
assert.equal((tag.match(/>/g) ?? []).length, 1);
assert.equal(tag.at(-1), '>');
const oldTag = vm.runInContext(`(${transform(source(cspPath, true))})(meta(configured))`, cspContext);
const newTag = vm.runInContext(`(${transform(csp)})(meta(configured))`, cspContext);
assert.equal(newTag, oldTag);
assert.equal((newTag.match(/ content=/g) ?? []).length, 2);

const digest = (value) => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({ base, node: process.version, result: 'PASS', fixtures: [
  { path: deploymentPath, byte_identical: true, bytes: Buffer.byteLength(newJson), sha256: digest(newJson),
    controls: ['own top-level __proto__ member retained', 'nested deployTx unchanged'] },
  { path: cspPath, byte_identical: true, bytes: Buffer.byteLength(newTag), sha256: digest(newTag),
    controls: ['single original closing angle bracket', 'two content attributes retained'] },
] }, null, 2));
