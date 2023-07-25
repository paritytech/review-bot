import { validate } from "@eng-automation/js";
import Joi from "joi";

import { ActionLogger } from "../github/types";
import { BasicRule, ConfigurationFile, Rule } from "./types";

/** For the users or team schema. Will be recycled A LOT
 * Remember to add `.or("users", "teams")` to force at least one of the two to be defined
 */
const reviewersObj = {
  users: Joi.array().items(Joi.string()).optional().empty(null),
  teams: Joi.array().items(Joi.string()).optional().empty(null),
};

/** Base rule condition.
 * This are the minimum requirements that all the rules must have.
 * After we evaluated this, we can run a custom evaluation per rule
 */
const ruleSchema = Joi.object<Rule & { type: string }>().keys({
  name: Joi.string().required(),
  condition: Joi.object<Rule["condition"]>().keys({
    include: Joi.array().items(Joi.string()).required(),
    exclude: Joi.array().items(Joi.string()).optional().allow(null),
  }),
  type: Joi.string().required(),
});

/** General Configuration schema.
 * Evaluates all the upper level field plus the generic rules fields.
 * Remember to evaluate the rules with their custom rules
 */
export const generalSchema = Joi.object<ConfigurationFile>().keys({
  rules: Joi.array<ConfigurationFile["rules"]>().items(ruleSchema).required(),
  preventReviewRequests: Joi.object().keys(reviewersObj).optional().xor("users", "teams"),
});

/** Basic rule schema
 * This rule is quite simple as it only has the min_approvals field and the required reviewers
 */
export const basicRuleSchema = Joi.object<BasicRule>()
  .keys({ min_approvals: Joi.number().empty(1), ...reviewersObj })
  .or("users", "teams");

/**
 * Evaluates a config thoroughly. If there is a problem with it, it will throw.
 *
 * It first evaluates the configuration on a higher level and then runs individually per rule
 * @see-also {@link generalSchema}
 * @param config The configuration object to be validated. Usually parsed directly from a yaml or json
 * @returns The configuration file post validation, or it throws an error.
 */
export const validateConfig = (config: ConfigurationFile): ConfigurationFile | never => {
  const validatedConfig = validate<ConfigurationFile>(config, generalSchema, {
    message: "Configuration file is invalid",
  });

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
