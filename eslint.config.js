// ESLint flat config: typescript-eslint `strictTypeChecked` for every TypeScript file,
// React Hooks + React Refresh rules for the web app.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    '**/blob-report/',
    'apps/api/drizzle/',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Fastify plugins and handlers are async functions by convention, with or without an await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.ts', 'apps/web/*.ts', 'apps/web/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/test/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
);
