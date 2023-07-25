import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";

import { ActionLogger, GitHubClient } from "./types";

/** API class that uses the default token to access the data from the pull request and the repository */
export class PullRequestApi {
  private readonly number: number;
  constructor(
    private readonly api: GitHubClient,
    private readonly pr: PullRequest,
    private readonly logger: ActionLogger,
    private readonly repoInfo: { repo: string; owner: string },
  ) {
    this.number = pr.number;
  }

  /** Cache of the list of files that have been modified by a PR */
  private filesChanged: string[] = [];
  /** Cache for the list of logins that have approved the PR */
  private usersThatApprovedThePr: string[] | null = null;

  async getConfigFile(configFilePath: string): Promise<string> {
    const { data } = await this.api.rest.repos.getContent({
      owner: this.pr.base.repo.owner.login,
      repo: this.pr.base.repo.name,
      path: configFilePath,
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
      const approvals = reviews.filter((review) => review.state === "approved");
      this.usersThatApprovedThePr = approvals.map((approval) => approval.user.login);
    }
    return this.usersThatApprovedThePr;
  }
}
