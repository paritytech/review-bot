import { readFileSync } from "fs";
import { parse } from "yaml";

import { ConfigurationFile } from "./rules/types";
import { validateConfig, validateRegularExpressions } from "./rules/validator";

const fileLocation = process.argv[2];

if (!fileLocation) {
  throw new Error("Missing file location! Write the path as a parameter. (More info in the README)");
}

console.log("Looking for config in", fileLocation);
const configTxt = readFileSync(fileLocation, "utf8");
console.log("Found config file");
const config = parse(configTxt) as ConfigurationFile;

const configFile = validateConfig(config);

const [result, error] = validateRegularExpressions(configFile, console);
if (!result) {
  throw new Error(`Regular expression is invalid: ${error}`);
}

console.log("Config is valid!");
