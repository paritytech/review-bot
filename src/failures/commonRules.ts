import { summary } from "@actions/core";

import { toHandle } from "../util";
import { RequiredReviewersData, ReviewFailure, RuleFailedSummary } from "./types";

export class CommonRuleFailure extends ReviewFailure {
  public readonly usersToRequest: string[];
  public readonly teamsToRequest: string[];

  constructor(report: RuleFailedSummary & RequiredReviewersData) {
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
