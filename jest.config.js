/** Unit tests only — no e2e suite: the bridge is thin local tooling and its
 * only external dependency (the Trello REST API) is mocked in unit tests. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
};
