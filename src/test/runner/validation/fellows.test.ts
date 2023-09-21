import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { ConfigurationFile, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";

describe("'Fellows' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<TeamApi>();
    teamsApi.getTeamMembers.calledWith("abc").mockResolvedValue(users);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), mock<ActionLogger>());
  });

  test("should not report errors when users from rank approved", async () => {
    fellowsApi.getTeamMembers.calledWith("1").mockResolvedValue(users);
    api.listApprovedReviewsAuthors.mockResolvedValue([users[0], users[1]]);
    const { reports } = await runner.validatePullRequest({
      rules: [
        {
          name: "Fellows rule",
          type: RuleTypes.Fellows,
          condition: { include: ["review-bot.yml"] },
          minRank: 1,
          min_approvals: 2,
        },
      ],
    });
    expect(reports).toHaveLength(0);
  });

  test("should count author", async () => {
    fellowsApi.getTeamMembers.calledWith("1").mockResolvedValue(users);
    api.listApprovedReviewsAuthors.calledWith(true).mockResolvedValue([users[0], users[1]]);
    const { reports } = await runner.validatePullRequest({
      rules: [
        {
          name: "Fellows rule",
          type: RuleTypes.Fellows,
          condition: { include: ["review-bot.yml"] },
          minRank: 1,
          min_approvals: 1,
          countAuthor: true,
        },
      ],
    });
    expect(api.listApprovedReviewsAuthors).toBeCalledWith(true);
    expect(reports).toHaveLength(0);
  });

  describe("errors", () => {
    test("should report users from missing rank", async () => {
      fellowsApi.getTeamMembers.mockResolvedValue([users[2]]);
      fellowsApi.getTeamMembers.calledWith("4").mockResolvedValue([users[0]]);
      const { reports } = await runner.validatePullRequest({
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 4,
            min_approvals: 1,
          },
        ],
      });
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
      expect(result.missingUsers).toEqual([users[2]]);
      expect(result.missingRank).toEqual(4);
    });

    test("should throw error if no fellows of a given rank are found", async () => {
      fellowsApi.getTeamMembers.calledWith("4").mockResolvedValue([]);
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 4,
            min_approvals: 1,
          },
        ],
      };

      await expect(runner.validatePullRequest(config)).rejects.toThrow(
        `No users have been found with the rank ${4} or above`,
      );
    });

    test("should throw error if not enough fellows of a given rank are found to fulfill min_approvals requirement", async () => {
      fellowsApi.getTeamMembers.mockResolvedValue([users[2]]);
      fellowsApi.getTeamMembers.calledWith("4").mockResolvedValue(users);
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 4,
            min_approvals: 5,
          },
        ],
      };

      await expect(runner.validatePullRequest(config)).rejects.toThrow(
        "The amount of required approvals is smaller than the amount of available users.",
      );
    });
  });
});
