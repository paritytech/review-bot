/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../../github/pullRequest";
import { TeamApi } from "../../../github/teams";
import { ActionLogger } from "../../../github/types";
import { AndDistinctRule, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";

describe("'And' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  let logger: MockProxy<ActionLogger>;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    logger = mock<ActionLogger>();
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    teamsApi.getTeamMembers.calledWith("team-abc").mockResolvedValue(users);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    runner = new ActionRunner(api, teamsApi, logger);
  });

  describe("Fail scenarios", () => {
    test("should fail early if it doesn't have any positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      const [result, error] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
      expect(error?.missingReviews).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith("Not enough approvals. Need at least 4 and got 0");
    });

    test("should fail early if it doesn't have enough positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const [result, error] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
      expect(error?.missingReviews).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith("Not enough approvals. Need at least 4 and got 1");
    });

    test("should fail early if one of the rules doesn't have a match", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 1 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const [result, error] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("One of the groups does not have any approvals");
    });

    test("should fail if one of the rules doesn't have a match", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh"], min_approvals: 1 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue([users[1], users[2], "abc"]);
      const [result, error] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("Didn't find any matches to match all the rules requirements");
    });

    test("should fail if one of the rules doesn't have enough positive reviews", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: [users[0], "def"], min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };

      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const [result, error] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
      expect(error?.missingReviews).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith("Not enough positive reviews to match a subcondition");
    });

    test("should evaluate splitting requirements with this setup", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["user-1", "user-2"], min_approvals: 2 },
          { users: ["user-1"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
    });

    test("should not consider author in evaluation", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: [users[0], "example", "random"], countAuthor: false, min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([...users]);
      api.getAuthor.mockReturnValue("random");
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(false);
    });
  });

  describe("Passing scenarios", () => {
    test("should pass with a valid different matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh"], min_approvals: 1 },
          { teams: ["team-abc"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc"]);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });

    test("should pass with a valid combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 1 },
          { teams: ["team-abc"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc"]);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });

    test("should pass with a valid complicate combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 1 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc", "def"]);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });

    test("should pass with a valid complicate combination of matches and more than one min approval in a rule", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0], "abc", "def", "fgh"]);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });

    test("should pass with a valid very complicate combination of matches", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: ["abc", "def", "fgh", users[0]], min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
          { users: ["abc", "def", users[1], users[2], "hij"], min_approvals: 2 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([...users, "abc", "def"]);
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });

    test.only("should consider author in evaluation", async () => {
      const rule: AndDistinctRule = {
        type: RuleTypes.AndDistinct,
        reviewers: [
          { users: [users[0], "example", "author"], countAuthor: true, min_approvals: 2 },
          { teams: ["team-abc"], min_approvals: 1 },
        ],
        name: "test",
        condition: { include: [] },
      };
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
      api.getAuthor.mockReturnValue("author");
      const [result] = await runner.andDistinctEvaluation(rule);
      expect(result).toBe(true);
    });
  });
});
