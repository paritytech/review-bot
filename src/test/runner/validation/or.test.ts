import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../../github/check";
import { PullRequestApi } from "../../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../../github/types";
import { ConfigurationFile, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";

describe("'Or' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<TeamApi>();
    teamsApi.getTeamMembers.calledWith("abc").mockResolvedValue(users);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), mock<ActionLogger>());
  });

  describe("approvals", () => {
    test("should not report errors if the reviewers reviewed", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [{ teams: ["abc"], min_approvals: 1 }],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const { reports } = await runner.validatePullRequest(config);
      expect(reports).toHaveLength(0);
    });

    test("should not report errors if the reviewer belong to both conditions", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: [users[0]], min_approvals: 1 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const { reports } = await runner.validatePullRequest(config);
      expect(reports).toHaveLength(0);
    });

    test("should not report errors if the reviewer belong to one of the conditions", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: [users[0]], min_approvals: 1 },
              { users: [users[1]], min_approvals: 1 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest(config);
      expect(reports).toHaveLength(0);
    });

    test("should accept lowest rank for both cases", async () => {
      fellowsApi.getTeamMembers.calledWith("1").mockResolvedValue(users);
      fellowsApi.getTeamMembers.calledWith("2").mockResolvedValue([users[2]]);
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const { reports } = await runner.validatePullRequest({
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { minFellowsRank: 1, min_approvals: 1 },
              { minFellowsRank: 2, min_approvals: 1 },
            ],
          },
        ],
      }); expect(reports).toHaveLength(0);
    });
  });

  describe("errors", () => {
    test("should report all missing individual users if all of the rules have not been met", async () => {
      const individualUsers = [users[0], users[1]];

      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: individualUsers, min_approvals: 2 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([]);
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
      expect(result.missingUsers).toEqual(users);
      expect(result.teamsToRequest).toContainEqual("abc");
      expect(result.usersToRequest).toEqual(individualUsers);
    });

    test("should show the lowest amount of reviews needed to fulfill the rule", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { users: ["abc"], min_approvals: 1 },
              { users: ["bcd", "cef"], min_approvals: 2 },
              { users: ["bds", "cj9", "dij", "ehu"], min_approvals: 4 },
              { users: ["bob", "cat", "dpo", "eio", "fgy"], min_approvals: 5 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([]);
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
    });

    test("should request lowest rank", async () => {
      fellowsApi.getTeamMembers.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest({
        rules: [
          {
            name: "Or rule",
            type: RuleTypes.Or,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { minFellowsRank: 1, min_approvals: 1 },
              { minFellowsRank: 2, min_approvals: 1 },
            ],
          },
        ],
      });
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
      expect(result.missingUsers).toEqual([users[2]]);
      expect(result.missingRank).toEqual(1);
    });
  });
});
