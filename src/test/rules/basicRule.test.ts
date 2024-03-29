/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger } from "../../github/types";
import { PolkadotFellows } from "../../polkadot/fellows";
import { BasicRule } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("Basic rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let teamsApi: MockProxy<PolkadotFellows>;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, teamsApi, mock<PolkadotFellows>(), mock<GitHubChecksApi>(), mock<ActionLogger>());
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

  test("should default minApprovals to 1", async () => {
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
      expect(rule.minApprovals).toEqual(1);
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });

  test("should fail with minApprovals in negative", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            minApprovals: -99
            users:
              - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"minApprovals" must be greater than or equal to 1');
  });

  test("should fail with minApprovals in 0", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: basic
            minApprovals: 0
            users:
              - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"minApprovals" must be greater than or equal to 1');
  });

  test("should default countAuthor to false", async () => {
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
      expect(rule.countAuthor).toBeFalsy();
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });

  test("should fail if countAuthor is not a boolean", async () => {
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
            countAuthor: bla
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"countAuthor" must be a boolean');
  });

  test("should set countAuthor to true", async () => {
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
            countAuthor: true
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "basic") {
      expect(rule.countAuthor).toBeTruthy();
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });
});
