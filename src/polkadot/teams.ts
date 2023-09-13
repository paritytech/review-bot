import { ApiPromise, WsProvider } from "@polkadot/api";

import { TeamApi } from "../github/types";

type FellowData = { address: string; rank: number };

export class PolkadotFellows implements TeamApi {
  private fellowsCache: Map<string, number> = new Map<string, number>();

  async fetchAllFellows(): Promise<Map<string, number>> {
    let api: ApiPromise;
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
        const [address] = key.toHuman();
        fellows.push({ address, ...(rank.toHuman() as object) } as FellowData);
      }
      console.log(fellows);

      // Once we obtained this information, we disconnect this api.
      await api.disconnect();

      // We connect to the relay chain
      api = await ApiPromise.create({ provider: new WsProvider("wss://rpc.polkadot.io") });

      // We iterate over the different members and extract their data
      const users: Map<string, number> = new Map<string, number>();
      for (const fellow of fellows) {
        const fellowData = (await api.query.identity.identityOf(fellow.address)).toHuman();
        // If the identity is null, we ignore it.
        if (!fellowData) {
          continue;
        }

        // @ts-ignore
        const additional = fellowData.info.additional;

        // If it does not have additional data (GitHub handle goes here) we ignore it
        if (!additional || additional.length < 1) {
          continue;
        }

        for (const additionalData of additional) {
          const [key, value]: [{ Raw: string }, { Raw: string }] = additionalData;
          // We verify that they have an additional data of the key "github"
          if (key.Raw && key.Raw === "github") {
            // If it has a handle defined, we push it into the array
            if (value && value.Raw) {
              // We add it to the array and remove the @ if they add it to the handle
              users.set(value.Raw.replace("@", ""), fellow.rank);
            }
          }
        }
      }

      console.log("GitHub users", users);

      // We disconnect the API before returning the object
      await api.disconnect();
      return users;
    }
    catch (error) {
      await api.disconnect();
      console.error(error);
      throw error;
    }
  }

  async getTeamMembers(ranking: string): Promise<string[]> {
    if (this.fellowsCache.size < 1) {
      this.fellowsCache = await this.fetchAllFellows();
    }
    console.log(`Fetching members of rank ${ranking} or higher`);
    const requiredRank = Number(ranking);
    const users: string[] = [];
    for (const [user, rank] of this.fellowsCache) {
      if (rank >= requiredRank) {
        users.push(user);
      }
    }

    return users;
  }
}
