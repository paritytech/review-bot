/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../github/types";
import { PolkadotFellows } from "../../polkadot/fellows";
import { OrRule } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("'Or' rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let teamsApi: MockProxy<TeamApi>;
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
            type: or
            reviewers:
              - teams:
                - team-example
              - teams:
                - team-abc
        `);
    const config = await runner.getConfigFile("");
    expect(config.rules[0].name).toEqual("Test review");
    expect(config.rules[0].type).toEqual("or");
  });

  describe("reviewers", () => {
    test("should require teams", async () => {
      api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: or
            reviewers:
              - teams:
                - team-example
              - teams:
                - team-abc
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as OrRule;
      expect(rule.reviewers).toHaveLength(2);
      expect(rule.reviewers[0].teams).toContainEqual("team-example");
      expect(rule.reviewers[0].users).toBeUndefined();
      expect(rule.reviewers[1].teams).toContainEqual("team-abc");
      expect(rule.reviewers[1].users).toBeUndefined();
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
            type: or
            reviewers:
              - users:
                - user-example
              - users:
                - user-special
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as OrRule;
      expect(rule.reviewers[0].users).toContainEqual("user-example");
      expect(rule.reviewers[0].teams).toBeUndefined();
      expect(rule.reviewers[1].users).toContainEqual("user-special");
      expect(rule.reviewers[1].teams).toBeUndefined();
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
            type: or
        `);
      await expect(runner.getConfigFile("")).rejects.toThrowError('"reviewers" is required');
    });

    test("should fill the reviewers array", async () => {
      api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Test review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
            type: or
            reviewers:
              - teams:
                - team-example
              - minApprovals: 2
                users:
                  - abc
                teams:
                  - xyz
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as OrRule;
      expect(rule.reviewers).toHaveLength(2);
      expect(rule.reviewers[0].teams).toContainEqual("team-example");
      expect(rule.reviewers[0].users).toBeUndefined();
      expect(rule.reviewers[1].minApprovals).toEqual(2);
      expect(rule.reviewers[1].users).toContainEqual("abc");
      expect(rule.reviewers[1].teams).toContainEqual("xyz");
    });
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
            type: or
            reviewers:
              - users:
                - user-example
              - teams:
                - team-example
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "or") {
      expect(rule.reviewers[0].minApprovals).toEqual(1);
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
            type: or
            reviewers:
              - minApprovals: -99
                users:
                - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError(
      '"reviewers[0].minApprovals" must be greater than or equal to 1',
    );
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
            type: or
            reviewers:
              - minApprovals: 0
                users:
                  - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError(
      '"reviewers[0].minApprovals" must be greater than or equal to 1',
    );
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
      type: or
      reviewers:
        - teams:
          - team-example
        - users:
            - user-example
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "or") {
      expect(rule.countAuthor).toBeFalsy();
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });

  test("should fail if countAuthor is not a boolean", async () => {
    api.getConfigFile.mockResolvedValue(`
        rules:
        - name: Test review
          countAuthor: bla
          condition:
            include: 
              - '.*'
            exclude: 
              - 'example'
          type: or
          reviewers:
            - teams:
              - team-example
            - users:
                - user-example
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
          countAuthor: true
          type: or
          reviewers:
            - teams:
              - team-example
            - users:
                - user-example
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "or") {
      expect(rule.countAuthor).toBeTruthy();
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });
});
