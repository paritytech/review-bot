import { mock, MockProxy } from "jest-mock-extended";

import { PullRequestApi } from "../../github/pullRequest";
import { ActionLogger } from "../../github/types";
import { ActionRunner } from "../../runner";
import { TestLogger } from "../logger";

describe.only("Runner", () => {
  let api: MockProxy<PullRequestApi>;
  let runner: ActionRunner;
  let logger: ActionLogger;
  beforeEach(() => {
    logger = new TestLogger();
    api = mock<PullRequestApi>();
    runner = new ActionRunner(api, logger);
  });

  describe("Config parsing", () => {

    test("should get minimal config", async () => {
        api.getConfigFile.mockResolvedValue(`
        rules:
          - name: Default review
            condition:
              include: 
                - '.*'
              exclude: 
                - 'example'
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests).toBeNull;
    });

    describe("preventReviewRequests field", () => {
    test("should get team", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'

      preventReviewRequests:
        teams:
            - team-a
            - team-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests.teams).toEqual(["team-a", "team-b"]);
    });


    test("should get users", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'

      preventReviewRequests:
        users:
            - user-a
            - user-b
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests.users).toEqual(["user-a", "user-b"]);
    });

    test("should pass if preventReviewRequests is not assigned", async () => {
      api.getConfigFile.mockResolvedValue(`
      rules:
        - name: Default review
          condition:
            include: 
                - '.*'
            exclude: 
                - 'example'
        `);
      const config = await runner.getConfigFile("");
      expect(config.preventReviewRequests).toBeNull;
    });
  });
});
});
