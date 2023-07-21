import { parse } from "yaml";

import { Inputs } from ".";
import { BasicRule, ConfigurationFile, Rule } from "./file/types";
import { validateConfig, validateRegularExpressions } from "./file/validator";
import { PullRequestApi } from "./github/pullRequest";
import { TeamApi } from "./github/teams";
import { ActionLogger } from "./github/types";

type ReviewError = [true] | [false, { missingUsers: string[]; teamsToRequest?: string[]; usersToRequest?: string[] }];

/** Action in charge of running the GitHub action */
export class ActionRunner {
  constructor(
    private readonly prApi: PullRequestApi,
    private readonly teamApi: TeamApi,
    private readonly logger: ActionLogger,
  ) {}

  /**
   * Fetches the configuration file, parses it and validates it.
   * If the config is invalid or not found, an error will be thrown.
   */
  async getConfigFile(configLocation: string): Promise<ConfigurationFile> {
    const content = await this.prApi.getConfigFile(configLocation);
    this.logger.debug(content);
    const config = parse(content) as ConfigurationFile;

    this.logger.info(`Obtained config at ${configLocation}`);

    const configFile = validateConfig(config);

    const [result, error] = validateRegularExpressions(configFile, this.logger);
    if (!result) {
      throw new Error(`Regular expression is invalid: ${error}`);
    }

    return configFile;
  }

  async validatePullRequest({ rules, preventReviewRequests }: ConfigurationFile) {
    for (const rule of rules) {
      if (rule.type === "basic") {
      }
    }
  }

  async evaluateBasicRule(rule: BasicRule): Promise<ReviewError> {
    const files = await this.listFilesThatMatchRuleCondition(rule);
    if (files.length === 0) {
      return [true];
    }

    const approvals = await this.prApi.listApprovedReviewsAuthors();

    const requiredUsers: string[] = [];
    if (rule.teams) {
      for (const team of rule.teams) {
        const members = await this.teamApi.getTeamMembers(team);
        for (const member of members) {
          if (requiredUsers.indexOf(member) < 0) {
            requiredUsers.push(member);
          }
        }
      }
    } else if (rule.users) {
      requiredUsers.push(...rule.users);
    }

    let missingReviews = rule.min_approvals;
    for (const requiredUser of requiredUsers) {
      if (approvals.indexOf(requiredUser) > -1) {
        missingReviews--;
      }
    }

    if (missingReviews > 0) {
      return [
        false,
        {
          missingUsers: requiredUsers.filter((u) => approvals.indexOf(u) < 0),
          teamsToRequest: rule.teams ? rule.teams : undefined,
          usersToRequest: rule.users ? rule.users.filter((u) => approvals.indexOf(u)) : undefined,
        },
      ];
    } else {
      return [true];
    }
  }

  async evaluateCondition(rule: Rule) {}

  /** Using the include and exclude condition, it returns a list of all the files in a PR that matches the criteria */
  async listFilesThatMatchRuleCondition({ condition }: Rule): Promise<string[]> {
    const files = await this.prApi.listModifiedFiles();
    let matches: string[] = [];
    for (const regex of condition.include) {
      for (const fileName of files) {
        // If the file name matches the regex, and it has not been added to the list, we add it
        if (fileName.match(regex) && matches.indexOf(fileName) < 0) {
          matches.push(fileName);
        }
      }
    }

    if (condition.exclude && matches.length > 0) {
      for (const regex of condition.exclude) {
        matches = matches.filter((match) => !match.match(regex));
      }
    }

    return matches;
  }

  async runAction(inputs: Omit<Inputs, "repoToken">): Promise<boolean> {
    const config = await this.getConfigFile(inputs.configLocation);

    return config !== null;
  }
}
