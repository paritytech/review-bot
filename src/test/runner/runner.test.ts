import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../github/pullRequest";
import { TeamApi } from "../../github/teams";
import { ConfigurationFile, Rule, RuleTypes } from "../../rules/types";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe("Shared validations", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  let logger: TestLogger;
  beforeEach(() => {
    logger = new TestLogger();
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
});
