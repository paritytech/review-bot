/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../github/types";
import { FellowsRule } from "../../rules/types";
import { ActionRunner } from "../../runner";

describe("Fellows rule parsing", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, mock<TeamApi>(), mock<TeamApi>(), mock<GitHubChecksApi>(), mock<ActionLogger>());
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
          type: fellows
          minRank: 2
        `);
    const config = await runner.getConfigFile("");
    expect(config.rules[0].name).toEqual("Test review");
    expect(config.rules[0].type).toEqual("fellows");
  });

  test("should set the rank", async () => {
    api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Test review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              type: fellows
              minRank: 4
          `);
    const { rules } = await runner.getConfigFile("");
    expect(rules[0].type).toEqual("fellows");
    const fellowsRule = rules[0] as FellowsRule;
    expect(fellowsRule.minRank).toEqual(4);
  });

  test("should fail without rank", async () => {
    api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Test review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              type: fellows
          `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"minRank" is required');
  });

  test("should fail without negative number", async () => {
    api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Test review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              type: fellows
              minRank: -3
          `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"minRank" must be greater than or equal to 1');
  });

  test("should fail with invalid number", async () => {
    api.getConfigFile.mockResolvedValue(`
          rules:
            - name: Test review
              condition:
                include: 
                  - '.*'
                exclude: 
                  - 'example'
              type: fellows
              minRank: cuatro
          `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"minRank" must be a number');
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
            type: fellows
            minRank: 2
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "fellows") {
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
            type: fellows
            min_approvals: -99
            minRank: 4
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
            type: fellows
            min_approvals: 0
            minRank: 4
        `);
    await expect(runner.getConfigFile("")).rejects.toThrowError('"min_approvals" must be greater than or equal to 1');
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
            type: fellows
            minRank: 4
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "fellows") {
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
            type: fellows
            minRank: 4
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
            type: fellows
            minRank: 4
            countAuthor: true
        `);
    const config = await runner.getConfigFile("");
    const [rule] = config.rules;
    if (rule.type === "fellows") {
      expect(rule.countAuthor).toBeTruthy();
    } else {
      throw new Error(`Rule type ${rule.type} is invalid`);
    }
  });
});
