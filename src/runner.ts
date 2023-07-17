import { validate } from "@eng-automation/js";
import { parse } from "yaml";

import { Inputs } from ".";
import { ConfigurationFile } from "./file/types";
import { schema, validateRegularExpressions } from "./file/validator";
import { PullRequestApi } from "./github/pullRequest";
import { ActionLogger } from "./github/types";

/** Action in charge of running the GitHub action */
export class ActionRunner {
  constructor(private readonly prApi: PullRequestApi, private readonly logger: ActionLogger) {}

  /**
   * Fetches the configuration file, parses it and validates it.
   * If the config is invalid or not found, an error will be thrown.
   */
  async getConfigFile(configLocation: string): Promise<ConfigurationFile> {
    const content = await this.prApi.getConfigFile(configLocation);
    this.logger.debug(content);
    const config: unknown = parse(content);

    this.logger.info(`Obtained config at ${configLocation}`);

    const configFile = validate<ConfigurationFile>(config, schema, { message: "Configuration file is invalid" });

    const [result, error] = validateRegularExpressions(configFile, this.logger);
    if (!result) {
      this.logger.error(error);
      throw new Error("Regular expression is invalid. Check the logs");
    }

    return configFile;
  }

  async runAction(inputs: Omit<Inputs, "repoToken">): Promise<boolean> {
    const config = await this.getConfigFile(inputs.configLocation);

    return config !== null;
  }
}
