// Flat-config ESLint for the web project (web-linting-formatting.md).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    // Application + E2E source — browser runtime, TypeScript, React.
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      // TypeScript's own compiler (tsc --noEmit) resolves identifiers, so core
      // no-undef is redundant here and false-positives on type-only references
      // such as `RequestInit` (per typescript-eslint guidance).
      'no-undef': 'off',
      'no-console': process.env.CI ? 'error' : 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      // Honour the underscore-prefix convention for intentionally-unused
      // parameters/vars (scaffold seams such as usePersistedReducer/idb).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    // Test files + jsdom test utilities — add Jest globals; allow the
    // dynamic `require()` module-reset idiom used to re-import config under test.
    files: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/setupTests.ts',
      'src/test-utils.tsx',
      'src/**/__mocks__/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Node-side config files (webpack, eslint) — Node globals.
    files: ['*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
