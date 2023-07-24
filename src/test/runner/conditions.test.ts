import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../github/pullRequest";
import { TeamApi } from "../../github/teams";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe("evaluateCondition tests", () => {
  let api: MockProxy<PullRequestApi>;
  let teamsApi: MockProxy<TeamApi>;
  let runner: ActionRunner;
  let logger: TestLogger;
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    teamsApi = mock<TeamApi>();
    runner = new ActionRunner(api, teamsApi, logger);
  });

  test("should throw if no teams or users were set", async () => {
    await expect(runner.evaluateCondition({ min_approvals: 99 })).rejects.toThrowError(
      "Teams and Users field are not set for rule.",
    );
  });

  describe("users tests", () => {
    const users = ["user-1", "user-2", "user-3"];
    beforeEach(() => {
      api.listApprovedReviewsAuthors.mockResolvedValue(users);
    });

    test("should pass if required users approved the PR", async () => {
      const [result] = await runner.evaluateCondition({ min_approvals: 1, users: [users[0]] });
      expect(result).toBeTruthy();
    });

    test("should pass if required amount of users approved the PR", async () => {
      const [result] = await runner.evaluateCondition({ min_approvals: 2, users: [users[0], users[users.length - 1]] });
      expect(result).toBeTruthy();
    });

    test("should fail if not all required users approved the PR", async () => {
      const newUser = "missing-user";
      const [result, missingData] = await runner.evaluateCondition({ min_approvals: 2, users: [users[0], newUser] });
      expect(result).toBeFalsy();
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
      const [result] = await runner.evaluateCondition({ min_approvals: 1, teams: [team] });
      expect(result).toBeTruthy();
    });

    test("should pass if required amount of users approved the PR", async () => {
      teamsApi.getTeamMembers.mockResolvedValue(users);
      const [result] = await runner.evaluateCondition({ min_approvals: 2, teams: [team] });
      expect(result).toBeTruthy();
    });

    test("should fail if not enough members of a team approved the PR", async () => {
      api.listApprovedReviewsAuthors.mockResolvedValue([users[0]]);
      teamsApi.getTeamMembers.mockResolvedValue(users);
      const [result, missingData] = await runner.evaluateCondition({ min_approvals: 2, teams: [team] });
      expect(result).toBeFalsy();
      expect(missingData?.missingUsers).toEqual(users.slice(1));
      expect(missingData?.missingUsers).not.toContainEqual(users[0]);
      expect(missingData?.usersToRequest).toBeUndefined();
      expect(missingData?.teamsToRequest).toContainEqual(team);
      expect(missingData?.missingReviews).toBe(1);
    });
  });
});
