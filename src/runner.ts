import { setOutput, summary } from "@actions/core";
import { parse } from "yaml";

import { Inputs } from ".";
import { GitHubChecksApi } from "./github/check";
import { PullRequestApi } from "./github/pullRequest";
import { ActionLogger, CheckData, TeamApi } from "./github/types";
import { AndDistinctRule, ConfigurationFile, FellowsRule, Reviewers, Rule, RuleTypes } from "./rules/types";
import { validateConfig, validateRegularExpressions } from "./rules/validator";
import { caseInsensitiveEqual, concatArraysUniquely } from "./util";

type ReviewReport = {
  /** The amount of missing reviews to fulfill the requirements */
  missingReviews: number;
  /** The users who would qualify to complete those reviews */
  missingUsers: string[];
  /** If applicable, the teams that should be requested to review */
  teamsToRequest?: string[];
  /** If applicable, the users that should be requested to review */
  usersToRequest?: string[];
  /** If applicable, the missing minimum fellows rank required to review */
  missingRank?: number;
};

export type RuleReport = { name: string } & ReviewReport;

type ReviewState = [true] | [false, ReviewReport];

type PullRequestReport = {
  /** List of files that were modified by the PR */
  files: string[];
  /** List of all the failed review requirements */
  reports: RuleReport[];
};

