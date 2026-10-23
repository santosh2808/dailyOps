/** @type {import('jest').Config} */
const common = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: { ignoreCodes: [] } }] },
};

module.exports = {
  testTimeout: 30000,
  projects: [
    // Fast tests: services instantiated with a mocked PrismaService. No database.
    { ...common, displayName: 'unit', rootDir: '.', testMatch: ['<rootDir>/test/unit/**/*.spec.ts'] },
    // Database tests: need DATABASE_URL pointing at a DISPOSABLE Postgres with
    // all migrations applied (see backend/test/README.md).
    {
      ...common,
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
    },
  ],
};
