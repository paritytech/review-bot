import { validate } from "@eng-automation/js";
import Joi from "joi";

import { ActionLogger } from "../github/types";
import { BasicRule, ConfigurationFile, Rule } from "./types";

const ruleSchema = Joi.object<Rule & { type: string }>().keys({
  name: Joi.string().required(),
  condition: Joi.object<Rule["condition"]>().keys({
    include: Joi.array().items(Joi.string()).required(),
    exclude: Joi.array().items(Joi.string()).optional().allow(null),
  }),
  type: Joi.string().required(),
});

export const schema = Joi.object<ConfigurationFile>().keys({
  rules: Joi.array<ConfigurationFile["rules"]>().items(ruleSchema).required(),
  preventReviewRequests: Joi.object<ConfigurationFile["preventReviewRequests"]>()
    .keys({
      users: Joi.array().items(Joi.string()).optional().allow(null),
      teams: Joi.array().items(Joi.string()).optional().allow(null),
    })
    .optional()
    .allow(null),
});

export const basicRuleSchema = Joi.object<BasicRule>().keys({
  min_approvals: Joi.number().required(),
  users: Joi.array().items(Joi.string()).optional().allow(null),
  teams: Joi.array().items(Joi.string()).optional().allow(null),
});

export const validateConfig = (config: ConfigurationFile): ConfigurationFile | never => {
  const validatedConfig = validate<ConfigurationFile>(config, schema, { message: "Configuration file is invalid" });

  for (const rule of validatedConfig.rules) {
    const { name, type } = rule;
    const message = `Configuration for rule '${rule.name}' is invalid`;
    if (type === "basic") {
      validate<BasicRule>(rule, basicRuleSchema, { message });
    } else if (type === "debug") {
      validate<Rule>(rule, ruleSchema, { message });
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Rule ${name} has an invalid type: ${type}`);
    }
  }

  return validatedConfig;
};

/** Evaluate if the regex expression inside a configuration are valid.
 * @returns a tuple of type [boolean, string]. If the boolean is false, the string will contain an error message
 * @example
 * const [result, error] = validateRegularExpressions(myConfig);
 * if (!result) {
 *   throw new Error(error);
 * } else {
 *   runExpression(myConfig);
 * }
 */
export const validateRegularExpressions = (
  config: ConfigurationFile,
  logger: ActionLogger,
): [true] | [false, string] => {
  /** Regex evaluator */
  const isRegexValid = (regex: string): boolean => {
    try {
      new RegExp(regex);
      return true;
    } catch (e) {
      logger.error(e as Error);
      return false;
    }
  };

  for (const rule of config.rules) {
    for (const condition of rule.condition.include) {
      if (!isRegexValid(condition)) {
        return [false, `Include condition '${condition}' is not a valid regex`];
      }
    }
    if (rule.condition.exclude) {
      for (const condition of rule.condition.exclude) {
        if (!isRegexValid(condition)) {
          return [false, `Exclude condition '${condition}' is not a valid regex`];
        }
      }
    }
  }

  return [true];
};
