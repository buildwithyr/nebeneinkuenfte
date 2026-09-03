import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['assets/vendor/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      eqeqeq: 'error',
      'no-undef': 'error',
      'no-console': 'warn',
    },
  },
];
