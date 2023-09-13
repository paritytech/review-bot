/* eslint-disable @typescript-eslint/unbound-method */
import { mock, mockClear, MockProxy } from "jest-mock-extended";

import { ActionLogger, TeamApi } from "../github/types";
import { PolkadotFellows } from "../polkadot/fellows";

describe("CAPI test", () => {
  let fellows: TeamApi;
  let logger: MockProxy<ActionLogger>;

  beforeEach(() => {
    logger = mock<ActionLogger>();
    fellows = new PolkadotFellows(logger);
  });

  test("Should fetch fellows", async () => {
    const members = await fellows.getTeamMembers("2");
    expect(members.length).toBeGreaterThan(0);
  });

  test("Should cache fellows", async () => {
    const members = await fellows.getTeamMembers("2");
    expect(members.length).toBeGreaterThan(0);
    expect(logger.debug).toHaveBeenCalledWith("Connecting to collective parachain");
    mockClear(logger);
    const members2 = await fellows.getTeamMembers("2");
    expect(members2.length).toBeGreaterThan(0);
    expect(logger.debug).not.toHaveBeenCalledWith("Connecting to collective parachain");
  });
});
