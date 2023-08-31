/* eslint-disable @typescript-eslint/ban-ts-comment */
import { PullRequest } from "@octokit/webhooks-types";
import { readFileSync } from "fs";
import { DeepMockProxy, mock, mockDeep, MockProxy } from "jest-mock-extended";
import { join } from "path";

import { GitHubChecksApi } from "../github/check";
import { PullRequestApi } from "../github/pullRequest";
import { GitHubTeamsApi, TeamApi } from "../github/teams";
import { ActionLogger, GitHubClient } from "../github/types";
import { ActionRunner } from "../runner";

describe("Integration testing", () => {
  const file = join(__dirname, "./", "config.yml");
  const config = readFileSync(file, "utf8");

  let api: PullRequestApi;
  let logger: MockProxy<ActionLogger>;
  let client: DeepMockProxy<GitHubClient>;
  let pr: DeepMockProxy<PullRequest>;
  let checks: GitHubChecksApi;
  let teams: TeamApi;
  let runner: ActionRunner;
  beforeEach(() => {
    logger = mock<ActionLogger>();
    client = mockDeep<GitHubClient>();
    pr = mockDeep<PullRequest>();
    pr.number = 99;
    pr.base.repo.owner.login = "org";

    api = new PullRequestApi(client, pr, logger, "");
    teams = new GitHubTeamsApi(client, "org", logger);
    checks = new GitHubChecksApi(client, pr, logger, "example");
    runner = new ActionRunner(api, teams, checks, logger);

    // @ts-ignore problem with the type being mocked
    client.rest.repos.getContent.mockResolvedValue({ data: { content: Buffer.from(config, "utf-8") } });
  });

  describe("Error in config", () => {
    test("should fail if it can not get the config", async () => {
      // @ts-ignore this could also be an error
      client.rest.repos.getContent.mockResolvedValue({ data: {} });

      await expect(runner.runAction({ configLocation: "example" })).rejects.toThrowError("has no content");
    });

    test("should fail with invalid config", async () => {
      const invalidConfig = `
      rules:
      - name: Failing case
        condition:
          include: 
            - '.*'
          exclude: 
            - 'example'
        type: basic
        `;

      // @ts-ignore this could also be an error
      client.rest.repos.getContent.mockResolvedValue({ data: { content: Buffer.from(invalidConfig, "utf-8") } });

      await expect(runner.runAction({ configLocation: "example" })).rejects.toThrowError(
        "Configuration for rule 'Failing case' is invalid",
      );
    });

    test("should fail with invalid regex", async () => {
      const invalidRegex = "(?(";
      const invalidConfig = `
      rules:
        - name: Default review
          condition:
            include: 
                - '${invalidRegex}'
          type: basic
          teams:
            - team-example
        `;

      // @ts-ignore this could also be an error
      client.rest.repos.getContent.mockResolvedValue({ data: { content: Buffer.from(invalidConfig, "utf-8") } });

      await expect(runner.runAction({ configLocation: "example" })).rejects.toThrowError(
        "Regular expression is invalid",
      );
    });
  });
});
