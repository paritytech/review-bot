import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";

import { Reviewers } from "../rules/types";
import { caseInsensitiveEqual } from "../util";
import { ActionLogger, GitHubClient } from "./types";

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
  /** Cache for the evaluation of the protection of the branch that the PR targets */
  private targetBranchProtected: boolean | null = null;

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
      const reviews = await this.api.paginate(this.api.rest.pulls.listReviews, {
        ...this.repoInfo,
        pull_number: this.number,
      });
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
          latestReviewsMap.set(review.user.id, review as PullRequestReview);
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
        validArray(users) ? `Users: ${JSON.stringify(users)}` : undefined,
        validArray(teams) ? `Teams: ${JSON.stringify(teams)}` : undefined,
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

  /** Returns the name of the branch that the PR wants to merge into */
  getTargetBranch(): string {
    return this.pr.base.ref;
  }

  /** Evaluates if the branch that the PR targets is one that needs to be gated by reviews.
   *
   * A branch qualifies if it is the repository's default branch, if it has classic branch
   * protection enabled, or if a ruleset that gates pull requests applies to it.
   *
   * If the protection can not be evaluated we consider the branch protected, as failing to
   * reach the API should never lower the review requirements of a PR.
   */
  async isTargetBranchProtected(): Promise<boolean> {
    if (this.targetBranchProtected !== null) {
      return this.targetBranchProtected;
    }

    const branch = this.getTargetBranch();

    if (branch === this.pr.base.repo.default_branch) {
      this.logger.info(`Branch '${branch}' is the repository's default branch.`);
      this.targetBranchProtected = true;
      return this.targetBranchProtected;
    }

    try {
      const { data: branchData } = await this.api.rest.repos.getBranch({ ...this.repoInfo, branch });
      if (branchData.protected) {
        this.logger.info(`Branch '${branch}' has branch protection enabled.`);
        this.targetBranchProtected = true;
        return this.targetBranchProtected;
      }

      const { data: rules } = await this.api.rest.repos.getBranchRules({ ...this.repoInfo, branch });
      this.logger.debug(`Rules applying to '${branch}': ${JSON.stringify(rules)}`);
      // Rulesets often target every branch with rules that have nothing to do with reviews,
      // like forbidding deletions, so only a rule that gates pull requests counts here.
      this.targetBranchProtected = rules.some((rule) => rule.type === "pull_request");
      this.logger.info(
        this.targetBranchProtected
          ? `Branch '${branch}' is targeted by a ruleset that gates pull requests.`
          : `Branch '${branch}' is neither the default branch nor a protected branch.`,
      );
    } catch (error) {
      this.logger.warn(`Failed to evaluate the protection of branch '${branch}'. Considering it protected.`);
      this.logger.warn(error as Error);
      this.targetBranchProtected = true;
    }

    return this.targetBranchProtected;
  }
}
