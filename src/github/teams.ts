import { getOctokit } from "@actions/github";

import { ActionLogger, GitHubClient } from "./types";

/**
 * Interface for the acquisition of members of a team.
 * As we may be using blockchain instead of GitHub teams, let's wrap the functionality inside a interface
 */
export interface TeamApi {
  /** Returns all the GitHub account's logins which belong to a given team. */
  getTeamMembers(teamName: string): Promise<string[]>;
}

/**
 * Implementation of the TeamApi interface using GitHub teams
 * @see-also {@link TeamApi}
 */
export class GitHubTeamsApi implements TeamApi {
  private readonly api: GitHubClient;

  /** Cache variable so we don't request the same information from GitHub in one run  */
  private readonly teamsCache: Map<string, string[]> = new Map<string, string[]>();

  /**
   * @param teamOrgToken GitHub token with read:org access. It is used to access the organization team members
   * @param org Name of the organization the team will belong to. Should be available in context.repo.owner
   */
  constructor(teamOrgToken: string, private readonly org: string, private readonly logger: ActionLogger) {
    this.api = getOctokit(teamOrgToken);
  }

  async getTeamMembers(teamName: string): Promise<string[]> {
    // We first verify that this information hasn't been fetched yet
    if (!this.teamsCache.has(teamName)) {
      this.logger.debug(`Fetching team '${teamName}'`);
      const { data } = await this.api.rest.teams.listMembersInOrg({ org: this.org, team_slug: teamName });
      const members = data.map((d) => d.login);
      this.teamsCache.set(teamName, members);
    }
    return this.teamsCache.get(teamName) as string[];
  }
}
