/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { BasicRule } from "../../file/types";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe("Basic rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let logger: TestLogger;
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, logger);
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
    expect(runner.getConfigFile("")).rejects.toThrowError('"value" must contain at least one of [users, teams]');
  });
});
