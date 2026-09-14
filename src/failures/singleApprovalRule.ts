import { summary } from "@actions/core";

import { toHandle } from "../util";
import { RequiredReviewersData, ReviewFailure, RuleFailedSummary } from "./types";

/** Failure of the single requirement that replaces every rule when a pull request targets a
 * branch which is neither the repository's default branch nor a protected branch.
 *
 * All the rules that matched the pull request are merged into this one, so a single approval
 * from any of the qualifying users fulfills every one of them.
 */
export class SingleApprovalFailure extends ReviewFailure {
  public readonly usersToRequest: string[];
  public readonly teamsToRequest: string[];

  constructor(
    report: Omit<RuleFailedSummary, "missingReviews"> & RequiredReviewersData,
    /** The branch that the pull request wants to merge into */
    public readonly targetBranch: string,
    /** Names of the rules that were merged into this requirement */
    public readonly mergedRules: string[],
  ) {
    super({ ...report, missingReviews: 1 });
    this.usersToRequest = report.usersToRequest ?? [];
    this.teamsToRequest = report.teamsToRequest ?? [];
  }

  ruleExplanation(): string {
    return (
      `This pull request targets \`${this.targetBranch}\`, which is neither the repository's default branch ` +
      "nor a protected branch, so all the rules that matched were merged into a single requirement of one approval.\n\n" +
      `The merged rules are: ${this.mergedRules.map((rule) => `\`${rule}\``).join(", ")}. ` +
      "Every one of them is enforced in full once the changes target a protected branch."
    );
  }

  generateSummary(): typeof summary {
    let text = super.generateSummary();

    if (this.usersToRequest.length > 0) {
      text = text.addHeading("Missing users", 3).addList(this.usersToRequest);
    }
    if (this.teamsToRequest.length > 0) {
      text = text.addHeading("Missing reviews from teams", 3).addList(this.teamsToRequest);
    }

    if (this.missingUsers.length > 0) {
      text = text.addDetails(
        "GitHub users whose approval counts",
        `One approval from any of these GitHub users fulfills this requirement:\n\n - ${this.missingUsers
          .map(toHandle)
          .join("\n - ")}`,
      );
    }

    return text;
  }

  getRequestLogins(): { users: string[]; teams: string[] } {
    return { users: this.usersToRequest, teams: this.teamsToRequest };
  }
}
