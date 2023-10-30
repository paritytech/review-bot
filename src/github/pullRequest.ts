import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";

import { caseInsensitiveEqual } from "../util";
import { ActionLogger, GitHubClient } from "./types";
import { Reviewers } from "../rules/types";

/** API class that uses the default token to access the data from the pull request and the repository
 * If we are using the assign reviewers features with teams, it requires a GitHub app
 * (Action token doesn't have permission to assign teams)
 */
export class PullRequestApi {
  private readonly number: number;
  private readonly repoInfo: { repo: string; owner: string };
  constructor(
    private readonly api: GitHubClient,
    private readonly pr: PullRequest,
    private readonly logger: ActionLogger,
  ) {
    this.number = pr.number;
    this.repoInfo = { owner: this.pr.base.repo.owner.login, repo: this.pr.base.repo.name };
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
  async listApprovedReviewsAuthors(countAuthor: boolean): Promise<string[]> {
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

    let approvals = this.usersThatApprovedThePr;

    if (countAuthor) {
      this.logger.info("Counting author in list of approvals");
      approvals = [this.pr.user.login, ...approvals];
    }
    this.logger.debug(`PR approvals are ${JSON.stringify(approvals)}`);

    return approvals;
  }

  async requestReview({ users, teams }: Pick<Reviewers, "users" | "teams">): Promise<void> {
    if (users || teams) {
      const validArray = (array: string[] | undefined): boolean => !!array && array.length > 0;
      const reviewersLog = [
        validArray(users) ? `Teams: ${JSON.stringify(users)}` : undefined,
        validArray(teams) ? `Users: ${JSON.stringify(teams)}` : undefined,
      ]
        .filter((e) => !!e)
        .join(" - ");

      this.logger.info(`Requesting reviews from ${reviewersLog}`);

      await this.api.rest.pulls.requestReviewers({
        ...this.repoInfo,
        pull_number: this.number,
        reviewers: users,
        team_reviewers: teams,
      });
    }
  }

  /** Returns the login of the PR's author */
  getAuthor(): string {
    return this.pr.user.login;
  }
}
