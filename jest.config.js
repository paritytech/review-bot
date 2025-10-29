/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [__dirname + "/src/**/test/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/src/test/fellows\\.test\\.ts"],
};
