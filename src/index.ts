import { debug, getBooleanInput, getInput, info, setFailed, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { Context } from "@actions/github/lib/context";
import { PullRequest } from "@octokit/webhooks-types";

import { GitHubChecksApi } from "./github/check";
import { PullRequestApi } from "./github/pullRequest";
import { GitHubTeamsApi } from "./github/teams";
import { CheckData } from "./github/types";
import { PolkadotFellows } from "./polkadot/fellows";
import { ActionRunner } from "./runner";
import { generateCoreLogger } from "./util";

export interface Inputs {
  configLocation: string;
  /** GitHub's action default secret */
  repoToken: string;
  /** Should automatically request missing reviewers */
  requestReviewers?: boolean;
  /** A custom access token with the read:org access */
  teamApiToken: string;
  /** Number of the PR to analyze. Optional when it is triggered by `pull_request` event */
  prNumber: number | null;
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
  const requestReviewers = !!getInput("request-reviewers", { required: false });
  const teamApiToken = getInput("team-token", { required: true });
  const prNumber = getInput("pr-number");

  return { configLocation, requestReviewers, repoToken, teamApiToken, prNumber: prNumber ? parseInt(prNumber) : null };
};

const repo = getRepo(context);

setOutput("repo", `${repo.owner}/${repo.repo}`);

debug("Got payload:" + JSON.stringify(context.payload.pull_request));

const runAction = async (): Promise<Pick<CheckData, "conclusion">> => {
  const inputs = getInputs();

  const actionId = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;

  const actionInstance = getOctokit(inputs.repoToken);

  let pr: PullRequest;
  if (context.payload.pull_request) {
    pr = context.payload.pull_request as PullRequest;
  } else if (inputs.prNumber) {
    debug(`Fetching pull request number #${inputs.prNumber}`);
    const { data } = await actionInstance.rest.pulls.get({ ...repo, pull_number: inputs.prNumber });
    pr = data as PullRequest;
  } else {
    throw new Error("Payload is not `pull_request` and PR number wasn't provided");
  }

  const api = new PullRequestApi(actionInstance, pr, generateCoreLogger());

  const logger = generateCoreLogger();

  const teamApi = new GitHubTeamsApi(getOctokit(inputs.teamApiToken), repo.owner, logger);

  const checks = new GitHubChecksApi(getOctokit(inputs.teamApiToken), pr, logger, actionId);

  const fellows = new PolkadotFellows(logger);

  const runner = new ActionRunner(api, teamApi, fellows, checks, logger);

  const result = await runner.runAction(inputs);

  setOutput("report", JSON.stringify(result));

  return result;
};

runAction()
  .then((result) => {
    info(`Action run without problem. Evaluation result was '${result.conclusion}'`);
  })
  .catch((error) => {
    console.error(error);
    setFailed(error as Error | string);
  });
