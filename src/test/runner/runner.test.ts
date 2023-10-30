/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../github/types";
import { ConfigurationFile, Rule, RuleTypes } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("Shared validations", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<TeamApi>;
  let logger: MockProxy<ActionLogger>;
  let runner: ActionRunner;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    logger = mock<ActionLogger>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<TeamApi>();
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), logger);
  });

  test("validatePullRequest should return true if no rule matches any files", async () => {
    const config: ConfigurationFile = {
      rules: [
        { name: "Rule 1", type: RuleTypes.Basic, condition: { include: ["src"] }, minApprovals: 1 },
        { name: "Rule 2", type: RuleTypes.Basic, condition: { include: ["README.md"] }, minApprovals: 99 },
      ],
    };
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml", "LICENSE"]);
    const evaluation = await runner.validatePullRequest(config);
    expect(evaluation).toBeTruthy();
  });

  test("validatePullRequest should return true if author belongs to allowedToSkipRule", async () => {
    const config: ConfigurationFile = {
      rules: [
        {
          name: "Rule allowedToSkipRule",
          type: RuleTypes.Basic,
          condition: { include: ["src"] },
          minApprovals: 1,
          allowedToSkipRule: { teams: ["abc"] },
        },
      ],
    };
    api.listModifiedFiles.mockResolvedValue(["src/polkadot/init.rs", "LICENSE"]);
    teamsApi.getTeamMembers.mockResolvedValue(["user-1", "user-2", "user-3"]);
    api.getAuthor.mockReturnValue("user-1");
    const evaluation = await runner.validatePullRequest(config);
    expect(evaluation).toBeTruthy();
    expect(logger.info).toHaveBeenCalledWith(
      "Skipping rule Rule allowedToSkipRule as author belong to greenlight rule.",
    );
  });

  test("fetchAllUsers should not return duplicates", async () => {
    teamsApi.getTeamMembers.mockResolvedValue(["user-1", "user-2", "user-3"]);
    const users = await runner.fetchAllUsers({ teams: ["abc"], users: ["user-1", "user-2", "user-4"] });
    expect(users).toStrictEqual(["user-1", "user-2", "user-3", "user-4"]);
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

    test("should request reviewers if object is not defined", async () => {
      await runner.requestReviewers([exampleReport], undefined);
      expect(api.requestReview).toHaveBeenCalledWith({ users: ["user-1"], teams: ["team-1"] });
    });

    test("should not request user if he is defined", async () => {
      await runner.requestReviewers([exampleReport], { users: ["user-1"] });

      expect(logger.info).toHaveBeenCalledWith("Filtering users to request a review from.");
      expect(api.requestReview).toHaveBeenCalledWith({ teams: ["team-1"], users: [] });
    });

    test("should not request team if it is defined", async () => {
      await runner.requestReviewers([exampleReport], { teams: ["team-1"] });
      expect(logger.info).toHaveBeenCalledWith("Filtering teams to request a review from.");
      expect(api.requestReview).toHaveBeenCalledWith({ teams: [], users: ["user-1"] });
    });

    test("should request reviewers if the team and user are not the same", async () => {
      await runner.requestReviewers([exampleReport], { users: ["user-pi"], teams: ["team-alpha"] });
      expect(api.requestReview).toHaveBeenCalledWith({ users: ["user-1"], teams: ["team-1"] });
    });
  });
});
