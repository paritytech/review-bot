/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../github/types";
import { PolkadotFellows } from "../../polkadot/fellows";
import { RuleTypes } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("Config Parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let logger: MockProxy<ActionLogger>;
  let runner: ActionRunner;
  beforeEach(() => {
    logger = mock<ActionLogger>();
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, teamsApi, mock<PolkadotFellows>(), mock<GitHubChecksApi>(), logger);
  });
  test("should get minimal config", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            teams:
              - team-example
        `);
    const config = await runner.getConfigFile("");
    expect(config.preventReviewRequests).toBeUndefined();
  });

  test("should call GitHub api with path", async () => {
    await expect(runner.getConfigFile("example-location")).rejects.toThrowError();
    expect(api.getConfigFile).toHaveBeenCalledWith("example-location");
  });

  describe("rule type", () => {
    test("should fail with no rule type", async () => {
      api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Default review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              teams:
                - team-example
          `);
      await expect(runner.getConfigFile("")).rejects.toThrowError(
        'Configuration file is invalid: "rules[0].type" is required',
      );
    });

    test("should fail with no valid rule type", async () => {
      api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Default review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              type: example-for-invalid
              teams:
                - team-example
          `);
      // prettifies string to [basic, and, or...]
      const types = JSON.stringify(Object.values(RuleTypes)).replace(/"/g, "").replace(/,/g, ", ");
      await expect(runner.getConfigFile("")).rejects.toThrowError(
        'Configuration file is invalid: "rules[0].type" must be one of ' + types,
      );
    });

    test("should fail with duplicated rule name", async () => {
      api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Default review
              condition:
                include: 
                  - '.*'
              type: basic
              teams:
                - team-example
            - name: Default review
              condition:
                include: 
                  - 'src'
              type: basic
              teams:
                - team-2
          `);
      await expect(runner.getConfigFile("")).rejects.toThrowError("contains a duplicate value");
    });
  });

  describe("regular expressions validator", () => {
    test("should fail with invalid regular expression", async () => {
      const invalidRegex = "(?(";
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '${invalidRegex}'
          type: basic
          teams:
            - team-example
        `);
      await expect(runner.getConfigFile("")).rejects.toThrowError(
        `Regular expression is invalid: Include condition '${invalidRegex}' is not a valid regex`,
      );
      expect(logger.error).toHaveBeenCalledWith(
        new Error(`Invalid regular expression: /${invalidRegex}/: Invalid group`),
      );
    });
  });

  describe("preventReviewRequests field", () => {
    test("should get team", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'
          type: basic
          teams:
            - team-example

      preventReviewRequests:
        teams:
            - team-a
            - team-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests?.teams).toEqual(["team-a", "team-b"]);
    });

    test("should get users", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'
          type: basic
          teams:
            - team-example

      preventReviewRequests:
        users:
            - user-a
            - user-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests?.users).toEqual(["user-a", "user-b"]);
    });

    test("should get both users and teams", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'
          type: basic
          teams:
            - team-example

      preventReviewRequests:
        users:
          - user-a
          - user-b
        teams:
          - team-a
          - team-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests?.users).toEqual(["user-a", "user-b"]);
      expect(config.preventReviewRequests?.teams).toEqual(["team-a", "team-b"]);
    });

    test("should pass if preventReviewRequests is not assigned", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'
          type: basic
          teams:
            - team-example
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests).toBeUndefined();
    });
  });

  describe("conditions field", () => {
    const exampleConfig = `
    rules:
      - name: Default review
        condition:
          include: 
              - 'example-include-rule-1'
              - 'example-include-rule-2'
          exclude: 
              - 'example-exclude-rule'
        type: basic
        teams:
          - team-example
      `;
    it("should parse include conditions", async () => {
      api.getConfigFile.mockResolvedValue(exampleConfig);
      const config = await runner.getConfigFile("");
      const includeRule = config.rules[0].condition.include;
      expect(includeRule.length).toBeGreaterThan(0);
      expect(includeRule).toContainEqual("example-include-rule-1");
    });

    it("should fail if there are no include values", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            exclude: 
                - 'example'
          type: basic
          teams:
            - team-example
        `);
      await expect(runner.getConfigFile("")).rejects.toThrowError('"rules[0].condition.include" is required');
    });

    it("should parse exclude conditions", async () => {
      api.getConfigFile.mockResolvedValue(exampleConfig);
      const config = await runner.getConfigFile("");
      const excludes = config.rules[0].condition.exclude;
      expect(excludes?.length).toBeGreaterThan(0);
      expect(excludes).toContainEqual("example-exclude-rule");
    });

    it("should pass if there are no exclude conditions", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
          type: basic
          teams:
            - team-1
        `);
      const config = await runner.getConfigFile("");
      expect(config.rules[0].condition.exclude).toBeUndefined();
    });

    describe("allowedToSkipRule", () => {
      test("should get teams", async () => {
        api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                  - '.*'
              exclude: 
                  - 'example'
            type: basic
            allowedToSkipRule:
              teams:
                - team-example
            teams:
              - team-example
          `);
        const config = await runner.getConfigFile("");
        const { allowedToSkipRule } = config.rules[0];
        expect(allowedToSkipRule?.teams).toEqual(["team-example"]);
        expect(allowedToSkipRule?.users).toBeUndefined();
      });

      test("should get users", async () => {
        api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                  - '.*'
              exclude: 
                  - 'example'
            type: basic
            allowedToSkipRule:
              users:
                - user-example
            teams:
              - team-example
          `);
        const config = await runner.getConfigFile("");
        const { allowedToSkipRule } = config.rules[0];
        expect(allowedToSkipRule?.users).toEqual(["user-example"]);
        expect(allowedToSkipRule?.teams).toBeUndefined();
      });

      test("should get teams and users", async () => {
        api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                  - '.*'
              exclude: 
                  - 'example'
            type: basic
            allowedToSkipRule:
              teams:
                - team-example
              users:
                - user-example
            teams:
              - team-example
          `);
        const config = await runner.getConfigFile("");
        const { allowedToSkipRule } = config.rules[0];
        expect(allowedToSkipRule?.teams).toEqual(["team-example"]);
        expect(allowedToSkipRule?.users).toEqual(["user-example"]);
      });

      test("should be null by default", async () => {
        api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                  - '.*'
              exclude: 
                  - 'example'
            type: basic
            teams:
              - team-example
          `);
        const config = await runner.getConfigFile("");
        expect(config.rules[0].allowedToSkipRule).toBeUndefined();
      });
    });
  });
});
