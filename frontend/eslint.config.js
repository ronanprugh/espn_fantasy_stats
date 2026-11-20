// ESLint: correctness rules only (formatting is left to review).
//
// - typescript-eslint parses TS/TSX; its type-aware rules are off, since
//   `tsc` (npm run build) already checks types.
// - react-hooks enforces the Rules of Hooks and checks effect dependencies.
// - no-explicit-any: `any` switches type checking off; name the type (see
//   lib/chartTypes.ts for Recharts callbacks, errorMessage() for catches).
//   Where a dependency is left out on purpose, the code says why next to an
//   `eslint-disable-next-line react-hooks/exhaustive-deps`.
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.browser,
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks, '@typescript-eslint': tseslint.plugin },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
