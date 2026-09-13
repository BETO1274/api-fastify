import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/', 'coverage/']
  }
]
