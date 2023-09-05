/* eslint-disable @typescript-eslint/ban-ts-comment */
import { PullRequest, PullRequestReview } from "@octokit/webhooks-types";
import { existsSync, openSync, readFileSync, unlinkSync } from "fs";
import { DeepMockProxy, Matcher, mock, mockDeep, MockProxy } from "jest-mock-extended";
import { join } from "path";

import { GitHubChecksApi } from "../github/check";
import { PullRequestApi } from "../github/pullRequest";
import { GitHubTeamsApi, TeamApi } from "../github/teams";
import { ActionLogger, GitHubClient } from "../github/types";
import { ActionRunner, RuleReport } from "../runner";

type ReportName =
  | "CI files"
  | "Core developers"
  | "Runtime files cumulus"
  | "Bridges subtree files"
  | "FRAME coders substrate";

/** Utility method to get a particular report from a list */
const getReport = (reports: RuleReport[], name: ReportName): RuleReport => {
  for (const report of reports) {
    if (report.name === name) {
      return report;
    }
  }
  throw new Error(`Report ${name} not found. Available reports are: ${reports.map((r) => r.name).join(". ")}`);
};

describe("Integration testing", () => {
  const file = join(__dirname, "./", "config.yml");
  const config = readFileSync(file, "utf8");

  const teamsMembers: [string, string[]][] = [
    ["ci", ["ci-1", "ci-2", "ci-3"]],
    ["release-engineering", ["re-1", "re-2", "re-3"]],
    ["core-devs", ["gavofyork", "bkchr", "core-1", "core-2"]],
    ["locks-review", ["gavofyork", "bkchr", "lock-1"]],
    ["polkadot-review", ["gavofyork", "bkchr", "pr-1", "pr-2"]],
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

  const mockReviews = (reviews: (Pick<PullRequestReview, "state" | "id"> & { login: string })[]) => {
    // convert name into ID
    const getHash = (input: string): number => {
      let hash = 0;
      const len = input.length;
      for (let i = 0; i < len; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0; // to 32bit integer
      }
      return Math.abs(hash);
    };

    const data = reviews.map(({ state, id, login }) => {
      return { state, id, user: { login, id: getHash(login) } };
    });

    // @ts-ignore because the official type and the library type do not match
    client.rest.pulls.listReviews.mockResolvedValue({ data });
  };

  const summaryTestFile = "./summary-test.html";

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

    // @ts-ignore missing more of the required types
    client.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: [], total_count: 0 } });
    client.rest.checks.create.mockResolvedValue({
      // @ts-ignore missing types
      data: { html_url: "demo", title: "title", output: { text: "output" } },
    });

    // Create file to upload the summary text (else it will fail)
    process.env.GITHUB_STEP_SUMMARY = summaryTestFile;
    openSync(summaryTestFile, "w");
  });

  afterEach(() => {
    // delete the summary test file
    if (existsSync(summaryTestFile)) {
      unlinkSync(summaryTestFile);
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

  describe("Core developers", () => {
    test("should request reviews ", async () => {
      // @ts-ignore
      client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "README.md" }] });
      const result = await runner.runAction({ configLocation: "abc" });
      expect(result.reports).toHaveLength(1);
      expect(result.conclusion).toBe("failure");
      const report = getReport(result.reports, "Core developers");
      expect(report.missingReviews).toBe(2);
    });

    test("should request only one review if author is member", async () => {
      // @ts-ignore
      client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "README.md" }] });
      pr.user.login = "gavofyork";
      const result = await runner.runAction({ configLocation: "abc" });
      expect(result.reports).toHaveLength(1);
      expect(result.conclusion).toBe("failure");
      const report = getReport(result.reports, "Core developers");
      expect(report.missingReviews).toBe(1);
    });

    test("should approve PR if it has enough approvals", async () => {
      // @ts-ignore
      client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "README.md" }] });
      mockReviews([
        { login: "core-1", state: "approved", id: 12 },
        { login: "core-2", state: "approved", id: 123 },
      ]);
      const result = await runner.runAction({ configLocation: "abc" });
      expect(result.reports).toHaveLength(0);
      expect(result.conclusion).toBe("success");
    });
  });

  test("should request a runtime upgrade review if the file is from runtime upgrades", async () => {
    // @ts-ignore
    client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "cumulus/parachains/common/src/example.rs" }] });

    const result = await runner.runAction({ configLocation: "abc" });
    expect(result.reports).toHaveLength(1);
    expect(result.conclusion).toBe("failure");
    const report = getReport(result.reports, "Runtime files cumulus");
    expect(report.missingReviews).toBe(2);
  });

  test("should request only one runtime upgrade review if the file is from runtime upgrades and the author belongs to one of the teams", async () => {
    // @ts-ignore
    client.rest.pulls.listFiles.mockResolvedValue({ data: [{ filename: "cumulus/parachains/common/src/example.rs" }] });
    pr.user.login = "gavofyork";
    const result = await runner.runAction({ configLocation: "abc" });
    expect(result.reports).toHaveLength(1);
    expect(result.conclusion).toBe("failure");
    const report = getReport(result.reports, "Runtime files cumulus");
    expect(report.missingReviews).toBe(2);
  });

  describe("Combinations", () => {
    test("should use same reviewer for separate rules", async () => {
      client.rest.pulls.listFiles.mockResolvedValue({
        // @ts-ignore
        data: [{ filename: "cumulus/parachains/common/src/example.rs" }, { filename: "README.md" }],
      });
      mockReviews([{ state: "approved", id: 123, login: "gavofyork" }]);
      const newResult = await runner.runAction({ configLocation: "abc" });
      expect(newResult.reports.map((r) => r.missingReviews).reduce((a, b) => a + b, 0)).toBe(3);
    });

    test("should use same reviewers for separate rules", async () => {
      client.rest.pulls.listFiles.mockResolvedValue({
        // @ts-ignore
        data: [{ filename: "cumulus/parachains/common/src/example.rs" }, { filename: "README.md" }],
      });
      mockReviews([
        { state: "approved", id: 123, login: "gavofyork" },
        { state: "approved", id: 124, login: "bkchr" },
      ]);
      const result = await runner.runAction({ configLocation: "abc" });
      expect(result.conclusion).toEqual("success");
    });
  });
});
