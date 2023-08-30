/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { TeamApi } from "../../github/teams";
import { ActionLogger } from "../../github/types";
import { AndRule } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("'And' rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let teamsApi: MockProxy<TeamApi>;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, teamsApi, mock<GitHubChecksApi>(), mock<ActionLogger>());
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
            type: and
            reviewers:
              - teams:
                - team-example
              - teams:
                - team-abc
        `);
    const config = await runner.getConfigFile("");
    expect(config.rules[0].name).toEqual("Test review");
    expect(config.rules[0].type).toEqual("and");
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
            type: and
            reviewers:
              - teams:
                - team-example
              - teams:
                - team-abc
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as AndRule;
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
            type: and
            reviewers:
              - users:
                - user-example
              - users:
                - user-special
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as AndRule;
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
            type: and
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
            type: and
            reviewers:
              - teams:
                - team-example
              - min_approvals: 2
                users:
                  - abc
                teams:
                  - xyz
        `);
      const config = await runner.getConfigFile("");
      const rule = config.rules[0] as AndRule;
      expect(rule.reviewers).toHaveLength(2);
      expect(rule.reviewers[0].teams).toContainEqual("team-example");
      expect(rule.reviewers[0].users).toBeUndefined();
      expect(rule.reviewers[1].min_approvals).toEqual(2);
      expect(rule.reviewers[1].users).toContainEqual("abc");
      expect(rule.reviewers[1].teams).toContainEqual("xyz");
    });
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
            type: and
            reviewers:
              - users:
                - user-example
              - teams:
                - team-example
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "and") {
      expect(rule.reviewers[0].min_approvals).toEqual(1);
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
            type: and
            reviewers:
              - min_approvals: -99
                users:
                - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError(
      '"reviewers[0].min_approvals" must be greater than or equal to 1',
    );
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
            type: and
            reviewers:
              - min_approvals: 0
                users:
                  - user-example
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError(
      '"reviewers[0].min_approvals" must be greater than or equal to 1',
    );
  });
});
