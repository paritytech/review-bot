/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { BasicRule } from "../../rules/types";
import { PullRequestApi } from "../../github/pullRequest";
import { TeamApi } from "../../github/teams";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe("Basic rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let teamsApi: MockProxy<TeamApi>;
  let logger: TestLogger;
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, teamsApi, logger);
  });
  test("should get minimal config", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
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
    expect(config.rules[0].name).toEqual("Test review");
    expect(config.rules[0].type).toEqual("basic");
  });

  test("should require teams", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
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
    const rule = config.rules[0] as BasicRule;
    expect(rule.teams).toContainEqual("team-example");
    expect(rule.users).toBeUndefined();
  });
  test("should require users", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            users:
              - user-example
        `);
    const config = await runner.getConfigFile("");
    const rule = config.rules[0] as BasicRule;
    expect(rule.users).toContainEqual("user-example");
    expect(rule.teams).toBeUndefined();
  });

  test("should fail without reviewers", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"value" must contain at least one of [users, teams]');
  });

  test("should default min_approvals to 1", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            users:
              - user-example
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "basic") {
      expect(rule.min_approvals).toEqual(1);
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });

  test("should fail with min_approvals in negative", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            min_approvals: -99
            users:
              - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"min_approvals" must be greater than or equal to 1');
  });

  test("should fail with min_approvals in 0", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            min_approvals: 0
            users:
              - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"min_approvals" must be greater than or equal to 1');
  });
});
