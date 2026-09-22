module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  // Todo teste vive em `tests/`, espelhando as areas de `src/`. Aqui rodam
  // apenas os unitarios; `.e2e-spec.ts` fica para `tests/jest-e2e.json`.
  roots: ['<rootDir>/tests'],
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.e2e-spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/database/data-source.ts',
  ],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
