import { summary } from "@actions/core";

import { RuleTypes } from "./rules/types";

type RuleInfo = { type: RuleTypes; name: string };

type MissingReviewData = {
  missingReviews: number;
  countingReviews: string[];
  teamsToRequest?: string[];
  usersToRequest?: string[];
};

const toHandle = (handle: string): string => `@${handle}`;

export class ReviewFailure {
  /** The amount of missing reviews */
  public readonly missingReviews: number;

  /** Reviews that counted towards fixing this problem */
  public readonly countingReviews: string[];

  public readonly teamsToRequest?: string[];
  public readonly usersToRequest?: string[];

  constructor(
    public readonly ruleInfo: RuleInfo,
    missingReviewData: MissingReviewData,
  ) {
    this.missingReviews = missingReviewData.missingReviews;
    this.countingReviews = missingReviewData.countingReviews;
    this.teamsToRequest = missingReviewData.teamsToRequest;
    this.usersToRequest = missingReviewData.usersToRequest;
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
      .addHeading(this.ruleInfo.name, 2)
      .addHeading(`Missing ${this.missingReviews} review${this.missingReviews > 1 ? "s" : ""}`, 4)
      .addDetails(
        "Rule explanation",
        this.ruleExplanation(this.ruleInfo.type) +
          "\n\n" +
          "For more info found out how the rules work in [Review-bot types](https://github.com/paritytech/review-bot#types)",
      );
  }
}

export class DefaultRuleFailure extends ReviewFailure {
  constructor(ruleInfo: RuleInfo, missingReviewData: MissingReviewData) {
    super(ruleInfo, missingReviewData);
  }

  generateSummary(): typeof summary {
    let text = super.generateSummary();

    if (this.usersToRequest && this.usersToRequest.length > 0) {
      text = text.addHeading("Missing users", 3).addList(this.usersToRequest);
    }
    if (this.teamsToRequest && this.teamsToRequest.length > 0) {
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
}

export class FellowMissingRankFailure extends ReviewFailure {
  constructor(
    ruleInfo: RuleInfo,
    missingReviews: number,
    private readonly missingRank: number,
    missingUsers: string[],
    countingReviews: string[],
  ) {
    super(ruleInfo, {
      missingReviews,
      countingReviews: countingReviews,
      usersToRequest: missingUsers,
    });
  }

  generateSummary(): typeof summary {
    let text = super.generateSummary();

    text = text
      .addHeading("Missing reviews from Fellows", 3)
      .addEOL()
      .addRaw(`Missing reviews from rank \`${this.missingRank}\` or above`)
      .addEOL();
    if (this.usersToRequest && this.usersToRequest.length > 0)
      text = text.addDetails(
        "GitHub users whose approval counts",
        `This is a list of all the GitHub users who are rank ${this.missingRank} or above:\n\n - ${this.usersToRequest
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
}
