import { debug, getInput, info, setFailed, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { Context } from "@actions/github/lib/context";
import { PullRequest } from "@octokit/webhooks-types";

import { PullRequestApi } from "./github/pullRequest";
import { ActionRunner } from "./runner";
import { generateCoreLogger } from "./util";

export interface Inputs {
  configLocation: string;
  /** GitHub's action default secret */
  repoToken: string;
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

  return { configLocation, repoToken };
};

const repo = getRepo(context);

setOutput("repo", `${repo.owner}/${repo.repo}`);

if (!context.payload.pull_request) {
  throw new Error("No pull request event");
}

debug("Got payload:" + JSON.stringify(context.payload.pull_request));

const inputs = getInputs();

const api = new PullRequestApi(
  getOctokit(inputs.repoToken),
  context.payload.pull_request as PullRequest,
  generateCoreLogger(),
);

const runner = new ActionRunner(api, generateCoreLogger());

runner
  .runAction(inputs)
  .then((result) => {
    if (result) {
      info("Action completed succesfully");
    } else {
      setFailed("Action failed");
    }
  })
  .catch(setFailed);
