import { summary } from "@actions/core";
import { PullRequest } from "@octokit/webhooks-types";

import { ActionLogger, CheckData, GitHubClient } from "./types";

/** Name of the check run that protected branches require to pass */
export const CHECK_NAME = "review-bot";

/** Name of the check run used when the requirements were relaxed to a single approval.
 *
 * Check runs are keyed by commit, not by pull request, so two pull requests that share a head
 * commit share their check run. A relaxed result must never land on {@link CHECK_NAME}: it would
 * satisfy the status check that a protected branch requires, either by being inherited when the
 * pull request is retargeted or by overwriting the strict result of another pull request on the
 * same commit.
 */
export const RELAXED_CHECK_NAME = "review-bot-relaxed";

/** GitHub client with access to Checks:Write
 * Ideally, a GitHub action.
 * This is the solution to the https://github.com/paritytech/review-bot/issues/54
 */
export class GitHubChecksApi {
  private readonly repoInfo: { repo: string; owner: string };
  constructor(
    private readonly api: GitHubClient,
    private readonly pr: PullRequest,
    private readonly logger: ActionLogger,
    private readonly detailsUrl: string,
  ) {
    this.repoInfo = { owner: this.pr.base.repo.owner.login, repo: this.pr.base.repo.name };
  }

  /**
   * Generates a Check Run or modifies the existing one.
   * This way we can aggregate all the results from different causes into a single one
   * {@link https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28}
   * @param checkResult a CheckData object with the final conclussion of action and the output text
   * {@link CheckData}
   * @param relaxed whether the requirements were relaxed to a single approval. Such a result is
   * published under {@link RELAXED_CHECK_NAME} so it can never satisfy a protected branch.
   */
  async generateCheckRun(checkResult: CheckData, relaxed: boolean = false): Promise<void> {
    const name = relaxed ? RELAXED_CHECK_NAME : CHECK_NAME;
    const checkData = {
      ...checkResult,
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      external_id: name,
      head_sha: this.pr.head.sha,
      name,
      details_url: this.detailsUrl,
    };

    const { data } = await this.api.rest.checks.listForRef({
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      ref: this.pr.head.sha,
    });

    this.logger.debug(`Searching for a match for id ${checkData.external_id}. Found ${data.total_count} checks`);

    for (const check of data.check_runs) {
      if (check.external_id === checkData.external_id) {
        this.logger.debug(`Found match: ${JSON.stringify(check)}`);
        await this.api.rest.checks.update({ ...checkData, check_run_id: check.id });
        this.logger.debug("Updated check data");
        await this.writeSummary(checkData, check.html_url ?? "");
        return;
      }
    }

    this.logger.debug("Did not find any matching status check. Creating a new one");

    const check = await this.api.rest.checks.create(checkData);

    await this.writeSummary(checkData, check.data.html_url ?? "");

    this.logger.debug(JSON.stringify(check.data));
  }

  private async writeSummary(checkResult: CheckData, resultUrl: string) {
    // We publish it in the action summary
    await summary
      .emptyBuffer()
      .addHeading(checkResult.output.title)
      // We redirect to the check as it can changed if it is triggered again
      .addLink("Find the result here", resultUrl)
      .addBreak()
      .addRaw(checkResult.output.text)
      .write();
  }
}
