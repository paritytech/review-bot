/* eslint-disable @typescript-eslint/unbound-method */
import { mock, mockClear, MockProxy } from "jest-mock-extended";

import { ActionLogger, TeamApi } from "../github/types";
import { PolkadotFellows } from "../polkadot/fellows";

const timeout = 60_000;

describe("CAPI test", () => {
  let fellows: TeamApi;
  let logger: MockProxy<ActionLogger>;

  beforeEach(() => {
    logger = mock<ActionLogger>();
    fellows = new PolkadotFellows(logger);
  });

  test(
    "Should fetch fellows",
    async () => {
      const members = await fellows.getTeamMembers("2");
      expect(members.length).toBeGreaterThan(0);
    },
    timeout,
  );

  test(
    "Should cache fellows",
    async () => {
      const members = await fellows.getTeamMembers("2");
      expect(members.length).toBeGreaterThan(0);
      expect(logger.info).toHaveBeenCalledWith("Initializing the people client");
      expect(logger.info).toHaveBeenCalledWith("Initializing the collectives client");
      mockClear(logger);
      const members2 = await fellows.getTeamMembers("2");
      expect(members2.length).toBeGreaterThan(0);
      expect(logger.info).not.toHaveBeenCalledWith("Initializing the people client");
      expect(logger.info).not.toHaveBeenCalledWith("Initializing the collectives client");
    },
    timeout,
  );

  describe("Fetch by rank", () => {
    beforeEach(() => {
      const fellowsMap = new Map<string, number>();
      fellowsMap.set("user-1", 1);
      fellowsMap.set("user-2", 2);
      fellowsMap.set("user-3", 3);
      fellowsMap.set("user-4", 4);
      fellowsMap.set("user-5", 5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fellows as any).fellowsCache = fellowsMap;
    });
    test(
      "should return fellows of a give rank",
      async () => {
        const rank1 = await fellows.getTeamMembers("1");
        expect(rank1).toEqual(["user-1", "user-2", "user-3", "user-4", "user-5"]);

        const rank2 = await fellows.getTeamMembers("2");
        expect(rank2).toEqual(["user-2", "user-3", "user-4", "user-5"]);

        const rank3 = await fellows.getTeamMembers("3");
        expect(rank3).toEqual(["user-3", "user-4", "user-5"]);

        const rank4 = await fellows.getTeamMembers("4");
        expect(rank4).toEqual(["user-4", "user-5"]);

        const rank5 = await fellows.getTeamMembers("5");
        expect(rank5).toEqual(["user-5"]);
      },
      timeout,
    );

    test(
      "should throw if there are no fellows available",
      async () => {
        await expect(fellows.getTeamMembers("6")).rejects.toThrowError(
          "Found no members of rank 6 or higher. Please see debug logs",
        );
      },
      timeout,
    );
  });
});
