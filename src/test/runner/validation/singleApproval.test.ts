/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { SingleApprovalFailure } from "../../../failures";
import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { PolkadotFellows } from "../../../polkadot/fellows";
import { ConfigurationFile, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";

describe("Single approval on unprotected branches", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<PolkadotFellows>;
  let runner: ActionRunner;

  const abcUsers = ["user-1", "user-2", "user-3"];
  const defUsers = ["user-4", "user-5"];

  /** Config which requires 5 approvals in total across three separate rules */
  const config: ConfigurationFile = {
    rules: [
      {
        name: "Basic rule",
        type: RuleTypes.Basic,
        condition: { include: ["review-bot.yml"] },
        teams: ["abc"],
        minApprovals: 2,
      },
      {
        name: "And distinct rule",
        type: RuleTypes.AndDistinct,
        condition: { include: ["review-bot.yml"] },
        reviewers: [
          { teams: ["abc"], minApprovals: 1 },
          { teams: ["def"], minApprovals: 1 },
        ],
      },
      {
        name: "Rule that does not match",
        type: RuleTypes.Basic,
        condition: { include: ["^README.md$"] },
        teams: ["abc"],
        minApprovals: 1,
      },
    ],
  };

  beforeEach(() => {
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<PolkadotFellows>();
    teamsApi.getTeamMembers.calledWith("abc").mockResolvedValue(abcUsers);
    teamsApi.getTeamMembers.calledWith("def").mockResolvedValue(defUsers);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    api.getTargetBranch.mockReturnValue("feature-branch");
    api.getAuthor.mockReturnValue("author");
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), mock<ActionLogger>());
  });

  describe("branch evaluation", () => {
    test("should enforce every rule when the target branch is protected", async () => {
      api.isTargetBranchProtected.mockResolvedValue(true);
      const { reports } = await runner.validate(config);
      // Both matching rules failed on their own
      expect(reports.map((r) => r.name)).toEqual(["Basic rule", "And distinct rule"]);
      expect(reports.reduce((a, b) => a + b.missingReviews, 0)).toBe(4);
    });

    test("should require a single approval when the target branch is not protected", async () => {
      api.isTargetBranchProtected.mockResolvedValue(false);
      const { reports } = await runner.validate(config);
      expect(reports).toHaveLength(1);
      expect(reports[0].missingReviews).toBe(1);
      expect(reports[0].type).toBe("single-approval");
    });

    test("should enforce every rule when the config opted out", async () => {
      api.isTargetBranchProtected.mockResolvedValue(false);
      const { reports } = await runner.validate({ ...config, singleApprovalOnUnprotectedBranches: false });
      expect(reports).toHaveLength(2);
      // The protection is never evaluated as the config disabled the behaviour
      expect(api.isTargetBranchProtected).not.toHaveBeenCalled();
    });

    test("should require a single approval when the config opted in explicitly", async () => {
      api.isTargetBranchProtected.mockResolvedValue(false);
      const { reports } = await runner.validate({ ...config, singleApprovalOnUnprotectedBranches: true });
      expect(reports).toHaveLength(1);
    });
  });

  describe("approvals", () => {
    test("should report a missing approval if nobody approved", async () => {
      const { reports } = await runner.validateWithSingleApproval(config);
      expect(reports).toHaveLength(1);
      expect(reports[0].missingReviews).toBe(1);
    });

    test("should be fulfilled by one approval from any of the merged rules", async () => {
      for (const user of [...abcUsers, ...defUsers]) {
        api.listApprovedReviewsAuthors.mockResolvedValue([user]);
        const { reports } = await runner.validateWithSingleApproval(config);
        expect(reports).toHaveLength(0);
      }
    });

    test("should not be fulfilled by an approval from an unrelated user", async () => {
      api.listApprovedReviewsAuthors.mockResolvedValue(["random-user"]);
      const { reports } = await runner.validateWithSingleApproval(config);
      expect(reports).toHaveLength(1);
    });

    test("should not report anything if no rule matched", async () => {
      api.listModifiedFiles.mockResolvedValue(["LICENSE"]);
      const { reports } = await runner.validateWithSingleApproval(config);
      expect(reports).toHaveLength(0);
    });

    test("should skip a rule the author is allowed to skip", async () => {
      const { reports } = await runner.validateWithSingleApproval({
        rules: [
          {
            name: "Skippable rule",
            type: RuleTypes.Basic,
            condition: { include: ["review-bot.yml"] },
            teams: ["abc"],
            minApprovals: 2,
            allowedToSkipRule: { teams: ["abc"] },
          },
        ],
      });
      expect(reports).toHaveLength(1);

      api.getAuthor.mockReturnValue(abcUsers[0]);
      const { reports: skipped } = await runner.validateWithSingleApproval({
        rules: [
          {
            name: "Skippable rule",
            type: RuleTypes.Basic,
            condition: { include: ["review-bot.yml"] },
            teams: ["abc"],
            minApprovals: 2,
            allowedToSkipRule: { teams: ["abc"] },
          },
        ],
      });
      expect(skipped).toHaveLength(0);
    });

    test("should throw if no user qualifies to approve", async () => {
      teamsApi.getTeamMembers.calledWith("abc").mockResolvedValue([]);
      await expect(
        runner.validateWithSingleApproval({
          rules: [
            {
              name: "Basic rule",
              type: RuleTypes.Basic,
              condition: { include: ["review-bot.yml"] },
              teams: ["abc"],
              minApprovals: 1,
            },
          ],
        }),
      ).rejects.toThrow("No users have been found in the required reviewers");
    });
  });

  describe("author", () => {
    const authorConfig = (countAuthor: boolean): ConfigurationFile => {
      return {
        rules: [
          {
            name: "Basic rule",
            type: RuleTypes.Basic,
            condition: { include: ["review-bot.yml"] },
            teams: ["abc"],
            minApprovals: 2,
            countAuthor,
          },
        ],
      };
    };

    test("should count the author if the merged rule allows it", async () => {
      await runner.validateWithSingleApproval(authorConfig(true));
      expect(api.listApprovedReviewsAuthors).toHaveBeenCalledWith(true);
    });

    test("should not count the author if the merged rule does not allow it", async () => {
      await runner.validateWithSingleApproval(authorConfig(false));
      expect(api.listApprovedReviewsAuthors).toHaveBeenCalledWith(false);
    });

    test("should not count the author if only some of the merged rules allow it", async () => {
      await runner.validateWithSingleApproval({
        rules: [...authorConfig(true).rules, ...config.rules.slice(1)],
      });
      expect(api.listApprovedReviewsAuthors).toHaveBeenCalledWith(false);
    });

    test("should not list the author as a missing user", async () => {
      api.getAuthor.mockReturnValue(abcUsers[0]);
      const { reports } = await runner.validateWithSingleApproval(config);
      expect(reports[0].missingUsers).not.toContainEqual(abcUsers[0]);
    });
  });

  describe("report", () => {
    test("should merge the users and teams of every matching rule", async () => {
      const { reports } = await runner.validateWithSingleApproval(config);
      const report = reports[0] as SingleApprovalFailure;
      expect(report.missingUsers).toEqual([...abcUsers, ...defUsers]);
      expect(report.getRequestLogins()).toEqual({ users: [], teams: ["abc", "def"] });
      expect(report.mergedRules).toEqual(["Basic rule", "And distinct rule"]);
      expect(report.targetBranch).toEqual("feature-branch");
    });

    test("should generate a summary naming the merged rules and the branch", async () => {
      const { reports } = await runner.validateWithSingleApproval(config);
      const text = reports[0].generateSummary().stringify();
      expect(text).toContain("Missing 1 review");
      expect(text).toContain("feature-branch");
      expect(text).toContain("Basic rule");
      expect(text).toContain("And distinct rule");
    });

    test("should generate a failed check run", async () => {
      const { reports } = await runner.validateWithSingleApproval(config);
      const check = runner.generateCheckRunData(reports);
      expect(check.conclusion).toEqual("failure");
      expect(check.output.title).toEqual("Missing 1 reviews");
    });
  });

  describe("fellows", () => {
    test("should merge the fellows of the required rank", async () => {
      fellowsApi.getTeamMembers.calledWith("2").mockResolvedValue(["fellow-1", "fellow-2"]);
      const { reports } = await runner.validateWithSingleApproval({
        rules: [
          {
            name: "Fellows rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 2,
            minApprovals: 2,
            minTotalScore: 10,
          },
        ],
      });
      expect(reports).toHaveLength(1);
      expect(reports[0].missingUsers).toEqual(["fellow-1", "fellow-2"]);
    });

    test("should be fulfilled by one fellow approval, ignoring the required score", async () => {
      fellowsApi.getTeamMembers.calledWith("2").mockResolvedValue(["fellow-1", "fellow-2"]);
      api.listApprovedReviewsAuthors.mockResolvedValue(["fellow-1"]);
      const { reports } = await runner.validateWithSingleApproval({
        rules: [
          {
            name: "Fellows rule",
            type: RuleTypes.Fellows,
            condition: { include: ["review-bot.yml"] },
            minRank: 2,
            minApprovals: 2,
            minTotalScore: 10,
          },
        ],
      });
      expect(reports).toHaveLength(0);
    });
  });
});
