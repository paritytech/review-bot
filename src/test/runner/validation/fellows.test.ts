import { validate } from "@eng-automation/js";
import { mock, MockProxy } from "jest-mock-extended";

import { FellowMissingRankFailure } from "../../../failures";
import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { ConfigurationFile, FellowsScore, RuleTypes } from "../../../rules/types";
import { fellowScoreSchema } from "../../../rules/validator";
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
          minApprovals: 2,
        },
      ],
    });
    expect(reports).toHaveLength(0);
  });

  test("should count author", async () => {
    fellowsApi.getTeamMembers.calledWith("1").mockResolvedValue(users);
    api.listApprovedReviewsAuthors.mockResolvedValue([users[0], users[1]]);
    const { reports } = await runner.validatePullRequest({
      rules: [
        {
          name: "Fellows rule",
          type: RuleTypes.Fellows,
          condition: { include: ["review-bot.yml"] },
          minRank: 1,
          minApprovals: 1,
          countAuthor: true,
        },
      ],
    });
    expect(reports).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(api.listApprovedReviewsAuthors).toHaveBeenCalledWith(true);
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
            minApprovals: 1,
          },
        ],
      });
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
      expect(result.missingUsers).toEqual([users[2]]);
      expect((result as FellowMissingRankFailure).missingRank).toEqual(4);
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
            minApprovals: 1,
          },
        ],
      };

      await expect(runner.validatePullRequest(config)).rejects.toThrow(
        `No users have been found with the rank ${4} or above`,
      );
    });

    test("should throw error if not enough fellows of a given rank are found to fulfill minApprovals requirement", async () => {
      fellowsApi.getTeamMembers.mockResolvedValue([users[2]]);
      fellowsApi.getTeamMembers.calledWith("4").mockResolvedValue(users);
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 4,
            minApprovals: 5,
          },
        ],
      };

      await expect(runner.validatePullRequest(config)).rejects.toThrow(
        "The amount of required approvals is smaller than the amount of available users.",
      );
    });
  });

  // TODO: Add more details to these rules
  describe("Score Validation", () => {
    test("should not report errors with a valid schema", () => {
      const score = {};
      validate(score, fellowScoreSchema);
    });

    test("should assign correct values", () => {
      const score = { dan1: 3, dan3: 5 };
      const validation: FellowsScore = validate(score, fellowScoreSchema);
      expect(validation.dan1).toBe(3);
      expect(validation.dan3).toBe(5);
    });

    test("should default unassigned values as 0", () => {
      const score = { dan1: 3 };
      const validation: FellowsScore = validate(score, fellowScoreSchema);
      expect(validation.dan2).toBe(0);
      expect(validation.dan5).toBe(0);
    });

    test("should fail when a score is not a number", () => {
      const score = { dan1: "one" };
      expect(() => validate(score, fellowScoreSchema)).toThrowError('"dan1" must be a number');
    });
  });
});
