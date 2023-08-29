/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { TeamApi } from "../../github/teams";
import { ActionLogger } from "../../github/types";
import { ConfigurationFile, Rule, RuleTypes } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("Shared validations", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let logger: MockProxy<ActionLogger>;
  let runner: ActionRunner;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, teamsApi, logger);
  });

  test("validatePullRequest should return true if no rule matches any files", async () => {
    const config: ConfigurationFile = {
      rules: [
        { name: "Rule 1", type: RuleTypes.Basic, condition: { include: ["src"] }, min_approvals: 1 },
        { name: "Rule 2", type: RuleTypes.Basic, condition: { include: ["README.md"] }, min_approvals: 99 },
      ],
    };
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml", "LICENSE"]);
    const evaluation = await runner.validatePullRequest(config);
    expect(evaluation).toBeTruthy();
  });

  describe("listFilesThatMatchRuleCondition tests", () => {
    test("should get values that match the condition", () => {
      const mockRule = { condition: { include: ["src"] } };
      const result = runner.listFilesThatMatchRuleCondition(["src/index.ts", "README.md"], mockRule as Rule);
      expect(result).toContainEqual("src/index.ts");
    });

    test("should return only one file even if more than one rule matches it", () => {
      const mockRule = { condition: { include: ["\\.ts", "src"] } };
      const result = runner.listFilesThatMatchRuleCondition(["src/index.ts"], mockRule as Rule);
      expect(result).toEqual(["src/index.ts"]);
    });

    test("should include all the files with a global value", () => {
      const mockRule = { condition: { include: [".+", "src"] } };
      const listedFiles = ["src/index.ts", ".github/workflows/review-bot.yml", "yarn-error.log"];
      api.listModifiedFiles.mockResolvedValue(listedFiles);
      const result = runner.listFilesThatMatchRuleCondition(listedFiles, mockRule as Rule);
      expect(result).toEqual(listedFiles);
    });

    test("should exclude files if they are captured by the include condition", () => {
      const mockRule = { condition: { include: [".+"], exclude: ["\\.yml"] } };
      const listedFiles = ["src/index.ts", ".github/workflows/review-bot.yml", "yarn-error.log"];
      api.listModifiedFiles.mockResolvedValue(listedFiles);
      const result = runner.listFilesThatMatchRuleCondition(listedFiles, mockRule as Rule);
      expect(result).toContainEqual("src/index.ts");
      expect(result).toContainEqual("yarn-error.log");
      expect(result).not.toContain(".github/workflows/review-bot.yml");
    });
  });

  describe("Validation in reviewerConditionObj", () => {
    const authorName = "my-great-author";
    beforeEach(() => {
      api.getAuthor.mockReturnValue(authorName);
    });
    test("should return false if the object is not defined", async () => {
      const config: ConfigurationFile = { rules: [] };
      const result = await runner.preventReviewEvaluation(config);
      expect(result).toBeFalsy();
    });

    test("should return true if the user is in the users", async () => {
      const config: ConfigurationFile = { rules: [], preventReviewRequests: { users: [authorName] } };
      const result = await runner.preventReviewEvaluation(config);
      expect(result).toBeTruthy();
      expect(logger.info).toHaveBeenCalledWith("User does belongs to list of users to prevent the review request.");
    });

    test("should return true if the user is a team member", async () => {
      const config: ConfigurationFile = { rules: [], preventReviewRequests: { teams: ["team-a", "team-b"] } };
      teamsApi.getTeamMembers.calledWith("team-a").mockResolvedValue(["abc", "def", "ghi"]);
      teamsApi.getTeamMembers.calledWith("team-b").mockResolvedValue(["zyx", "wvt", authorName]);
      const result = await runner.preventReviewEvaluation(config);
      expect(result).toBeTruthy();
      expect(logger.info).toHaveBeenCalledWith(
        "User belong to the team 'team-b' which is part of the preventReviewRequests.",
      );
    });

    test("should return false if the user is not in the team and users", async () => {
      const config: ConfigurationFile = {
        rules: [],
        preventReviewRequests: { teams: ["team-a", "team-b"], users: ["qwerty", "dvorak"] },
      };
      teamsApi.getTeamMembers.calledWith("team-a").mockResolvedValue(["abc", "def", "ghi"]);
      teamsApi.getTeamMembers.calledWith("team-b").mockResolvedValue(["zyx", "wvu", "tsr"]);
      const result = await runner.preventReviewEvaluation(config);
      expect(result).toBeFalsy();
      expect(logger.debug).toHaveBeenCalledWith(
        "User does not belong to any of the preventReviewRequests requirements",
      );
    });
  });
});
