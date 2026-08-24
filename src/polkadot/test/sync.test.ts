/* eslint-disable @typescript-eslint/unbound-method */
import { mock, MockProxy } from "jest-mock-extended";

import { ActionLogger } from "../../github/types";
import { waitForRecentFinalizedBlock } from "../sync";

describe("waitForRecentFinalizedBlock", () => {
  let logger: MockProxy<ActionLogger>;

  beforeEach(() => {
    logger = mock<ActionLogger>();
  });

  test("returns when finalized state is recent", async () => {
    const now = 1_000_000;
    const getFinalizedTimestamp = jest.fn().mockResolvedValue(BigInt(now - 1000));
    const wait = jest.fn();

    await waitForRecentFinalizedBlock("Collectives Polkadot", getFinalizedTimestamp, logger, {
      maxBlockAgeMs: 5000,
      now: () => now,
      wait,
    });

    expect(getFinalizedTimestamp).toHaveBeenCalledTimes(1);
    expect(getFinalizedTimestamp).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(wait).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith(
      "Collectives Polkadot light client has recent finalized state (1970-01-01T00:16:39.000Z)",
    );
  });

  test("waits for stale finalized state to catch up", async () => {
    let now = 1_000_000;
    const getFinalizedTimestamp = jest
      .fn()
      .mockResolvedValueOnce(BigInt(now - 100_000))
      .mockResolvedValueOnce(BigInt(now));
    const wait = jest.fn((milliseconds: number, _signal: AbortSignal) => {
      now += milliseconds;
      return Promise.resolve();
    });

    await waitForRecentFinalizedBlock("Collectives Polkadot", getFinalizedTimestamp, logger, {
      maxBlockAgeMs: 5000,
      now: () => now,
      pollIntervalMs: 1000,
      wait,
    });

    expect(getFinalizedTimestamp).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenLastCalledWith(
      "Collectives Polkadot light client has recent finalized state (1970-01-01T00:16:40.000Z)",
    );
  });

  test("fails instead of querying stale state after the timeout", async () => {
    let now = 1_000_000;
    const getFinalizedTimestamp = jest.fn().mockResolvedValue(BigInt(now - 100_000));
    const wait = jest.fn((milliseconds: number, _signal: AbortSignal) => {
      now += milliseconds;
      return Promise.resolve();
    });

    await expect(
      waitForRecentFinalizedBlock("Collectives Polkadot", getFinalizedTimestamp, logger, {
        maxBlockAgeMs: 5000,
        now: () => now,
        pollIntervalMs: 1000,
        syncTimeoutMs: 2000,
        wait,
      }),
    ).rejects.toThrow("Timed out waiting for the Collectives Polkadot light client to sync");

    expect(getFinalizedTimestamp).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  test("aborts a stalled timestamp query at the timeout", async () => {
    const getFinalizedTimestamp = jest.fn(
      (signal: AbortSignal) =>
        new Promise<bigint>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );

    await expect(
      waitForRecentFinalizedBlock("Collectives Polkadot", getFinalizedTimestamp, logger, {
        syncTimeoutMs: 10,
      }),
    ).rejects.toThrow("Timed out waiting for the Collectives Polkadot light client to sync");
  });
});
