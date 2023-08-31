/* eslint-disable @typescript-eslint/ban-ts-comment */
import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";
import { readFileSync } from "fs";
import { DeepMockProxy, Matcher, mock, mockDeep, MockProxy } from "jest-mock-extended";
import { join } from "path";

import { GitHubChecksApi } from "../github/check";
import { PullRequestApi } from "../github/pullRequest";
import { GitHubTeamsApi, TeamApi } from "../github/teams";
import { ActionLogger, GitHubClient } from "../github/types";
import { ActionRunner } from "../runner";

describe("Integration testing", () => {
  const file = join(__dirname, "./", "config.yml");
  const config = readFileSync(file, "utf8");

  const teamsMembers: [string, string[]][] = [
    ["ci", ["ci-1", "ci-2", "ci-3"]],
    ["release-engineering", ["re-1", "re-2", "re-3"]],
    ["core-devs", ["gavofyork", "bkchr", "core-1", "core-2"]],
    ["locks-review", ["gavofyork", "bkchr", "lock-1"]],
    ["bridges-core", ["bridge-1", "bridge-2", "bridge-3"]],
    ["frame-coders", ["frame-1", "frame-2", "frame-3"]],
  ];

  let api: PullRequestApi;
  let logger: MockProxy<ActionLogger>;
  let client: DeepMockProxy<GitHubClient>;
  let pr: DeepMockProxy<PullRequest>;
  let checks: GitHubChecksApi;
  let teams: TeamApi;
  let runner: ActionRunner;

  const generateReviewer = (
    state: "commented" | "changes_requested" | "approved" | "dismissed",
    user: string,
  ): PullRequestReview =>
    ({
      state,
      user: { login: user, id: Math.floor(Math.random() * 1000) },
      id: Math.floor(Math.random() * 1000),
    }) as PullRequestReview;

  const mockReviews = (reviews: PullRequestReview[]) => {
    // @ts-ignore because the official type and the library type do not match
    client.rest.pulls.listReviews.mockResolvedValue({ data: reviews });
  };

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
    mockReviews([]);
    for (const [teamName, members] of teamsMembers) {
      client.rest.teams.listMembersInOrg
        // @ts-ignore as the error is related to the matcher type
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
        .calledWith(new Matcher<{ team_slug: string }>((value) => value.team_slug === teamName, "Different team name"))
        .mockResolvedValue({
          // @ts-ignore as we don't need the full type
          data: members.map((m) => {
            return { login: m };
          }),
        });
    }
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
  test("should not report problems on empty files", async () => {
    // @ts-ignore
    client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "README.md" }] });
    await runner.runAction({ configLocation: "abc" });
  });
});
