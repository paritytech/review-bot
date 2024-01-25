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
            reviewers: [{ teams: ["abc"], minApprovals: 1 }],
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
              { teams: ["abc"], minApprovals: 1 },
              { users: [users[0]], minApprovals: 1 },
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
              { teams: ["abc"], minApprovals: 1 },
              { users: [users[0]], minApprovals: 1 },
              { users: [users[1]], minApprovals: 1 },
            ],
          },
        ],
      };
      api.listApprovedReviewsAuthors.mockResolvedValue([users[2]]);
      const { reports } = await runner.validatePullRequest(config);
      expect(reports).toHaveLength(0);
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
                { teams: ["abc"], minApprovals: 1 },
                { users: individualUsers, minApprovals: 2 },
              ],
            },
          ],
        };
        api.listApprovedReviewsAuthors.mockResolvedValue([]);
        const { reports } = await runner.validatePullRequest(config);
        const [result] = reports;
        expect(result.missingReviews).toEqual(1);
        expect(result.missingUsers).toEqual(users);
        const toRequest = result.getRequestLogins();
        expect(toRequest.teams).toContainEqual("abc");
        expect(toRequest.users).toEqual(individualUsers);
      });

      test("should show the lowest amount of reviews needed to fulfill the rule", async () => {
        const config: ConfigurationFile = {
          rules: [
            {
              name: "Or rule",
              type: RuleTypes.Or,
              condition: { include: ["review-bot.yml"] },
              reviewers: [
                { users: ["abc"], minApprovals: 1 },
                { users: ["bcd", "cef"], minApprovals: 2 },
                { users: ["bds", "cj9", "dij", "ehu"], minApprovals: 4 },
                { users: ["bob", "cat", "dpo", "eio", "fgy"], minApprovals: 5 },
              ],
            },
          ],
        };
        api.listApprovedReviewsAuthors.mockResolvedValue([]);
        const { reports } = await runner.validatePullRequest(config);
        const [result] = reports;
        expect(result.missingReviews).toEqual(1);
      });
    });
  });
});
