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
    logger = mock<ActionLogger>();
    teamsApi = mock<TeamApi>();
    runner = new ActionRunner(api, teamsApi, mock<GitHubChecksApi>(), logger);
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

  describe("Validation in requestReviewers", () => {
    const exampleReport = {
      name: "Example",
      missingUsers: ["user-1", "user-2", "user-3"],
      missingReviews: 2,
      teamsToRequest: ["team-1"],
      usersToRequest: ["user-1"],
    };

    test("should request reviewers if object is not defined", () => {
      runner.requestReviewers([exampleReport], undefined);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["team-1"])));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["user-1"])));
    });

    test("should not request user if he is defined", () => {
      runner.requestReviewers([exampleReport], { users: ["user-1"] });
      expect(logger.info).toHaveBeenCalledWith("Filtering users to request a review from.");
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["team-1"])));
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["user-1"])));
    });

    test("should not request team if it is defined", () => {
      runner.requestReviewers([exampleReport], { teams: ["team-1"] });
      expect(logger.info).toHaveBeenCalledWith("Filtering teams to request a review from.");
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["team-1"])));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["user-1"])));
    });

    test("should request reviewers if the team and user are not the same", () => {
      runner.requestReviewers([exampleReport], { users: ["user-pi"], teams: ["team-alpha"] });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["team-1"])));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(["user-1"])));
    });
  });
});
