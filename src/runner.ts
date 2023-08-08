import { summary } from "@actions/core";
import { parse } from "yaml";

import { Inputs } from ".";
import { ConfigurationFile, Reviewers, Rule } from "./file/types";
import { validateConfig, validateRegularExpressions } from "./file/validator";
import { PullRequestApi } from "./github/pullRequest";
import { TeamApi } from "./github/teams";
import { ActionLogger, CheckData } from "./github/types";
import { concatArraysUniquely } from "./util";

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

type RuleReport = { name: string } & ReviewReport;

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
   * @returns an array of error reports for each failed rule. An empty array means no errors
   */
  async validatePullRequest({ rules }: ConfigurationFile): Promise<RuleReport[]> {
    const errorReports: RuleReport[] = [];
    for (const rule of rules) {
      try {
        this.logger.info(`Validating rule '${rule.name}'`);
        // We get all the files that were modified and match the rules condition
        const files = await this.listFilesThatMatchRuleCondition(rule);
        // We check if there are any matches
        if (files.length === 0) {
          this.logger.info(`Skipping rule ${rule.name} as no condition matched`);
          // If there are no matches, we simply skip the check
          continue;
        }
        if (rule.type === "basic") {
          const [result, missingData] = await this.evaluateCondition(rule);
          if (!result) {
            this.logger.error(`Missing the reviews from ${JSON.stringify(missingData.missingUsers)}`);
            errorReports.push({ ...missingData, name: rule.name });
          }
        }
      } catch (error: unknown) {
        // We only throw if there was an unexpected error, not if the check fails
        this.logger.error(`Rule '${rule.name}' failed with error`);
        throw error;
      }
      this.logger.info(`Finish validating '${rule.name}'`);
    }
    return errorReports;
  }

  /** WIP - Class that will assign the requests for review */
  requestReviewers(reports: RuleReport[]): void {
    if (reports.length === 0) {
      return;
    }
    const finalReport: ReviewReport = { missingReviews: 0, missingUsers: [], teamsToRequest: [], usersToRequest: [] };

    for (const report of reports) {
      finalReport.missingReviews += report.missingReviews;
      finalReport.missingUsers = concatArraysUniquely(finalReport.missingUsers, report.missingUsers);
      finalReport.teamsToRequest = concatArraysUniquely(finalReport.teamsToRequest, report.teamsToRequest);
      finalReport.usersToRequest = concatArraysUniquely(finalReport.usersToRequest, report.usersToRequest);
    }

    const { teamsToRequest, usersToRequest } = finalReport;
    const validArray = (array: string[] | undefined): boolean => !!array && array.length > 0;
    const reviewersLog = [
      validArray(teamsToRequest) ? `Teams: ${JSON.stringify(teamsToRequest)}` : "",
      validArray(usersToRequest) ? `Users: ${JSON.stringify(usersToRequest)}` : "",
    ].join(" - ");

    this.logger.info(`Need to request reviews from ${reviewersLog}`);
  }

  /** Aggregates all the reports and generate a status report */
  generateCheckRunData(reports: RuleReport[]): CheckData {
    // Count how many reviews are missing
    const missingReviews = reports.reduce((a, b) => a + b.missingReviews, 0);
    const failed = missingReviews > 0;
    const check: CheckData = {
      conclusion: failed ? "failure" : "success",
      output: {
        title: failed ? `Missing ${missingReviews} reviews` : "All required reviews fulfilled",
        summary: failed ? "# The following rules have failed:\n" : "All neccesary users have reviewed the PR",
        text: failed ? "Details per rule:\n" : "",
      },
    };

    if (!failed) {
      return check;
    }

    for (const report of reports) {
      check.output.summary += `- **${report.name}**\n`;
      let text = summary.addHeading(report.name, 2).addHeading(`Missing ${report.missingReviews} reviews`, 4);
      if (report.usersToRequest && report.usersToRequest.length > 0) {
        text = text.addHeading("Missing users", 3).addList(report.usersToRequest);
      }
      if (report.teamsToRequest && report.teamsToRequest.length > 0) {
        text = text.addHeading("Missing reviews from teams", 3).addList(report.teamsToRequest);
      }

      check.output.text += text.stringify() + "\n";
    }

    return check;
  }

  /** Evaluates if the required reviews for a condition have been meet
   * @param rule Every rule check has this values which consist on the min required approvals and the reviewers.
   * @returns a [bool, error data] tuple which evaluates if the condition (not the rule itself) has fulfilled the requirements
   * @see-also ReviewError
   */
  async evaluateCondition(rule: { min_approvals: number } & Reviewers): Promise<ReviewState> {
    this.logger.debug(JSON.stringify(rule));

    // This is a list of all the users that need to approve a PR
    let requiredUsers: string[] = [];
    // If team is set, we fetch the members of such team
    if (rule.teams) {
      for (const team of rule.teams) {
        const members = await this.teamApi.getTeamMembers(team);
        requiredUsers = concatArraysUniquely(requiredUsers, members);
      }
      // If, instead, users are set, we simply push them to the array as we don't need to scan a team
    }
    if (rule.users) {
      requiredUsers = concatArraysUniquely(requiredUsers, rule.users);
    }
    if (requiredUsers.length === 0) {
      throw new Error("No users have been found in the required reviewers");
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
    this.logger.info(`Found ${approvals.length} approvals.`);

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
      const author = this.prApi.getAuthor();
      this.logger.warn(`${missingReviews} reviews are missing.`);
      // If we have at least one missing review, we return an object with the list of missing reviewers, and
      // which users/teams we should request to review
      return [
        false,
        {
          missingReviews,
          // Remove all the users who approved the PR + the author (if he belongs to the group)
          missingUsers: requiredUsers.filter((u) => approvals.indexOf(u) < 0).filter((u) => u !== author),
          teamsToRequest: rule.teams ? rule.teams : undefined,
          usersToRequest: rule.users ? rule.users.filter((u) => approvals.indexOf(u)) : undefined,
        },
      ];
    } else {
      this.logger.info("Rule requirements fulfilled");
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

  /** Core runner of the app.
   * 1. It fetches the config
   * 2. It validates all the pull request requirements based on the config file
   * 3. It generates a status check in the Pull Request
   * 4. WIP - It assigns the required reviewers to review the PR
   */
  async runAction(inputs: Omit<Inputs, "repoToken">): Promise<CheckData> {
    const config = await this.getConfigFile(inputs.configLocation);

    const reports = await this.validatePullRequest(config);

    this.logger.info(reports.length > 0 ? "There was an error with the PR reviews." : "The PR has been successful");

    const checkRunData = this.generateCheckRunData(reports);
    await this.prApi.generateCheckRun(checkRunData);

    this.requestReviewers(reports);

    return checkRunData;
  }
}
