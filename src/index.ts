import { debug, getInput, info, setFailed, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { Context } from "@actions/github/lib/context";
import { PullRequest } from "@octokit/webhooks-types";

import { PullRequestApi } from "./github/pullRequest";
import { GitHubTeamsApi } from "./github/teams";
import { ActionRunner } from "./runner";
import { generateCoreLogger } from "./util";

export interface Inputs {
  configLocation: string;
  /** GitHub's action default secret */
  repoToken: string;
  /** A custom access token with the read:org access */
  teamApiToken: string;
}

const getRepo = (ctx: Context) => {
  let repo = getInput("repo", { required: false });
  if (!repo) {
    repo = ctx.repo.repo;
  }

  let owner = getInput("owner", { required: false });
  if (!owner) {
    owner = ctx.repo.owner;
  }

  return { repo, owner };
};

const getInputs = (): Inputs => {
  const configLocation = getInput("config-file");
  const repoToken = getInput("repo-token", { required: true });
  const teamApiToken = getInput("team-token", { required: true });

  return { configLocation, repoToken, teamApiToken };
};

const repo = getRepo(context);

setOutput("repo", `${repo.owner}/${repo.repo}`);

if (!context.payload.pull_request) {
  throw new Error("No pull request event");
}

debug("Got payload:" + JSON.stringify(context.payload.pull_request));

const inputs = getInputs();

const actionId = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;

const api = new PullRequestApi(
  getOctokit(inputs.repoToken),
  context.payload.pull_request as PullRequest,
  generateCoreLogger(),
  repo,
  actionId,
);

const logger = generateCoreLogger();

const teamApi = new GitHubTeamsApi(inputs.teamApiToken, repo.owner, logger);

const runner = new ActionRunner(api, teamApi, logger);

runner
  .runAction(inputs)
  .then((result) => {
    info(`Action run without problem. Evaluation result was '${result.conclusion}'`);
    setOutput("report", JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error);
    setFailed(error as Error | string);
  });
