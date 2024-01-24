import { summary } from "@actions/core";

import { RuleTypes } from "./rules/types";

type RuleInfo = { type: RuleTypes; name: string };

type MissingReviewData = {
  missingReviews: number;
  countingReviews: string[];
};

export type ReviewReport = {
  /** The amount of missing reviews to fulfill the requirements */
  missingReviews: number;
  /** The users who would qualify to complete those reviews */
  missingUsers: string[];
  /** If applicable, the teams that should be requested to review */
  teamsToRequest?: string[];
  /** If applicable, the users that should be requested to review */
  usersToRequest?: string[];
  /** If applicable, reviews that count towards this rule */
  countingReviews: string[];
};

export type RuleReport = RuleInfo & ReviewReport;

const toHandle = (handle: string): string => `@${handle}`;

export abstract class ReviewFailure {
  public readonly ruleName: string;
  public readonly type: RuleTypes;
  /** The amount of missing reviews */
  public readonly missingReviews: number;

  /** Approvals that counted towards this rule */
  public readonly countingReviews: string[];

  constructor(ruleInfo: RuleInfo & MissingReviewData) {
    this.ruleName = ruleInfo.name;
    this.type = ruleInfo.type;
    this.missingReviews = ruleInfo.missingReviews;
    this.countingReviews = ruleInfo.countingReviews;
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
      .addHeading(this.ruleName, 2)
      .addHeading(`Missing ${this.missingReviews} review${this.missingReviews > 1 ? "s" : ""}`, 4)
      .addDetails(
        "Rule explanation",
        this.ruleExplanation(this.type) +
        "\n\n" +
        "For more info found out how the rules work in [Review-bot types](https://github.com/paritytech/review-bot#types)",
      );
  }

  /** Get the users/teams whose review should be requested */
  abstract getRequestLogins(): { users: string[]; teams: string[] };
}

export class DefaultRuleFailure extends ReviewFailure {
  public readonly usersToRequest: string[];
  public readonly teamsToRequest: string[];

  constructor(report: RuleReport) {
    super(report);
    this.usersToRequest = report.usersToRequest ?? [];
    this.teamsToRequest = report.teamsToRequest ?? [];
  }

  generateSummary(): typeof summary {
    let text = super.generateSummary();

    if (this.usersToRequest.length > 0) {
      text = text.addHeading("Missing users", 3).addList(this.usersToRequest);
    }
    if (this.teamsToRequest.length > 0) {
      text = text.addHeading("Missing reviews from teams", 3).addList(this.teamsToRequest);
    }

    if (this.countingReviews.length > 0) {
      text = text
        .addHeading("Users approvals that counted towards this rule", 3)
        .addEOL()
        .addList(this.countingReviews.map(toHandle))
        .addEOL();
    }

    return text;
  }

  getRequestLogins(): { users: string[]; teams: string[] } {
    return { users: this.usersToRequest, teams: this.teamsToRequest };
  }
}

export class FellowMissingRankFailure extends ReviewFailure {
  constructor(ruleInfo: RuleInfo & MissingReviewData,
    missingReviews: number,
    private readonly missingRank: number,
    private readonly missingUsers: string[],
    countingReviews: string[],
  ) {
    super(ruleInfo);
  }

  generateSummary(): typeof summary {
    let text = super.generateSummary();

    text = text
      .addHeading("Missing reviews from Fellows", 3)
      .addEOL()
      .addRaw(`Missing reviews from rank \`${this.missingRank}\` or above`)
      .addEOL();
    if (this.missingUsers && this.missingUsers.length > 0)
      text = text.addDetails(
        "GitHub users whose approval counts",
        `This is a list of all the GitHub users who are rank ${this.missingRank} or above:\n\n - ${this.missingUsers
          .map(toHandle)
          .join("\n -")}`,
      );

    if (this.countingReviews.length > 0) {
      text = text
        .addHeading("Users approvals that counted towards this rule", 3)
        .addEOL()
        .addList(this.countingReviews.map(toHandle))
        .addEOL();
    }

    return text;
  }

  getRequestLogins(): { users: string[]; teams: string[] } {
    return { users: [], teams: [] };
  }
}
