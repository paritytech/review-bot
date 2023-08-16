import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../../github/pullRequest";
import { TeamApi } from "../../../github/teams";
import { ConfigurationFile, RuleTypes } from "../../../rules/types";
import { ActionRunner } from "../../../runner";
import { TestLogger } from "../../logger";

describe("'And' rule validation", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  let logger: TestLogger;
  const users = ["user-1", "user-2", "user-3"];
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    teamsApi.getTeamMembers.calledWith("abc").mockResolvedValue(users);
    api.listModifiedFiles.mockResolvedValue([".github/workflows/review-bot.yml"]);
    api.listApprovedReviewsAuthors.mockResolvedValue([]);
    runner = new ActionRunner(api, teamsApi, logger);
  });

  describe("approvals", () => {
    test("should not report errors if the reviewers reviewed", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [{ teams: ["abc"], min_approvals: 1 }],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const evaluation = await runner.validatePullRequest(config);
      expect(evaluation).toHaveLength(0);
    });

    test("should not report errors if the reviewer belong to both conditions", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: [users[0]], min_approvals: 1 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      const evaluation = await runner.validatePullRequest(config);
      expect(evaluation).toHaveLength(0);
    });
  });
  describe("errors", () => {
    test("should report 2 missing reviews if 2 rules have not been met", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: [users[0]], min_approvals: 1 },
            ],
          },
        ],
      };
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(2);
      expect(result.missingUsers).toEqual(users);
      expect(result.teamsToRequest).toContainEqual("abc");
      expect(result.usersToRequest).toContainEqual(users[0]);
    });

    test("should report the agregated amount of missing reviews", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { users: ["abc"], min_approvals: 1 },
              { users: ["def"], min_approvals: 1 },
              { users: ["efg", "hij"], min_approvals: 2 },
              { users: ["klm"], min_approvals: 1 },
            ],
          },
        ],
      };
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(5);
    });

    test("should report 1 missing reviews if one of the rules have not been met", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: [users[0]], min_approvals: 1 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
    });

    test("should report missing user if one of the rules have not been met", async () => {
      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { teams: ["cba"], min_approvals: 1 },
            ],
          },
        ],
      };
      const teamCba = [users[0], users[1]];
      teamsApi.getTeamMembers.calledWith("cba").mockResolvedValue(teamCba);
      api.listApprovedReviewsAuthors.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(1);
      expect(result.missingUsers).toEqual(teamCba);
      expect(result.teamsToRequest).toEqual(["cba"]);
      expect(result.usersToRequest).toHaveLength(0);
    });

    test("should report missing individual user if one of the rules have not been met", async () => {
      const individualUsers = [users[0], users[1]];

      const config: ConfigurationFile = {
        rules: [
          {
            name: "And rule",
            type: RuleTypes.And,
            condition: { include: ["review-bot.yml"] },
            reviewers: [
              { teams: ["abc"], min_approvals: 1 },
              { users: individualUsers, min_approvals: 2 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest(config);
      const [result] = reports;
      expect(result.missingReviews).toEqual(2);
      expect(result.missingUsers).toEqual(individualUsers);
      expect(result.teamsToRequest).toHaveLength(0);
      expect(result.usersToRequest).toEqual(individualUsers);
    });
  });
});
