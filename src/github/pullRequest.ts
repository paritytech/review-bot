import { summary } from "@actions/core";
import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";

import { caseInsensitiveEqual } from "../util";
import { ActionLogger, CheckData, GitHubClient } from "./types";

/** API class that uses the default token to access the data from the pull request and the repository */
export class PullRequestApi {
  private readonly number: number;
  constructor(
    private readonly api: GitHubClient,
    private readonly pr: PullRequest,
    private readonly logger: ActionLogger,
    private readonly repoInfo: { repo: string; owner: string },
    private readonly detailsUrl: string,
  ) {
    this.number = pr.number;
  }

  /** Cache of the list of files that have been modified by a PR */
  private filesChanged: string[] = [];
  /** Cache for the list of logins that have approved the PR */
  private usersThatApprovedThePr: string[] | null = null;

  async getConfigFile(configFilePath: string): Promise<string> {
    this.logger.info(`Fetching config file in ${configFilePath}`);
    const { data } = await this.api.rest.repos.getContent({
      owner: this.pr.base.repo.owner.login,
      repo: this.pr.base.repo.name,
      path: configFilePath,
      ref: "and-rule",
    });

    if (!("content" in data)) {
      throw new Error(`${configFilePath} has no content`);
    }

    this.logger.debug(`Content is ${data.content}`);

    const decryptedFile = Buffer.from(data.content, "base64").toString("utf-8");

    this.logger.debug(`File content is ${decryptedFile}`);

    return decryptedFile;
  }

  /** Returns an array with all the files that had been modified */
  async listModifiedFiles(): Promise<string[]> {
    if (this.filesChanged.length === 0) {
      const { data } = await this.api.rest.pulls.listFiles({ ...this.repoInfo, pull_number: this.number });
      this.filesChanged = data.map((f) => f.filename);
    }
    return this.filesChanged;
  }

  /** List all the approved reviews in a PR */
  async listApprovedReviewsAuthors(): Promise<string[]> {
    if (!this.usersThatApprovedThePr) {
      const request = await this.api.rest.pulls.listReviews({ ...this.repoInfo, pull_number: this.number });
      const reviews = request.data as PullRequestReview[];
      this.logger.debug(`List of reviews: ${JSON.stringify(reviews)}`);

      const latestReviewsMap = new Map<number, PullRequestReview>();

      for (const review of reviews) {
        if (
          caseInsensitiveEqual(review.state, "commented") ||
          // the user may have been deleted
          review.user === null ||
          review.user === undefined
        ) {
          continue;
        }

        // we check if there is already a review from this user
        const prevReview = latestReviewsMap.get(review.user.id);
        if (
          prevReview === undefined ||
          // Newer reviews have a higher id number
          prevReview.id < review.id
        ) {
          // if the review is more modern (and not a comment) we replace the one in our map
          latestReviewsMap.set(review.user.id, review);
        }
      }

      const latestReviews = Array.from(latestReviewsMap.values());

      this.logger.info(
        `Latest reviews are ${JSON.stringify(
          latestReviews.map((r) => {
            return { user: r.user.login, state: r.state };
          }),
        )}`,
      );

      const approvals = latestReviews.filter((review) => caseInsensitiveEqual(review.state, "approved"));
      this.usersThatApprovedThePr = approvals.map((approval) => approval.user.login);
    }
    this.logger.debug(`PR approvals are ${JSON.stringify(this.usersThatApprovedThePr)}`);
    return this.usersThatApprovedThePr;
  }

  /** Returns the login of the PR's author */
  getAuthor(): string {
    return this.pr.user.login;
  }

  /**
   * Generates a Check Run or modifies the existing one.
   * This way we can aggregate all the results from different causes into a single one
   * {@link https://docs.github.com/en/rest/checks/runs?apiVersion=2022-11-28}
   * @param checkResult a CheckData object with the final conclussion of action and the output text
   * {@link CheckData}
   */
  async generateCheckRun(checkResult: CheckData): Promise<void> {
    const checkData = {
      ...checkResult,
      owner: this.repoInfo.owner,
      repo: this.repoInfo.repo,
      external_id: "review-bot",
      head_sha: this.pr.head.sha,
      name: "review-bot",
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
        return;
      }
    }

    this.logger.debug("Did not find any matching status check. Creating a new one");

    const check = await this.api.rest.checks.create(checkData);

    // We publish it in the action summary
    await summary
      .addHeading(checkResult.output.title)
      // We redirect to the check as it can changed if it is triggered again
      .addLink("Find the result here", check.data.html_url ?? "")
      .addBreak()
      .addRaw(checkResult.output.text)
      .write();

    this.logger.debug(JSON.stringify(check.data));
  }
}
