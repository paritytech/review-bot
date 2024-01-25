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
