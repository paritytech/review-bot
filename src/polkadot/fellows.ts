import { collectives, IdentityData, people } from "@polkadot-api/descriptors";
import { Binary, createClient, SS58String, TypedApi } from "polkadot-api";
import { chainSpec as polkadotChainSpec } from "polkadot-api/chains/polkadot";
import { chainSpec as collectivesChainSpec } from "polkadot-api/chains/polkadot_collectives";
import { chainSpec as peopleChainSpec } from "polkadot-api/chains/polkadot_people";
import { getSmProvider } from "polkadot-api/sm-provider";
import { start } from "smoldot";

import { ActionLogger, TeamApi } from "../github/types";

type FellowData = { address: string; rank: number };

export class PolkadotFellows implements TeamApi {
  private fellowsCache: Map<string, number> = new Map<string, number>();

  constructor(private readonly logger: ActionLogger) {}

  private async getGhHandle(
    address: SS58String,
    peopleApi: TypedApi<typeof people>,
    logger: ActionLogger,
  ): Promise<string | undefined> {
    logger.debug(`Fetching identity of '${address}'`);

    const identityOf = await peopleApi.query.Identity.IdentityOf.getValue(address);

    if (identityOf) {
      const [identity] = identityOf;
      const github = readIdentityData(identity.info.github);

      if (!github) {
        logger.debug(`'${address}' does not have an additional field named 'github'`);
        return;
      }

      const handle = github.asText().replace("@", "") as string;

      if (handle) {
        logger.info(`Found github handle for '${address}': '${handle}'`);
      } else {
        logger.debug(`'${address}' does not have a GitHub handle`);
        return;
      }
      return handle;
    }

    logger.debug(`Identity of '${address}' is null. Checking for super identity`);

    const superIdentityAddress = (await peopleApi.query.Identity.SuperOf.getValue(address))?.[0];

    if (superIdentityAddress) {
      logger.debug(`'${address}' has a super identity: '${superIdentityAddress}'. Fetching that identity`);
      return await this.getGhHandle(superIdentityAddress, peopleApi, logger);
    } else {
      logger.debug(`No superidentity for ${address} found.`);
      return undefined;
    }
  }

  private async fetchAllFellows(logger: ActionLogger): Promise<Map<string, number>> {
    logger.info("Initializing smoldot");
    const smoldot = start();

    try {
      // Create smoldot chain with Polkadot Relay Chain
      const smoldotRelayChain = await smoldot.addChain({
        chainSpec: polkadotChainSpec,
      });

      // Add the people chain to smoldot
      const peopleParachain = await smoldot.addChain({
        chainSpec: peopleChainSpec,
        potentialRelayChains: [smoldotRelayChain],
      });

      // Initialize the smoldot provider
      const jsonRpcProvider = getSmProvider(peopleParachain);
      logger.info("Initializing the people client");
      const peopleClient = createClient(jsonRpcProvider);

      // Get the types for the people client
      const peopleApi = peopleClient.getTypedApi(people);

      logger.info("Initializing the collectives client");

      const collectiveRelayChain = await smoldot.addChain({
        chainSpec: collectivesChainSpec,
        potentialRelayChains: [smoldotRelayChain],
      });
      const collectiveJsonRpcProvider = getSmProvider(collectiveRelayChain);
      logger.info("Initializing the relay client");
      const collectivesClient = createClient(collectiveJsonRpcProvider);
      const collectivesApi = collectivesClient.getTypedApi(collectives);

      // Pull the members of the FellowshipCollective
      const memberEntries = await collectivesApi.query.FellowshipCollective.Members.getEntries();

      // We no longer need the collective client, so let's destroy it
      collectivesClient.destroy();

      // Build the Array of FellowData and filter out candidates (zero rank members)
      const fellows: FellowData[] = memberEntries
        .map(({ keyArgs: [address], value: rank }) => {
          return { address, rank };
        })
        .filter(({ rank }) => rank > 0);
      logger.debug(JSON.stringify(fellows));

      // Let's now pull the GH handles of the fellows
      const users = await Promise.all(
        fellows.map(async ({ address, rank }) => {
          return {
            address,
            rank,
            githubHandle: await this.getGhHandle(address, peopleApi, logger),
          };
        }),
      );
      logger.info(`Found users: ${JSON.stringify(Array.from(users.entries()))}`);

      const userMap: Map<string, number> = new Map<string, number>();

      for (const { githubHandle, rank } of users) {
        if (githubHandle) {
          userMap.set(githubHandle, rank);
        }
      }

      // We are now done with the relay client
      peopleClient.destroy();

      return userMap;
    } catch (error) {
      logger.error(error as Error);
      throw error;
    } finally {
      await smoldot.terminate();
    }
  }

  /** Returns all the fellows with their rankings */
  async listFellows(): Promise<[string, number][]> {
    this.logger.info("Fetching all fellows with their ranks");

    if (this.fellowsCache.size < 1) {
      this.logger.debug("Cache not found. Fetching fellows.");
      this.fellowsCache = await this.fetchAllFellows(this.logger);
    }

    return Array.from(this.fellowsCache.entries());
  }

  async getTeamMembers(ranking: string): Promise<string[]> {
    const requiredRank = Number(ranking);
    this.logger.info(`Fetching members of rank '${requiredRank}' or higher`);

    if (this.fellowsCache.size < 1) {
      this.logger.debug("Cache not found. Fetching fellows.");
      this.fellowsCache = await this.fetchAllFellows(this.logger);
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

    this.logger.info(`GitHub members of rank '${requiredRank}' or higher are: ${users.join(",")}`);

    return users;
  }
}

function readIdentityData(identityData: IdentityData): Binary | null {
  if (identityData.type === "None" || identityData.type === "Raw0") return null;
  if (identityData.type === "Raw1") return Binary.fromBytes(new Uint8Array(identityData.value));
  return identityData.value;
}
