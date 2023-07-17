import Joi from "joi";

import { ActionLogger } from "../github/types";
import { ConfigurationFile, Rule } from "./types";

const ruleSchema = Joi.object<Rule>().keys({
  name: Joi.string().required(),
  condition: Joi.object<Rule["condition"]>().keys({
    include: Joi.array().items(Joi.string()).required(),
    exclude: Joi.array().items(Joi.string()).optional().allow(null),
  }),
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
