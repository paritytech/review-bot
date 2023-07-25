import { parse } from "yaml";

import { Inputs } from ".";
import { ConfigurationFile, Reviewers, Rule } from "./file/types";
import { validateConfig, validateRegularExpressions } from "./file/validator";
import { PullRequestApi } from "./github/pullRequest";
import { TeamApi } from "./github/teams";
import { ActionLogger } from "./github/types";

type ReviewReport = {
  /** The amount of missing reviews to fulfill the requirements */
  missingReviews: number;
  /** The users who would qualify to complete those reviews */
  missingUsers: string[];
  /** If applicable, the teams that should be requested to review */
  teamsToRequest?: string[];
  /** If applicable, the users that should be requested to review */
  usersToRequest?: string[];
};
type ReviewState = [true] | [false, ReviewReport];

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

  /**
   * The action evaluates if the rules requirements are meet for a PR
   * @returns a true/false statement if the rule failed. This WILL BE CHANGED for an object with information (see issue #26)
   */
  async validatePullRequest({ rules }: ConfigurationFile): Promise<boolean> {
    for (const rule of rules) {
      try {
        // We get all the files that were modified and match the rules condition
        const files = await this.listFilesThatMatchRuleCondition(rule);
        // We check if there are any matches
        if (files.length === 0) {
          this.logger.debug(`Skipping rule ${rule.name} as no condition matched`);
          // If there are no matches, we simply skip the check
          continue;
        }
        if (rule.type === "basic") {
          const [result, missingData] = await this.evaluateCondition(rule);
          if (!result) {
            this.logger.error(`Missing the reviews from ${JSON.stringify(missingData.missingUsers)}`);
            return false;
          }
        }
      } catch (error: unknown) {
        // We only throw if there was an unexpected error, not if the check fails
        this.logger.error(`Rule ${rule.name} failed with error`);
        throw error;
      }
    }

    // TODO: Convert this into a list of users/teams missing and convert the output into a nice summary object -> Issue #26
    return true;
  }

  /** Evaluates if the required reviews for a condition have been meet
   * @param rule Every rule check has this values which consist on the min required approvals and the reviewers.
   * @returns a [bool, error data] tuple which evaluates if the condition (not the rule itself) has fulfilled the requirements
   * @see-also ReviewError
   */
  async evaluateCondition(rule: { min_approvals: number } & Reviewers): Promise<ReviewState> {
    // This is a list of all the users that need to approve a PR
    const requiredUsers: string[] = [];
    // If team is set, we fetch the members of such team
    if (rule.teams) {
      for (const team of rule.teams) {
        const members = await this.teamApi.getTeamMembers(team);
        for (const member of members) {
          // simple check to stop us from having duplicates
          if (requiredUsers.indexOf(member) < 0) {
            requiredUsers.push(member);
          }
        }
      }
      // If, instead, users are set, we simply push them to the array as we don't need to scan a team
    } else if (rule.users) {
      requiredUsers.push(...rule.users);
    } else {
      // This should be captured before by the validation
      throw new Error("Teams and Users field are not set for rule.");
    }

    if (requiredUsers.length < rule.min_approvals) {
      this.logger.error(
        `${rule.min_approvals} approvals are required but only ${requiredUsers.length} user's approval count.`,
      );
      if (rule.teams) {
        this.logger.error(`Allowed teams: ${JSON.stringify(rule.teams)}`);
      }
      if (rule.users) {
        this.logger.error(`Allowed users: ${JSON.stringify(rule.users)}`);
      }
      throw new Error("The amount of required approvals is smaller than the amount of available users.");
    }

    // We get the list of users that approved the PR
    const approvals = await this.prApi.listApprovedReviewsAuthors();

    // This is the amount of reviews required. To succeed this should be 0 or lower
    let missingReviews = rule.min_approvals;
    for (const requiredUser of requiredUsers) {
      // We check for the approvals, if it is a required reviewer we lower the amount of missing reviews
      if (approvals.indexOf(requiredUser) > -1) {
        missingReviews--;
      }
    }

    // Now we verify if we have any remaining missing review.
    if (missingReviews > 0) {
      // If we have at least one missing review, we return an object with the list of missing reviewers, and
      // which users/teams we should request to review
      return [
        false,
        {
          missingReviews,
          missingUsers: requiredUsers.filter((u) => approvals.indexOf(u) < 0),
          teamsToRequest: rule.teams ? rule.teams : undefined,
          usersToRequest: rule.users ? rule.users.filter((u) => approvals.indexOf(u)) : undefined,
        },
      ];
    } else {
      // If we don't have any missing reviews, we return the succesful case
      return [true];
    }
  }

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
        // We remove every case were it matches the exclude regex
        matches = matches.filter((match) => !match.match(regex));
      }
    }

    return matches;
  }

  async runAction(inputs: Omit<Inputs, "repoToken">): Promise<boolean> {
    const config = await this.getConfigFile(inputs.configLocation);

    const success = await this.validatePullRequest(config);

    this.logger.info(success ? "The PR has been successful" : "There was an error with the PR reviews.");

    return success;
  }
}
