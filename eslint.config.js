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
    // Los scripts de k6 corren en el runtime de k6, que expone __ENV.
    files: ['load/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/', 'coverage/']
  }
]
