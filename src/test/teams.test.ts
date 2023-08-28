/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DeepMockProxy, Matcher, mock, mockDeep, MockProxy } from "jest-mock-extended";

import { GitHubTeamsApi, TeamApi } from "../github/teams";
import { ActionLogger, GitHubClient } from "../github/types";

describe("Pull Request API Tests", () => {
  let teams: TeamApi;
  let logger: MockProxy<ActionLogger>;
  let client: DeepMockProxy<GitHubClient>;
  beforeEach(() => {
    logger = mock<ActionLogger>();
    client = mockDeep<GitHubClient>();

    teams = new GitHubTeamsApi(client, "org", logger);
  });

  test("should call team", async () => {
    // @ts-ignore
    client.rest.teams.listMembersInOrg.mockResolvedValue({ data: [] });
    await teams.getTeamMembers("example");
    expect(client.rest.teams.listMembersInOrg).toHaveBeenCalledWith({ org: "org", team_slug: "example" });
  });

  test("should return team members", async () => {
    // @ts-ignore
    client.rest.teams.listMembersInOrg.mockResolvedValue({ data: [{ login: "abc" }, { login: "bcd" }] });
    const members = await teams.getTeamMembers("example");
    expect(members).toEqual(["abc", "bcd"]);
  });

  test("should cache team members call", async () => {
    // @ts-ignore
    client.rest.teams.listMembersInOrg.mockResolvedValue({ data: [{ login: "abc" }, { login: "bcd" }] });
    for (let i = 0; i < 10; i++) {
      const members = await teams.getTeamMembers("example");
      expect(members).toEqual(["abc", "bcd"]);
    }
    expect(client.rest.teams.listMembersInOrg).toHaveBeenCalledTimes(1);
  });

  /**
   * Helper class that evades the compiler errors
   */
  const mockTeamMembers = (teamName: string, members: string[]) => {
    client.rest.teams.listMembersInOrg
      // @ts-ignore as the error is related to the matcher type
      .calledWith(new Matcher<{ team_slug: string }>((value) => value.team_slug === teamName, "Different team name"))
      .mockResolvedValue({
        // @ts-ignore as we don't need the full type
        data: members.map((m) => {
          return { login: m };
        }),
      });
  };

  test("should call different teams", async () => {
    mockTeamMembers("team-1", ["abc", "bcd"]);
    mockTeamMembers("team-2", ["xyz", "zyx"]);
    const team1 = await teams.getTeamMembers("team-1");
    expect(team1).toEqual(["abc", "bcd"]);
    const team2 = await teams.getTeamMembers("team-2");
    expect(team2).toEqual(["xyz", "zyx"]);
  });

  test("should cache 1 call per team", async () => {
    mockTeamMembers("team-1", ["abc", "bcd"]);
    mockTeamMembers("team-2", ["xyz", "zyx"]);
    mockTeamMembers("team-3", ["qwerty", "dvorak"]);
    for (let i = 0; i < 10; i++) {
      const team1 = await teams.getTeamMembers("team-1");
      expect(team1).toEqual(["abc", "bcd"]);
      const team2 = await teams.getTeamMembers("team-2");
      expect(team2).toEqual(["xyz", "zyx"]);
      const team3 = await teams.getTeamMembers("team-3");
      expect(team3).toEqual(["qwerty", "dvorak"]);
    }

    expect(client.rest.teams.listMembersInOrg).toHaveBeenCalledTimes(3);
  });
});
