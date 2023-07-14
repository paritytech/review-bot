/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger } from "../../github/types";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe("Config Parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let logger: ActionLogger;
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, logger);
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
        `);
    const config = await runner.getConfigFile("");
    expect(config.preventReviewRequests).toBeNull;
  });

  test("should call GitHub api with path", async () => {
    await expect(runner.getConfigFile("example-location")).rejects.toThrowError();
    expect(api.getConfigFile).toHaveBeenCalledWith("example-location");
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

      preventReviewRequests:
        teams:
            - team-a
            - team-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests.teams).toEqual(["team-a", "team-b"]);
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

      preventReviewRequests:
        users:
            - user-a
            - user-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests.users).toEqual(["user-a", "user-b"]);
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
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests).toBeNull;
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
        `);
      const config = await runner.getConfigFile("");
      expect(config.rules[0].condition.exclude).toBeNull;
    });
  });
});
