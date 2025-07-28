module.exports = {
  extends: ['./.eslintrc.json'],
  env: {
    jest: true,
    es2022: true,
    node: true,
  },
  rules: {
    // TypeScript safety rules - relaxed for tests
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'off',
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/consistent-type-definitions': 'off',

    // Performance rules - relaxed for tests
    'no-await-in-loop': 'off',
    'no-restricted-syntax': 'off',
    'no-loop-func': 'off',
    'no-plusplus': 'off',

    // Code style rules - relaxed for tests
    'no-plusplus': 'off',
    'prefer-destructuring': 'off',
    'no-console': 'off',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-expressions': 'off',
    'no-new-object': 'off',
    'consistent-return': 'off',
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    'max-classes-per-file': 'off',
    'no-useless-constructor': 'off',

    // Import rules - relaxed for tests
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-extraneous-dependencies': 'off',
    'global-require': 'off',
    '@typescript-eslint/no-var-requires': 'off',

    // Additional test-specific rules
    'no-promise-executor-return': 'off',
    
    // Function length rules - relaxed for comprehensive tests
    'max-lines-per-function': 'off',
    
    // Unused variable rules - relaxed for test setup
    '@typescript-eslint/no-unused-vars': 'warn',
  },
};
