import { validate } from "@eng-automation/js";
import Joi from "joi";

import { ActionLogger } from "../github/types";
import { AndRule, BasicRule, ConfigurationFile, FellowsRule, FellowsScore, Reviewers, Rule, RuleTypes } from "./types";

/** For the users or team schema. Will be recycled A LOT
 * Remember to add `.or("users", "teams")` to force at least one of the two to be defined
 */
const reviewersObj = {
  users: Joi.array().items(Joi.string()).optional().empty(null),
  teams: Joi.array().items(Joi.string()).optional().empty(null),
};

const reviewerConditionObj = { ...reviewersObj, minApprovals: Joi.number().min(1).default(1) };

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
  allowedToSkipRule: Joi.object<Omit<Reviewers, "minApprovals">>().keys(reviewersObj).optional().or("users", "teams"),
  type: Joi.string()
    .valid(RuleTypes.Basic, RuleTypes.And, RuleTypes.Or, RuleTypes.AndDistinct, RuleTypes.Fellows)
    .required(),
});

/** Schema for ensuring that all the dan ranks are set properly */
export const fellowScoreSchema = Joi.object<FellowsScore>().keys({
  dan1: Joi.number().default(0),
  dan2: Joi.number().default(0),
  dan3: Joi.number().default(0),
  dan4: Joi.number().default(0),
  dan5: Joi.number().default(0),
  dan6: Joi.number().default(0),
  dan7: Joi.number().default(0),
  dan8: Joi.number().default(0),
  dan9: Joi.number().default(0),
});

/** General Configuration schema.
 * Evaluates all the upper level field plus the generic rules fields.
 * Remember to evaluate the rules with their custom rules
 */
export const generalSchema = Joi.object<ConfigurationFile>().keys({
  rules: Joi.array<ConfigurationFile["rules"]>().items(ruleSchema).unique("name").required(),
  preventReviewRequests: Joi.object().keys(reviewersObj).optional().or("users", "teams"),
  score: fellowScoreSchema,
});

/** Basic rule schema
 * This rule is quite simple as it only has the minApprovals field and the required reviewers
 */
export const basicRuleSchema = Joi.object<BasicRule>()
  .keys({ ...reviewerConditionObj, countAuthor: Joi.boolean().default(false) })
  .or("users", "teams");

/** As, with the exception of basic, every other schema has the same structure, we can recycle this */
export const otherRulesSchema = Joi.object<AndRule>().keys({
  reviewers: Joi.array<AndRule["reviewers"]>()
    .items(Joi.object<Reviewers>().keys(reviewerConditionObj).or("users", "teams"))
    .min(2)
    .required(),
  countAuthor: Joi.boolean().default(false),
});

export const fellowsRuleSchema = Joi.object<FellowsRule>().keys({
  countAuthor: Joi.boolean().default(false),
  minRank: Joi.number().required().min(1).empty(null),
  minApprovals: Joi.number().min(1).default(1),
  minTotalScore: Joi.number().min(1).optional(),
});

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

  for (let i = 0; i < validatedConfig.rules.length; i++) {
    const rule = validatedConfig.rules[i];
    const { name, type } = rule;
    const message = `Configuration for rule '${rule.name}' is invalid`;
    if (type === "basic") {
      validatedConfig.rules[i] = validate<BasicRule>(rule, basicRuleSchema, { message });
    } else if (type === "and" || type === "or" || type === "and-distinct") {
      // Aside from the type, every other field in this rules is identical so we can
      // use any of these rules to validate the other fields.
      validatedConfig.rules[i] = validate<AndRule>(rule, otherRulesSchema, { message });
    } else if (type === "fellows") {
      // Fellows have a specific config that uses ranks instead of usernames
      validatedConfig.rules[i] = validate<FellowsRule>(rule, fellowsRuleSchema, { message });
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
