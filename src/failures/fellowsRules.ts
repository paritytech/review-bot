import { summary } from "@actions/core";

import { toHandle } from "../util";
import { ReviewFailure, RuleFailedSummary } from "./types";

export class FellowMissingRankFailure extends ReviewFailure {
  constructor(
    ruleInfo: RuleFailedSummary,
    public readonly missingRank: number,
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
    if (this.missingUsers.length > 0)
      text = text.addDetails(
        "GitHub users whose approval counts",
        `This is a list of all the GitHub users who are rank ${this.missingRank} or above:\n\n - ${this.missingUsers
          .map(toHandle)
          .join("\n - ")}`,
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

export class FellowMissingScoreFailure extends ReviewFailure {
  public readonly currentScore: number;
  constructor(
    ruleInfo: Omit<RuleFailedSummary, "missingUsers" | "countingReviews" | "missingReviews">,
    public readonly requiredScore: number,
    approvalsWithScores: [string, number][],
    missingFellowsWithScore: [string, number][],
  ) {
    const unifyFellowWithScore = ([handle, score]: [string, number]) => `${handle} -> <b>${score}</b>`;
    super({
      ...ruleInfo,
      countingReviews: approvalsWithScores.map(unifyFellowWithScore),
      missingUsers: missingFellowsWithScore.map(unifyFellowWithScore),
      missingReviews: 1,
    });

    this.currentScore = approvalsWithScores.reduce((n, [_, score]) => n + score, 0);
  }

  generateSummary(): typeof summary {
    let text = summary
      .emptyBuffer()
      .addHeading(this.name, 2)
      .addHeading("Missing minimum required score from Fellows", 4)
      .addDetails(
        "Rule explanation",
        "Rule 'Fellows' gives every fellow a score based on their rank, and required that the sum of all the scores is greater than the required score." +
          "\n\n" +
          "For more info found out how the rules work in [Review-bot types](https://github.com/paritytech/review-bot#types)",
      );

    text = text
      .addHeading(`Missing a score of ${this.requiredScore}`, 3)
      .addEOL()
      .addRaw(`Missing ${this.requiredScore - this.currentScore} in the required score.`)
      .addEOL()
      .addRaw(`Current score is ${this.currentScore}/${this.requiredScore}`);
    if (this.missingUsers.length > 0)
      text = text.addDetails(
        "GitHub users whose approval counts",
        `This is a list of all the Fellows that have not reviewed with their current scores:\n\n - ${this.missingUsers
          .map(toHandle)
          .join("\n - ")}`,
      );

    if (this.countingReviews.length > 0) {
      text = text
        .addHeading("Users approvals that counted towards this rule with their scores", 3)
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
