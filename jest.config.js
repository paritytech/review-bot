/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 8_000,
  testMatch: [__dirname + "/src/**/test/**/*.test.ts"],
};
