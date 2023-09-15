import type { GitHub } from "@actions/github/lib/utils";

/**
 * Interface for the acquisition of members of a team.
 * As we may be using blockchain instead of GitHub teams, let's wrap the functionality inside a interface
 */
export interface TeamApi {
  /** Returns all the GitHub account's logins which belong to a given team. */
  getTeamMembers(teamName: string): Promise<string[]>;
}

export interface ActionLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string | Error): void;
  error(message: string | Error): void;
}

export type GitHubClient = InstanceType<typeof GitHub>;

export interface CheckData {
  conclusion: "action_required" | "failure" | "success";
  output: {
    title: string;
    summary: string;
    text: string;
  };
}
