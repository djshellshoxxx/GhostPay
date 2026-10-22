// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.mjs', 'eslint.config.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is banned: use crypto.getRandomValues (see ADR-0004).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
        { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
        { selector: "CallExpression[callee.name='Function']", message: 'Function() is banned.' },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'innerHTML assignment is banned; render text only.',
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: 'outerHTML assignment is banned; render text only.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned.',
        },
        {
          selector: "Property[key.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned.',
        },
      ],
    },
  },
);
