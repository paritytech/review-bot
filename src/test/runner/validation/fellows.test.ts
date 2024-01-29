import { validate } from "@eng-automation/js";
import { mock, MockProxy } from "jest-mock-extended";

import { FellowMissingRankFailure, FellowMissingScoreFailure } from "../../../failures";
import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { PolkadotFellows } from "../../../polkadot/fellows";
import { ConfigurationFile, FellowsScore, RuleTypes } from "../../../rules/types";
import { fellowScoreSchema } from "../../../rules/validator";
import { ActionRunner } from "../../../runner";

describe("'Fellows' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<PolkadotFellows>;
  let runner: ActionRunner;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<PolkadotFellows>();
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

  describe("Score Validation", () => {
    beforeEach(() => {
      fellowsApi.getTeamMembers.mockResolvedValue([users[2]]);
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
    });

    const generateSchemaWithScore = (minScore: number): ConfigurationFile => {
      return {
        rules: [
          {
            name: "Score rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 1,
            minApprovals: 1,
            minScore,
          },
        ],
        score: {
          dan1: 1,
          dan2: 2,
          dan3: 3,
          dan4: 4,
          dan5: 5,
          dan6: 6,
          dan7: 7,
          dan8: 8,
          dan9: 9,
        },
      };
    };

    describe("Schema test", () => {
      test("should not report errors with a valid schema", () => {
        const score = {};
        validate<FellowsScore>(score, fellowScoreSchema);
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

    test("should work with enough score", async () => {
      fellowsApi.listFellows.mockResolvedValue([[users[2], 4]]);

      const { reports } = await runner.validatePullRequest(generateSchemaWithScore(1));
      expect(reports).toHaveLength(0);
    });

    test("should fail without enough score", async () => {
      fellowsApi.listFellows.mockResolvedValue([
        [users[2], 4],
        ["example", 3],
        ["user", 2],
      ]);

      const { reports } = await runner.validatePullRequest(generateSchemaWithScore(5));
      const error = reports[0] as FellowMissingScoreFailure;
      expect(error.currentScore).toBeLessThan(5);
      console.log(error.generateSummary().stringify());
    });

    test("should allow a combination of scores", async () => {
      fellowsApi.listFellows.mockResolvedValue([
        [users[0], 4],
        [users[1], 1],
      ]);

      const { reports } = await runner.validatePullRequest(generateSchemaWithScore(1));
      expect(reports).toHaveLength(0);
    });
  });
});
