import tseslint from 'typescript-eslint';

const typescriptFiles = [
  'src/**/*.ts',
  'test/**/*.ts',
  'site/src/**/*.ts',
  'site/vite.config.ts',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '**/node_modules/**',
      'site/dist/**',
      'site/.screenshots/**',
      'eslint.config.js',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
      ],
    },
  },
);
