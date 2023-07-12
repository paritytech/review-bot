import { parse } from "yaml";

import { Inputs } from ".";
import { ConfigurationFile } from "./fileHandler";
import { PullRequestApi } from "./github/pullRequest";
import { ActionLogger } from "./github/types";

/** action in charge of running the GitHub action */
export class ActionRunner {
  constructor(private readonly prApi: PullRequestApi, private readonly logger: ActionLogger) {}

  async getConfigFile(configLocation: string): Promise<ConfigurationFile> {
    const content = await this.prApi.getConfigFile(configLocation);
    const config = parse(content) as ConfigurationFile;

    // TODO: validate the config file
    this.logger.info(`Obtained config at ${configLocation}`);

    return config;
  }

  async runAction(inputs: Omit<Inputs, "repoToken">): Promise<boolean> {
    const config = await this.getConfigFile(inputs.configLocation);

    return config !== null;
  }
}
