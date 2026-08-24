import { setTimeout as sleep } from "node:timers/promises";

import { ActionLogger } from "../github/types";

const DEFAULT_MAX_BLOCK_AGE_MS = 5 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_SYNC_TIMEOUT_MS = 3 * 60 * 1000;

type SyncOptions = {
  maxBlockAgeMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
  syncTimeoutMs: number;
  now: () => number;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

const wait = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  await sleep(milliseconds, undefined, { signal });
};

function syncTimeoutError(chainName: string, timestamp?: number): Error {
  const latestTimestamp =
    timestamp === undefined || !Number.isFinite(timestamp)
      ? "No valid finalized timestamp was received."
      : `The latest finalized timestamp was ${new Date(timestamp).toISOString()}.`;

  return new Error(`Timed out waiting for the ${chainName} light client to sync. ${latestTimestamp}`);
}

/**
 * Wait until a light client exposes recent finalized state.
 *
 * Smoldot starts at the checkpoint bundled in the chain spec. PAPI can answer
 * storage queries at that checkpoint before smoldot has caught up, so client
 * initialization alone is not a sufficient readiness signal.
 */
export async function waitForRecentFinalizedBlock(
  chainName: string,
  getFinalizedTimestamp: (signal: AbortSignal) => Promise<bigint>,
  logger: ActionLogger,
  overrides: Partial<SyncOptions> = {},
): Promise<void> {
  const options: SyncOptions = {
    maxBlockAgeMs: DEFAULT_MAX_BLOCK_AGE_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    syncTimeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
    now: Date.now,
    wait,
    ...overrides,
  };
  const startedAt = options.now();
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), options.syncTimeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeoutController.signal, options.signal])
    : timeoutController.signal;
  let timestamp: number | undefined;

  logger.info(`Waiting for the ${chainName} light client to sync`);

  try {
    while (true) {
      timestamp = Number(await getFinalizedTimestamp(signal));
      const now = options.now();
      const clockDifference = Math.abs(now - timestamp);

      if (clockDifference <= options.maxBlockAgeMs) {
        logger.info(`${chainName} light client has recent finalized state (${new Date(timestamp).toISOString()})`);
        return;
      }

      if (now - startedAt >= options.syncTimeoutMs) {
        throw syncTimeoutError(chainName, timestamp);
      }

      logger.debug(
        `${chainName} finalized state is not recent yet ` +
          `(${new Date(timestamp).toISOString()}); waiting for smoldot to catch up`,
      );
      await options.wait(options.pollIntervalMs, signal);
    }
  } catch (error) {
    if (timeoutController.signal.aborted) throw syncTimeoutError(chainName, timestamp);
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error(`Stopped waiting for the ${chainName} light client to sync`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
