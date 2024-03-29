/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { PolkadotFellows } from "../../../polkadot/fellows";
import { AndDistinctRule, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";

describe("'And distinct' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<PolkadotFellows>;
  let runner: ActionRunner;
  let logger: MockProxy<ActionLogger>;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    logger = mock<ActionLogger>();
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<PolkadotFellows>();
    teamsApi.getTeamMembers.calledWith("team-abc").mockResolvedValue(users);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), logger);
  });

  describe("Fail scenarios", () => {
    test("should fail early if it doesn't have any positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      const error = await runner.andDistinctEvaluation(rule);
      expect(error?.missingReviews).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith("Not enough approvals. Need at least 4 and got 0");
    });

    test("should fail early if it doesn't have enough positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const error = await runner.andDistinctEvaluation(rule);
      expect(error?.missingReviews).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith("Not enough approvals. Need at least 4 and got 1");
    });

    test("should fail early if one of the rules doesn't have a match", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const error = await runner.andDistinctEvaluation(rule);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("One of the groups does not have any approvals");
    });

    test("should fail if one of the rules doesn't have a match", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh"], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue([users[1], users[2], "abc"]);
      const error = await runner.andDistinctEvaluation(rule);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("Didn't find any matches to match all the rules requirements");
    });

    test("should fail if one of the rules doesn't have enough positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: [users[0], "def"], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const error = await runner.andDistinctEvaluation(rule);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("Not enough positive reviews to match a subcondition");
    });

    test("should not have duplicates in missingUsers", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: [users[0], "def"], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      const error = await runner.andDistinctEvaluation(rule);
      const hasDuplicates = <T>(arr: T[]) => arr.some((item, index) => arr.indexOf(item) !== index);
      expect(hasDuplicates(error?.missingUsers as string[])).toBeFalsy();
    });

    test("should not consider author in evaluation", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        countAuthor: false,
        reviewers: [
          { users: [users[0], "example", "random"], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([...users]);
      api.getAuthor.mockReturnValue("random");
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).not.toBeNull();
    });
  });

  describe("Passing scenarios", () => {
    test("should pass with a valid different matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh"], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc"]);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
    });

    test("should pass with a valid combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc"]);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
    });

    test("should pass with a valid complicate combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc", "def"]);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
    });

    test("should pass with a valid complicate combination of matches and more than one min approval in a rule", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], minApprovals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc", "def", "fgh"]);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
    });

    test("should pass with a valid very complicate combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], minApprovals: 2 },
          { teams: ["team-abc"], minApprovals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], minApprovals: 2 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([...users, "abc", "def"]);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
    });

    test("should call listApprovedReviewsAuthors with true", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        countAuthor: true,
        reviewers: [
          { users: [users[0], "example"], minApprovals: 1 },
          { teams: ["team-abc"], minApprovals: 2 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const result = await runner.andDistinctEvaluation(rule);
      expect(result).toBeNull();
      expect(api.listApprovedReviewsAuthors).lastCalledWith(true);
    });
  });
});
