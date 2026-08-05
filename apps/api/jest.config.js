/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Node16 module resolution (tsconfig.json) requires explicit .js
  // extensions on relative imports even though this project compiles to
  // CommonJS — ts-jest transpiles the TS syntax but leaves import
  // specifiers as written, and Jest's own CJS-style resolver (unlike tsc)
  // does not auto-map ./foo.js back to ./foo.ts. Verified empirically:
  // without this, every relative import fails with "Cannot find module".
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!main.ts',
    // T4's permanent dependency-cruiser boundary-lint regression fixtures
    // (ADR-015) — intentionally untested, not part of this app's logic.
    '!modules/__boundary_fixture_*/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 80,
    },
  },
};
