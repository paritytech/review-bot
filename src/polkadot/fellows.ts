/* eslint-disable @typescript-eslint/ban-ts-comment */
import { ApiPromise, WsProvider } from "@polkadot/api";

import { ActionLogger, TeamApi } from "../github/types";

type FellowData = { address: string; rank: number };

export class PolkadotFellows implements TeamApi {
  private fellowsCache: Map<string, number> = new Map<string, number>();

  constructor(private readonly logger: ActionLogger) {}

  async fetchAllFellows(): Promise<Map<string, number>> {
    let api: ApiPromise;
    this.logger.debug("Connecting to collective parachain");
    // we connect to the collective rpc node
    const wsProvider = new WsProvider("wss://polkadot-collectives-rpc.polkadot.io");
    api = await ApiPromise.create({ provider: wsProvider });
    try {
      // We fetch all the members
      const membersObj = await api.query.fellowshipCollective.members.entries();

      // We iterate over the fellow data and convert them into usable values
      const fellows: FellowData[] = [];
      for (const [key, rank] of membersObj) {
        // @ts-ignore
        const [address]: [string] = key.toHuman();
        fellows.push({ address, ...(rank.toHuman() as object) } as FellowData);
      }
      this.logger.debug(JSON.stringify(fellows));

      // Once we obtained this information, we disconnect this api.
      await api.disconnect();

      this.logger.debug("Connecting to relay parachain.");
      // We connect to the relay chain
      api = await ApiPromise.create({ provider: new WsProvider("wss://rpc.polkadot.io") });

      // We iterate over the different members and extract their data
      const users: Map<string, number> = new Map<string, number>();
      for (const fellow of fellows) {
        this.logger.debug(`Fetching identity of '${fellow.address}', rank: ${fellow.rank}`);
        const fellowData = (await api.query.identity.identityOf(fellow.address)).toHuman() as
          | Record<string, unknown>
          | undefined;

        // If the identity is null, we ignore it.
        if (!fellowData) {
          this.logger.debug("Identity is null. Skipping");
          continue;
        }

        // @ts-ignore
        const additional = fellowData.info.additional as [{ Raw: string }, { Raw: string }][] | undefined;

        // If it does not have additional data (GitHub handle goes here) we ignore it
        if (!additional || additional.length < 1) {
          this.logger.debug("Additional data is null. Skipping");
          continue;
        }

        for (const additionalData of additional) {
          const [key, value] = additionalData;
          // We verify that they have an additional data of the key "github"
          // If it has a handle defined, we push it into the array
          if (key?.Raw && key?.Raw === "github" && value?.Raw && value?.Raw.length > 0) {
            this.logger.debug(`Found handles: '${value.Raw}'`);
            // We add it to the array and remove the @ if they add it to the handle
            users.set(value.Raw.replace("@", ""), fellow.rank);
          }
        }
      }

      this.logger.info(`Found users: ${JSON.stringify(Array.from(users.entries()))}`);

      // We disconnect the API before returning the object
      await api.disconnect();
      return users;
    } catch (error) {
      this.logger.error(error);
      await api.disconnect();
      throw error;
    }
  }

  async getTeamMembers(ranking: string): Promise<string[]> {
    const requiredRank = Number(ranking);
    this.logger.info(`Fetching members of rank '${requiredRank}' or higher`);

    if (this.fellowsCache.size < 1) {
      this.logger.debug("Cache not found. Fetching fellows.");
      this.fellowsCache = await this.fetchAllFellows();
    }
    const users: string[] = [];
    for (const [user, rank] of this.fellowsCache) {
      if (rank >= requiredRank) {
        users.push(user);
      }
    }

    if (users.length === 0) {
      throw new Error(`Found no members of rank ${requiredRank} or higher. Please see debug logs`);
    }

    this.logger.info(`GitHub members of rank '${requiredRank}' or higher are: ${JSON.stringify(users)}`);

    return users;
  }
}