/** Action in charge of running the GitHub action */
export class ActionRunner {
  constructor(
    private readonly prApi: PullRequestApi,
    private readonly teamApi: TeamApi,
    private readonly polkadotApi: TeamApi,
    private readonly checks: GitHubChecksApi,
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
  async validatePullRequest({ rules }: ConfigurationFile): Promise<PullRequestReport> {
    const modifiedFiles = await this.prApi.listModifiedFiles();

    const errorReports: RuleReport[] = [];

    ruleCheck: for (const rule of rules) {
      try {
        this.logger.info(`Validating rule '${rule.name}' of type '${rule.type}'`);
        // We get all the files that were modified and match the rules condition
        const files = this.listFilesThatMatchRuleCondition(modifiedFiles, rule);
        // We check if there are any matches
        if (files.length === 0) {
          this.logger.info(`Skipping rule ${rule.name} as no condition matched`);
          // If there are no matches, we simply skip the check
          continue;
        } else if (rule.allowedToSkipRule) {
          const members = await this.fetchAllUsers(rule.allowedToSkipRule);
          const author = this.prApi.getAuthor();
          if (members.indexOf(author) > -1) {
            this.logger.info(`Skipping rule ${rule.name} as author belong to greenlight rule.`);
            continue;
          }
        }
        switch (rule.type) {
          case RuleTypes.Basic: {
            const [result, missingData] = await this.evaluateCondition(rule, rule.countAuthor);
            if (!result) {
              this.logger.error(`Missing the reviews from ${JSON.stringify(missingData.missingUsers)}`);
              errorReports.push({ ...missingData, name: rule.name });
            }

            break;
          }
          case RuleTypes.And: {
            const reports: ReviewReport[] = [];
            // We evaluate every individual condition
            for (const reviewer of rule.reviewers) {
              const [result, missingData] = await this.evaluateCondition(reviewer, rule.countAuthor);
              if (!result) {
                // If one of the conditions failed, we add it to a report
                reports.push(missingData);
              }
            }
            if (reports.length > 0) {
              const finalReport = unifyReport(reports, rule.name);
              this.logger.error(`Missing the reviews from ${JSON.stringify(finalReport.missingUsers)}`);
              errorReports.push(finalReport);
            }
            break;
          }
          case RuleTypes.Or: {
            const reports: ReviewReport[] = [];
            for (const reviewer of rule.reviewers) {
              const [result, missingData] = await this.evaluateCondition(reviewer, rule.countAuthor);
              if (result) {
                // This is a OR condition, so with ONE positive result
                // we can continue the loop to check the following rule
                continue ruleCheck;
              }
              // But, until we get a positive case we add all the failed cases
              reports.push(missingData);
            }

            // If the loop was not skipped it means that we have errors
            if (reports.length > 0) {
              // We get the lowest amount of reviews needed to fulfill one of the reviews
              const lowerAmountOfReviewsNeeded = reports
                .map((r) => r.missingReviews)
                .reduce((a, b) => (a < b ? a : b), 999);
              // We get the lowest rank required
              // We unify the reports
              const finalReport = unifyReport(reports, rule.name);
              // We set the value to the minimum neccesary
              finalReport.missingReviews = lowerAmountOfReviewsNeeded;
              this.logger.error(`Missing the reviews from ${JSON.stringify(finalReport.missingUsers)}`);
              // We unify the reports and push them for handling
              errorReports.push(finalReport);
            }
            break;
          }
          case RuleTypes.AndDistinct: {
            const [result, missingData] = await this.andDistinctEvaluation(rule);
            if (!result) {
              this.logger.error(`Missing the reviews from ${JSON.stringify(missingData.missingUsers)}`);
              errorReports.push({ ...missingData, name: rule.name });
            }
            break;
          }
          case RuleTypes.Fellows: {
            const [result, missingData] = await this.fellowsEvaluation(rule);
            if (!result) {
              this.logger.error(`Missing the reviews from ${JSON.stringify(missingData.missingUsers)}`);
              errorReports.push({ ...missingData, name: rule.name });
            }
            break;
          }
          default:
            throw new Error(`Rule type not found!`);
        }
      } catch (error: unknown) {
        // We only throw if there was an unexpected error, not if the check fails
        this.logger.error(`Rule '${rule.name}' failed with error`);
        throw error;
      }
      this.logger.info(`Finish validating '${rule.name}'`);
    }
    return { files: modifiedFiles, reports: errorReports };
  }

  /** WIP - Class that will assign the requests for review */
  async requestReviewers(reports: RuleReport[], preventReviewRequests: ConfigurationFile["preventReviewRequests"]): Promise<void> {
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

    let { teamsToRequest, usersToRequest } = finalReport;

    /**
     * Evaluates if the user belongs to the special rule of preventReviewRequests
     * and if the request for a review should be skipped
     */
    if (preventReviewRequests) {
      if (
        preventReviewRequests.teams &&
        teamsToRequest?.some((team) => preventReviewRequests.teams?.indexOf(team) !== -1)
      ) {
        this.logger.info("Filtering teams to request a review from.");
        teamsToRequest = teamsToRequest?.filter((team) => preventReviewRequests.teams?.indexOf(team) === -1);
      }
      if (
        preventReviewRequests.users &&
        usersToRequest?.some((user) => preventReviewRequests.users?.indexOf(user) !== -1)
      ) {
        this.logger.info("Filtering users to request a review from.");
        usersToRequest = usersToRequest?.filter((user) => preventReviewRequests.users?.indexOf(user) === -1);
      }
    }

    await this.prApi.requestReview({ users: usersToRequest, teams: teamsToRequest });
  }

  /** Aggregates all the reports and generate a status report
   * This also filters the author of the PR if he belongs to the group of users
   */
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
      let text = summary
        .emptyBuffer()
        .addHeading(report.name, 2)
        .addHeading(`Missing ${report.missingReviews} review${report.missingReviews > 1 ? "s" : ""}`, 4);
      if (report.usersToRequest && report.usersToRequest.length > 0) {
        text = text
          .addHeading("Missing users", 3)
          .addList(report.usersToRequest.filter((u) => !caseInsensitiveEqual(u, this.prApi.getAuthor())));
      }
      if (report.teamsToRequest && report.teamsToRequest.length > 0) {
        text = text.addHeading("Missing reviews from teams", 3).addList(report.teamsToRequest);
      }
      if (report.missingRank) {
        text = text
          .addHeading("Missing reviews from Fellows", 3)
          .addEOL()
          .addRaw(`Missing reviews from rank \`${report.missingRank}\` or above`)
          .addEOL();
      }

      check.output.text += text.stringify() + "\n";
    }

