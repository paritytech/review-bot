import type { GitHub } from "@actions/github/lib/utils";

export interface ActionLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string | Error): void;
  error(message: string | Error): void;
}

export type GitHubClient = InstanceType<typeof GitHub>;

export interface CheckData {
  conclussion: "action_required" | "failure" | "success";
  output: {
    title: string;
    summary: string;
    text: string;
  };
}
