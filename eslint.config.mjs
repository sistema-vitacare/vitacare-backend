import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // O isolamento por organizacao depende de todo acesso a dados passar pelo
    // TenantScopedRepository. Repositorio cru so dentro de `repositories/`.
    files: ['src/**/*.ts'],
    ignores: [
      'src/**/repositories/**',
      'src/common/database/**',
      'src/**/*.spec.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Decorator[expression.callee.name='InjectRepository']",
          message:
            'Use TenantScopedRepository. @InjectRepository so e permitido em repositories/.',
        },
      ],
    },
  },
  {
    // Os stubs gerados por `typeorm migration:create` trazem queryRunner
    // sem uso ate que o corpo da migration seja escrito.
    files: ['src/database/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