    return check;
  }

  /**
   * Evaluation of the AndDistinct rule
   * As this rule has a very difficult logic we need to prepare the scenario for the evaluation
   * It splits all the required reviews into individual cases and applies a sudoku solving algorithm
   * Until it finds a perfect match or ran out of possible matches
   */
  async andDistinctEvaluation(rule: AndDistinctRule): Promise<ReviewState> {
    const requirements: { users: string[]; requiredApprovals: number }[] = [];
    // We get all the users belonging to each 'and distinct' review condition
    for (const reviewers of rule.reviewers) {
      const users = await this.fetchAllUsers(reviewers);
      requirements.push({ users, requiredApprovals: reviewers.minApprovals });
    }

    // We count how many reviews are needed in total
    const requiredAmountOfReviews = rule.reviewers.map((r) => r.minApprovals).reduce((a, b) => a + b, 0);
    // We get the list of users that approved the PR
    const approvals = await this.prApi.listApprovedReviewsAuthors(rule.countAuthor ?? false);

    // Utility method used to generate error
    const generateErrorReport = (): ReviewReport => {
      const filterMissingUsers = (reviewData: { users?: string[] }[]): string[] =>
        Array.from(new Set(reviewData.flatMap((r) => r.users ?? []).filter((u) => approvals.indexOf(u) < 0)));

      // Calculating all the possible combinations to see the missing reviewers is very complicated
      // Instead we request everyone who hasn't reviewed yet
      return {
        missingReviews: requiredAmountOfReviews,
        missingUsers: filterMissingUsers(requirements),
        teamsToRequest: rule.reviewers.flatMap((r) => r.teams ?? []),
        usersToRequest: filterMissingUsers(rule.reviewers),
      };
    };

    // If not enough reviews (or no reviews at all)
    if (approvals.length < requiredAmountOfReviews) {
      this.logger.warn(`Not enough approvals. Need at least ${requiredAmountOfReviews} and got ${approvals.length}`);
      // We return an error and request reviewers
      return [false, generateErrorReport()];
    }

    this.logger.debug(`Required users to review: ${JSON.stringify(requirements)}`);

    const conditionApprovals: {
      matchingUsers: string[];
      requiredUsers: string[];
      requiredApprovals: number;
    }[] = [];

    // Now we see, from all the approvals, which approvals could match each rule
    for (const { users, requiredApprovals } of requirements) {
      const ruleApprovals = approvals.filter((ap) => users.indexOf(ap) !== -1);

      conditionApprovals.push({ matchingUsers: ruleApprovals, requiredUsers: users, requiredApprovals });
    }
    this.logger.debug(`Matching approvals: ${JSON.stringify(conditionApprovals)}`);

    // If one of the rules doesn't have the required approval we fail the evaluation
    if (conditionApprovals.some((cond) => cond.matchingUsers.length === 0)) {
      this.logger.warn("One of the groups does not have any approvals");
      return [false, generateErrorReport()];
    } else if (conditionApprovals.some((cond) => cond.matchingUsers.length < cond.requiredApprovals)) {
      this.logger.warn("Not enough positive reviews to match a subcondition");
      return [false, generateErrorReport()];
    }

    /**
     * We split all the reviewers that have more than one required review into its own object
     * So if a there is a [requiredApprovals: 2, users: ["abc", "def"]]
     * It is split into [requiredApprovals: 1, users: ["abc", "def"]], [requiredApprovals: 1, users: ["abc", "def"]]
     * This allows us to be more flexible when testing cases
     */
    const splittedRequirements = conditionApprovals.flatMap((reviewer) =>
      Array.from({ length: reviewer.requiredApprovals }, () => {
        return { ...reviewer, requiredApprovals: 1 };
      }),
    );

    this.logger.debug(`Splitted reviewers: ${JSON.stringify(splittedRequirements)}`);

    /**
     * Now this is the fun part. We brute force a sudoku algorithm by basically iterating over each possible match
     * We iterate over all the approvals from different possitions and we see where we can get a match
     */
    for (let i = 0; i < approvals.length; i++) {
      // We clone the array with all the requirements and the possible matches
      const workingArray = splittedRequirements.slice(0);
      // Then we iterate over the approvals from the current point of evaluation
      for (let j = i; j < approvals.length + i; j++) {
        // If we went out of range, we simply substract the length to go to the array's beginning
        const approver = j < approvals.length ? approvals[j] : approvals[j - approvals.length];
        // Now we check over every possible match using this particular approval
        for (let reviewIndex = 0; reviewIndex < workingArray.length; reviewIndex++) {
          const review = workingArray[reviewIndex];
          // If the possible matches contains the current approval we remove the match element from the array
          // and we break the loop so we try with the next approval
          if (review.matchingUsers.indexOf(approver) > -1) {
            workingArray.splice(reviewIndex, 1);
            break;
          }
        }
      }
      this.logger.debug(`Force brute iteration ${i} with result: ${JSON.stringify(workingArray)}`);

      // We check by the end of this iteration if all the approvals could be assigned
      // and we have ran out of elements in the array
      if (workingArray.length === 0) {
        return [true];
      }
    }

    this.logger.warn("Didn't find any matches to match all the rules requirements");
    // If, by the end of all the loops, there are still matches, we didn't find a solution so we fail the rule
    return [false, generateErrorReport()];
  }

  /** Evaluates if the required reviews for a condition have been meet
   * @param rule Every rule check has this values which consist on the min required approvals and the reviewers.
   * @returns a [bool, error data] tuple which evaluates if the condition (not the rule itself) has fulfilled the requirements
   * @see-also ReviewError
   */
  async evaluateCondition(
    rule: { minApprovals: number } & Reviewers,
    countAuthor: boolean = false,
  ): Promise<ReviewState> {
    this.logger.debug(JSON.stringify(rule));

    // This is a list of all the users that need to approve a PR
    const requiredUsers: string[] = await this.fetchAllUsers(rule);

    if (requiredUsers.length === 0) {
      throw new Error("No users have been found in the required reviewers");
    }

    if (requiredUsers.length < rule.minApprovals) {
      this.logger.error(
        `${rule.minApprovals} approvals are required but only ${requiredUsers.length} user's approval count.`,
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
    const approvals = await this.prApi.listApprovedReviewsAuthors(countAuthor ?? false);
    this.logger.info(`Found ${approvals.length} approvals.`);

    // This is the amount of reviews required. To succeed this should be 0 or lower
    let missingReviews = rule.minApprovals;
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

  async fellowsEvaluation(rule: FellowsRule): Promise<ReviewState> {
    // This is a list of all the users that need to approve a PR
    const requiredUsers: string[] = await this.polkadotApi.getTeamMembers(rule.minRank.toString());

    if (requiredUsers.length === 0) {
      throw new Error(`No users have been found with the rank ${rule.minRank} or above`);
    }

    if (requiredUsers.length < rule.minApprovals) {
      this.logger.error(
        `${rule.minApprovals} approvals are required but only ${requiredUsers.length} user's approval count.`,
      );
      throw new Error("The amount of required approvals is smaller than the amount of available users.");
    }

    // We get the list of users that approved the PR
    const approvals = await this.prApi.listApprovedReviewsAuthors(rule.countAuthor ?? false);
    this.logger.info(`Found ${approvals.length} approvals.`);

    // This is the amount of reviews required. To succeed this should be 0 or lower
    let missingReviews = rule.minApprovals;
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
          missingRank: rule.minRank,
        },
      ];
    } else {
      this.logger.info("Rule requirements fulfilled");
      // If we don't have any missing reviews, we return the succesful case
      return [true];
    }
  }

  /** Using the include and exclude condition, it returns a list of all the files in a PR that matches the criteria */
  listFilesThatMatchRuleCondition(files: string[], { condition }: Rule): string[] {
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

  /**
   * Fetch all the members of a team and/or list and removes duplicates
   * @param reviewers Object with users or teams to fetch members
   * @returns an array with all the users
   */
  async fetchAllUsers(reviewers: Omit<Reviewers, "minApprovals">): Promise<string[]> {
    const users: Set<string> = new Set<string>();
    if (reviewers.teams) {
      for (const team of reviewers.teams) {
        const members = await this.teamApi.getTeamMembers(team);
        for (const member of members) {
          users.add(member);
        }
      }
    }
    if (reviewers.users) {
      for (const user of reviewers.users) {
        users.add(user);
      }
    }

    return Array.from(users);
  }

  /** Core runner of the app.
   * 1. It fetches the config
   * 2. It validates all the pull request requirements based on the config file
   * 3. It generates a status check in the Pull Request
   * 4. WIP - It assigns the required reviewers to review the PR
   */
  async runAction(inputs: Pick<Inputs, "configLocation" | "requestReviewers">): Promise<Pick<CheckData, "conclusion"> & PullRequestReport> {
    const config = await this.getConfigFile(inputs.configLocation);

    const prValidation = await this.validatePullRequest(config);
    const { reports } = prValidation;

    this.logger.info(reports.length > 0 ? "There was an error with the PR reviews." : "The PR has been successful");

    const checkRunData = this.generateCheckRunData(reports);
    await this.checks.generateCheckRun(checkRunData);

    if (inputs.requestReviewers) {
      await this.requestReviewers(reports, config.preventReviewRequests);
    } else {
      this.logger.info("'request-reviewers' is disabled. Skipping the request.");
    }

    setOutput("report", JSON.stringify(prValidation));

    return { conclusion: checkRunData.conclusion, ...prValidation };
  }
}

const getRequiredRanks = (reports: Pick<ReviewReport, "missingRank">[]): number[] | undefined => {
  const ranks = reports.map((r) => r.missingRank).filter((rank) => rank !== undefined && rank !== null) as number[];
  if (ranks.length > 0) {
    return ranks;
  } else {
    return undefined;
  }
};

const unifyReport = (reports: ReviewReport[], name: string): RuleReport => {
  const ranks = getRequiredRanks(reports);
  const missingRank = ranks ? Math.max(...(ranks as number[])) : undefined;

  return {
    missingReviews: reports.reduce((a, b) => a + b.missingReviews, 0),
    missingUsers: [...new Set(reports.flatMap((r) => r.missingUsers))],
    teamsToRequest: [...new Set(reports.flatMap((r) => r.teamsToRequest ?? []))],
    usersToRequest: [...new Set(reports.flatMap((r) => r.usersToRequest ?? []))],
    name,
    missingRank,
  };
};
