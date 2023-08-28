import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";
import { DeepMockProxy, mock, mockDeep, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../github/pullRequest";
import { ActionLogger, GitHubClient } from "../github/types";

describe("Pull Request API Tests", () => {
  let api: PullRequestApi;
  let logger: MockProxy<ActionLogger>;
  let client: DeepMockProxy<GitHubClient>;
  let pr: DeepMockProxy<PullRequest>;
  beforeEach(() => {
    logger = mock<ActionLogger>();
    client = mockDeep<GitHubClient>();
    pr = mockDeep<PullRequest>();
    pr.number = 99;
    api = new PullRequestApi(client, pr, logger, { owner: "org", repo: "repo" }, "");
  });

  describe("Approvals", () => {
    const random = () => Math.floor(Math.random() * 1000);

    let reviews: PullRequestReview[];
    beforeEach(() => {
      reviews = [];
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore because the official type and the library type do not match
      client.rest.pulls.listReviews.mockResolvedValue({ data: reviews as unknown });
    });

    test("Should return approval", async () => {
      const mockReviews: PullRequestReview[] = [
        { state: "approved", user: { login: "yes-user", id: random() }, id: random() },
      ] as PullRequestReview[];
      reviews.push(...mockReviews);

      const approvals = await api.listApprovedReviewsAuthors(false);
      expect(approvals).toEqual(["yes-user"]);
    });

    test("Should return approvals and ignore other reviews", async () => {
      const mockReviews: PullRequestReview[] = [
        { state: "changes_requested", user: { login: "no-user", id: random() }, id: random() },
        { state: "approved", user: { login: "yes-user", id: random() }, id: random() },
        { state: "commented", user: { login: "other-user", id: random() }, id: random() },
      ] as PullRequestReview[];
      reviews.push(...mockReviews);

      const approvals = await api.listApprovedReviewsAuthors(false);
      expect(approvals).toEqual(["yes-user"]);
    });

    test("Should consider only oldest reviews per user", async () => {
      const mockReviews: PullRequestReview[] = [
        { state: "changes_requested", user: { login: "user-1", id: 1 }, id: 1000 },
        { state: "approved", user: { login: "user-2", id: 2 }, id: 1200 },
        { state: "approved", user: { login: "user-1", id: 1 }, id: 1500 },
        { state: "changes_requested", user: { login: "user-2", id: 2 }, id: 1600 },
      ] as PullRequestReview[];
      reviews.push(...mockReviews);

      const approvals = await api.listApprovedReviewsAuthors(false);
      expect(approvals).toEqual(["user-1"]);
    });

    test("Should return approvals and the author", async () => {
      pr.user.login = "abc";
      const mockReviews: PullRequestReview[] = [
        { state: "changes_requested", user: { login: "no-user", id: random() }, id: random() },
        { state: "approved", user: { login: "yes-user", id: random() }, id: random() },
        { state: "commented", user: { login: "other-user", id: random() }, id: random() },
      ] as PullRequestReview[];
      reviews.push(...mockReviews);

      const approvals = await api.listApprovedReviewsAuthors(true);
      expect(approvals).toEqual(["yes-user", "abc"]);
    });
  });
});
