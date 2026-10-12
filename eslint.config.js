import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'tmp_mobile', 'scratch', 'shared/exercise-art', 'stitch-design', 'node_modules']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['api/**/*.js', 'tests/**/*.js', 'tests/**/*.jsx', 'scripts/**/*.mjs', 'vite.config.js', 'vitest.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // The Expo app is production TypeScript. It was previously excluded entirely, so Rules of
  // Hooks violations and unused variables in the active-workout flow were undetectable.
  {
    files: ['mobile/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // TypeScript itself reports these; the base rules produce false positives on type syntax.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // Metro resolves static image assets through require(); a static import cannot express it.
      '@typescript-eslint/no-require-imports': 'off',
      // React Compiler-era rules introduced with eslint-plugin-react-hooks v7. The web app is
      // clean; the Expo app predates linting and carries ~15 pre-existing findings that need a
      // deliberate refactor with on-device verification. They are tracked as warnings rather than
      // suppressed, so they stay visible until each is fixed.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      // Attaching `cause` when re-throwing is an improvement, but touching shipped mobile error
      // paths needs device verification. Tracked as a warning.
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['mobile/metro.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
])
