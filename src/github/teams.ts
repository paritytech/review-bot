import { ActionLogger, GitHubClient, TeamApi } from "./types";

/**
 * Implementation of the TeamApi interface using GitHub teams
 * @see-also {@link TeamApi}
 */
export class GitHubTeamsApi implements TeamApi {
  /** Cache variable so we don't request the same information from GitHub in one run  */
  private readonly teamsCache: Map<string, string[]> = new Map<string, string[]>();

  /**
   * @param teamOrgToken GitHub token with read:org access. It is used to access the organization team members
   * @param org Name of the organization the team will belong to. Should be available in context.repo.owner
   */
  constructor(
    private readonly api: GitHubClient,
    private readonly org: string,
    private readonly logger: ActionLogger,
  ) {}

  async getTeamMembers(teamName: string): Promise<string[]> {
    // We first verify that this information hasn't been fetched yet
    if (!this.teamsCache.has(teamName)) {
      this.logger.debug(`Fetching team '${teamName}'`);
      const { data } = await this.api.rest.teams.listMembersInOrg({ org: this.org, team_slug: teamName });
      const members = data.map((d) => d.login);
      this.logger.debug(`Members are ${JSON.stringify(members)}`);
      this.teamsCache.set(teamName, members);
    }
    return this.teamsCache.get(teamName) as string[];
  }
}
