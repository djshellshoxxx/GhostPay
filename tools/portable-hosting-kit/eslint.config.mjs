// @ts-check
// Kit-local lint config. The repository root config ignores *.mjs, so the kit lints itself with the same banned-API
// rules (no Math.random, eval, Function) plus eslint:recommended. Run from tools/portable-hosting-kit.
import eslint from '@eslint/js';

const NODE_GLOBALS = Object.fromEntries(
  ['process', 'Buffer', 'console', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'setImmediate', 'queueMicrotask', 'AbortController', 'AbortSignal', 'structuredClone',
    'fetch', 'globalThis'].map((n) => [n, 'readonly']),
);

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: NODE_GLOBALS },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Math.random is banned: use node:crypto.' }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
        { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
        { selector: "CallExpression[callee.name='Function']", message: 'Function() is banned.' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
];
