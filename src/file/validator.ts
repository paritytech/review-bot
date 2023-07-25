import * as $ from "subshape";

import { ActionLogger } from "../github/types";
import { ConfigurationFile } from "./types";

/** For the users or team schema. Will be recycled A LOT
 * TODO: Find a way to use an XOR operator
 */
const $reviewersObj = $.object($.optionalField("users", $.array($.str)), $.optionalField("teams", $.array($.str)));

/** Base rule condition.
 * This are the minimum requirements that all the rules must have.
 * After we evaluated this, we can run a custom evaluation per rule
 */
const $ruleSchema = $.object(
  $.field("name", $.str),
  $.field("condition", $.object($.field("include", $.array($.str)), $.optionalField("exclude", $.array($.str)))),
  $.field("type", $.literalUnion(["basic", "debug"])),
);

/** General Configuration schema.
 * Evaluates all the upper level field plus the generic rules fields.
 * Remember to evaluate the rules with their custom rules
 */
const $generalSchema = $.object(
  $.field("rules", $.array($ruleSchema)),
  $.optionalField("preventReviewRequests", $.object($reviewersObj)),
);

type ConfigFile = $.Output<typeof $generalSchema>;

/** Basic rule schema
 * This rule is quite simple as it only has the min_approvals field and the required reviewers
 */
const $basicRuleSchema = $.object($.optionalField("min_approvals", $.i8), $reviewersObj, $ruleSchema);

/**
 * Evaluates a config thoroughly. If there is a problem with it, it will throw.
 *
 * It first evaluates the configuration on a higher level and then runs individually per rule
 * @see-also {@link generalSchema}
 * @param config The configuration object to be validated. Usually parsed directly from a yaml or json
 * @returns The configuration file post validation, or it throws an error.
 */
export const validateConfig = (config: ConfigurationFile): ConfigurationFile | never => {
  // In theory this will throw when it fails the assertion
  $.assert($generalSchema, config);

  for (const rule of config.rules) {
    const { name, type } = rule;
    const message = `Configuration for rule '${rule.name}' is invalid`;
    if (type === "basic") {
      $.assert($basicRuleSchema, rule);
    } else if (type === "debug") {
      $.assert($ruleSchema, rule);
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Rule ${name} has an invalid type: ${type}`);
    }
  }

  return config;
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
