import { debug, getInput, setOutput } from "@actions/core";
import { context } from "@actions/github";
import { Context } from "@actions/github/lib/context";

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
}

const repo = getRepo(context);

setOutput("repo", `${repo.owner}/${repo.repo}`);

if (!context.payload.pull_request) {
    throw new Error("No pull request event");
}

debug("Got payload:" + JSON.stringify(context.payload.pull_request));

setOutput("approved", "yes");
