import { summary } from "@actions/core";

import { RuleTypes } from "../rules/types";

/** Object containing the report on why a rule failed */
export type RuleFailedReport = {
  /** The amount of missing reviews to fulfill the requirements */
  missingReviews: number;
  /** The users who would qualify to complete those reviews */
  missingUsers: string[];
  /** If applicable, reviews that count towards this rule */
  countingReviews: string[];
};

export type RuleFailedSummary = {
  type: RuleTypes;
  name: string;
} & RuleFailedReport;

export type RequiredReviewersData = {
  /** If applicable, the teams that should be requested to review */
  teamsToRequest?: string[];
  /** If applicable, the users that should be requested to review */
  usersToRequest?: string[];
};

/** Class which contains the reports of a failed rule
 * Here you can find details on why a rule failed and what requirements it has
 */
export abstract class ReviewFailure {
  public readonly name: string;
  public readonly type: RuleTypes;
  /** The amount of missing reviews */
  public readonly missingReviews: number;

  /** Approvals that counted towards this rule */
  public readonly countingReviews: string[];

  /** List of users who would classify to approve this rule */
  public readonly missingUsers: string[];

  constructor(ruleInfo: RuleFailedSummary) {
    this.name = ruleInfo.name;
    this.type = ruleInfo.type;
    this.missingReviews = ruleInfo.missingReviews;
    this.countingReviews = ruleInfo.countingReviews;
    this.missingUsers = ruleInfo.missingUsers;
  }

  ruleExplanation(type: RuleTypes): string {
    switch (type) {
      case RuleTypes.Basic:
        return "Rule 'Basic' requires a given amount of reviews from users/teams";
      case RuleTypes.And:
        return "Rule 'And' has many required reviewers/teams and requires all of them to be fulfilled.";
      case RuleTypes.Or:
        return "Rule 'Or' has many required reviewers/teams and requires at least one of them to be fulfilled.";
      case RuleTypes.AndDistinct:
        return (
          "Rule 'And Distinct' has many required reviewers/teams and requires all of them to be fulfilled **by different users**.\n\n" +
          "The approval of one user that belongs to _two teams_ will count only towards one team."
        );
      case RuleTypes.Fellows:
        return "Rule 'Fellows' requires a given amount of reviews from users whose Fellowship ranking is the required rank or great.";
      default:
        console.error("Out of range for rule type", type);
        throw new Error("Unhandled rule");
    }
  }

  generateSummary(): typeof summary {
    return summary
      .emptyBuffer()
      .addHeading(this.name, 2)
      .addHeading(`Missing ${this.missingReviews} review${this.missingReviews > 1 ? "s" : ""}`, 4)
      .addDetails(
        "Rule explanation",
        this.ruleExplanation(this.type) +
          "\n\n" +
          "For more info found out how the rules work in [Review-bot types](https://github.com/paritytech/review-bot#types).",
      );
  }

  /** Get the users/teams whose review should be requested */
  abstract getRequestLogins(): { users: string[]; teams: string[] };
}
