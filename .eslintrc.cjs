const { getConfiguration, getTypescriptOverride } = require("@eng-automation/js-style/src/eslint/configuration");

const tsConfParams = { rootDir: __dirname };

const conf = getConfiguration({ typescript: tsConfParams });

const tsConfOverride = getTypescriptOverride(tsConfParams);
conf.overrides.push(tsConfOverride);
module.exports = {
  ...conf,
  overrides: [
    ...conf.overrides,
    {
      ...tsConfOverride,
      files: "{*,**,**/*}.{ts,tsx}",
      rules: { ...tsConfOverride.rules, "no-restricted-imports": "off" },
    },
  ],
};
