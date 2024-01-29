import { mock, MockProxy } from "jest-mock-extended";

import { GitHubChecksApi } from "../../github/check";
import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger, TeamApi } from "../../github/types";
import { ActionRunner } from "../../runner";
import { PolkadotFellows } from "../../polkadot/fellows";

describe("evaluateCondition tests", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let fellowsApi: MockProxy<PolkadotFellows>;

  let runner: ActionRunner;
  beforeEach(() => {
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    fellowsApi = mock<PolkadotFellows>();
    runner = new ActionRunner(api, teamsApi, fellowsApi, mock<GitHubChecksApi>(), mock<ActionLogger>());
  });

  test("should throw if no teams or users were set", async () => {
    await expect(runner.evaluateCondition({ minApprovals: 99 })).rejects.toThrowError(
      "No users have been found in the required reviewers",
    );
  });

  test("should throw if not enough users are available", async () => {
    await expect(runner.evaluateCondition({ minApprovals: 5, users: ["one-user"] })).rejects.toThrow(
      "The amount of required approvals is smaller than the amount of available users.",
    );
  });

  test("should throw if not enough users in teams are available", async () => {
    teamsApi.getTeamMembers.mockResolvedValue(["1", "2", "3"]);
    await expect(runner.evaluateCondition({ minApprovals: 4, teams: ["etcetera"] })).rejects.toThrow(
      "The amount of required approvals is smaller than the amount of available users.",
    );
  });

  test("should throw if not enough users in teams are available and find duplicates", async () => {
    teamsApi.getTeamMembers.calledWith("a").mockResolvedValue(["1", "2", "3"]);
    teamsApi.getTeamMembers.calledWith("b").mockResolvedValue(["2", "3", "4"]);
    await expect(runner.evaluateCondition({ minApprovals: 5, teams: ["a", "b"] })).rejects.toThrow(
      "The amount of required approvals is smaller than the amount of available users.",
    );
  });

  describe("users tests", () => {
    const users = ["user-1", "user-2", "user-3"];
    beforeEach(() => {
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
    });

    test("should pass if required users approved the PR", async () => {
      const result = await runner.evaluateCondition({ minApprovals: 1, users: [users[0]] });
      expect(result).toBeNull();
    });

    test("should pass if required amount of users approved the PR", async () => {
      const result = await runner.evaluateCondition({ minApprovals: 2, users: [users[0], users[users.length - 1]] });
      expect(result).toBeNull();
    });

    test("should fail if not all required users approved the PR", async () => {
      const newUser = "missing-user";
      const missingData = await runner.evaluateCondition({ minApprovals: 2, users: [users[0], newUser] });
      expect(missingData?.missingUsers).toContainEqual(newUser);
      expect(missingData?.missingUsers).not.toContainEqual(users[0]);
      expect(missingData?.usersToRequest).toContainEqual(newUser);
      expect(missingData?.usersToRequest).not.toContainEqual(users[0]);
      expect(missingData?.missingReviews).toBe(1);
    });
  });

  describe("teams tests", () => {
    const users = ["user-1", "user-2", "user-3"];
    const team = "team-example";
    beforeEach(() => {
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
    });

    test("should pass if required users approved the PR", async () => {
      teamsApi.getTeamMembers.mockResolvedValue(users);
      const result = await runner.evaluateCondition({ minApprovals: 1, teams: [team] });
      expect(result).toBeNull();
    });

    test("should pass if required amount of users approved the PR", async () => {
      teamsApi.getTeamMembers.mockResolvedValue(users);
      const result = await runner.evaluateCondition({ minApprovals: 2, teams: [team] });
      expect(result).toBeNull();
    });

    test("should fail if not enough members of a team approved the PR", async () => {
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      teamsApi.getTeamMembers.mockResolvedValue(users);
      const missingData = await runner.evaluateCondition({ minApprovals: 2, teams: [team] });
      expect(missingData?.missingUsers).toEqual(users.slice(1));
      expect(missingData?.missingUsers).not.toContainEqual(users[0]);
      expect(missingData?.usersToRequest).toBeUndefined();
      expect(missingData?.teamsToRequest).toContainEqual(team);
      expect(missingData?.missingReviews).toBe(1);
    });

    describe("multiple teams", () => {
      test("should work with more than one team", async () => {
        const team1 = { name: "team-1", users: ["team-1-user-1", "team-1-user-2", "team-1-user-3"] };
        const team2 = { name: "team-2", users: ["team-2-user-1", "team-2-user-2", "team-2-user-3"] };
        api.listApprovedReviewsAuthors.mockResolvedValue([
          team1.users[0],
          team1.users[1],
          team2.users[0],
          team2.users[1],
        ]);
        teamsApi.getTeamMembers.calledWith(team1.name).mockResolvedValue(team1.users);
        teamsApi.getTeamMembers.calledWith(team2.name).mockResolvedValue(team2.users);
        const result = await runner.evaluateCondition({ minApprovals: 4, teams: [team1.name, team2.name] });
        expect(result).toBeNull();
      });

      test("should not duplicate user if they belong to more than one team", async () => {
        const team1 = { name: "team-1", users: ["team-1-user-1", "team-1-user-2"] };
        const team2 = { name: "team-2", users: ["team-2-user-1", team1.users[0], team1.users[1]] };
        teamsApi.getTeamMembers.calledWith(team1.name).mockResolvedValue(team1.users);
        teamsApi.getTeamMembers.calledWith(team2.name).mockResolvedValue(team2.users);
        api.listApprovedReviewsAuthors.mockResolvedValue([]);
        const report = await runner.evaluateCondition({ minApprovals: 3, teams: [team1.name, team2.name] });
        // Should not send required users more than once
        expect(report?.missingUsers).toEqual([...team1.users, team2.users[0]]);
        expect(report?.teamsToRequest).toEqual([team1.name, team2.name]);
      });

      describe("teams and users combined", () => {
        test("should not duplicate users if they belong to team and user list", async () => {
          teamsApi.getTeamMembers.calledWith(team).mockResolvedValue(users);
          api.listApprovedReviewsAuthors.mockResolvedValue([]);
          const report = await runner.evaluateCondition({
            minApprovals: 1,
            teams: [team],
            users: [users[0]],
          });
          // Should not send required users more than once
          expect(report?.missingUsers).toEqual(users);
          expect(report?.teamsToRequest).toEqual([team]);
          expect(report?.usersToRequest).toEqual([users[0]]);
        });
      });
    });
  });
});
