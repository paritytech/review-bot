# review-bot

[![GitHub Issue Sync](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml/badge.svg)](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml)

[![Publish package to GitHub Packages](https://github.com/paritytech/review-bot/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/paritytech/review-bot/actions/workflows/publish.yml)

Have custom review rules for Pull Requests, assigning a given amount of code owners and required requests to different areas of the code.

## Why?

This action is intended for the case where a repository needs to have a more custom review criteria. This is not a replacement for [`CODEOWNERS`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), but an enhancement of it.

It allows sensitive files to be reviewed by a fixed number of users.

### Example scenario
#### Requiring reviews from teams
You declare that the file `example.rs` belongs to `team-rs` in the  `CODEOWNERS` file, and you require 3 approvals to merge a Pull Request.

If 1 user belonging to `team-rs` approves the PR, and two different users also approve the PR, this will satisfy the requirements for GitHub.

With `Review-Bot` you can request that **3 users from the `team-rs` must review that file**. 
#### Users that belong to multiple teams
There is a file protected in `CODEOWNERS` and requires reviews from both `team-abc` and `team-xyz`.

If one user belongs to both teams, their review will satisfy both requirements.

With the `and-distinct` rule, you can request that *two distinct users must review that file*.

## Installation
The installation requires three files for it to work, we first need to create a file (`.github/review-bot.yml` by default).
```yaml
rules:
  - name: General
    condition:
      include:
        - '.*'
    type: basic
    teams:
      - your-team-name-here
```

The second file is the triggering file. This will be `.github/workflows/review-trigger.yml`:
```yaml
name: Review-Trigger

on: 
  pull_request_target:
    types:
      - opened
      - reopened
      - synchronize
      - review_requested
      - review_request_removed
      - ready_for_review
  pull_request_review:

jobs:
  trigger-review-bot:
    runs-on: ubuntu-latest
    name: trigger review bot
    steps:
      - name: Get PR number
        env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          echo "Saving PR number: $PR_NUMBER"
          mkdir -p ./pr
          echo $PR_NUMBER > ./pr/pr_number
      - uses: actions/upload-artifact@v3
        name: Save PR number
        with:
          name: pr_number
          path: pr/
          retention-days: 5
```

And then we must create a final file. This will be `.github/workflows/review-bot.yml`.
```yaml
name: Review Bot
on:
  workflow_run:
    workflows:
      - Review-Trigger
    types:
      - completed

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  review-approvals:
    runs-on: ubuntu-latest
    steps:
      - name: Extract content of artifact
        id: number
        uses: Bullrich/extract-text-from-artifact@main
        with:
          artifact-name: pr_number
      - name: "Evaluates PR reviews"
        uses: paritytech/review-bot@main
        with:
          repo-token: ${{ github.token }}
          team-token: ${{ secrets.TEAM_TOKEN }}
          checks-token: ${{ secrets.CHECKS_TOKEN }}
          request-reviewers: false
          pr-number: ${{ steps.number.outputs.content }}
```
Create a new PR and see if it is working.

You should see a new action running called `Review PR/review-approvals`. 

Wait for it to finish.

After this, go to your branch protection rules and make sure that you have the following setup enabled:
- [x] Require status checks to pass before merging
- Status checks that are required.
	- `review-bot`

**If `review-bot` does not appear, make a new PR and wait for `review-approvals` action to finish**. This will create the status and now it should be available in your list.
### Important
Use [`pull_request_target`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target) for the event, not `pull_request`.
- This is a security measure so that an attacker doesn’t have access to our secrets.

We use [`worflow_run`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run) to let the action be triggered at all times (If we don’t use this, GitHub will stop it if it comes from a fork).

By chaining events we are able to safely execute our action without jeopardizing our secrets. You can even use [`environment`](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) in the final file if you want to have it extra secure.
## Workflow Configuration
Review bot has multiple configurations available. It has available inputs and outputs. It also has rule configurations, but you can find that in the [Rule Configuration](#rule-configuration-file) section.

### Inputs
You can find all the inputs in [the action file](./action.yml), but let's walk through each one of them:

- `repo-token`: Token to access to the repository.
	-  **required**
	-  This is provided by the repo, you can simply use `${{ github.token }}`.
	- It is already in the installation section, but you need to give the following [permissions](https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs#defining-access-for-the-github_token-scopes) to the action:
		- `contents`: read
		- `checks`: write
- `team-token`: Token to read the team members.
	- **required**.
	- This needs to be a [GitHub Personal Access](https://github.com/settings/tokens/new) token with `read:org` permission.
	- It is used to extract the members of teams.
- `checks-token`: Token to write the status checks.
	- **required**.
	- This needs to be a [GitHub Personal Access](https://github.com/settings/tokens/new) token with `checks:write` permission.
	- It is used to write the status checks of successful/failed runs.
	- Can be `${{ github.token }}` but there is a [known bug](https://github.com/paritytech/review-bot/issues/54).
		- If you use a GitHub app, this bug will be fixed.
			- You can use the same GitHub app for `checks-token` and `team-token`.
- `config-file`: The location of the config file.
	- **default**: `.github/review-bot.yml`
- `request-reviewers`: If the system should automatically request the required reviewers.
	- **default**: false.
	- If enabled, when there are missing reviews, the system will request the appropriate users and/or team to review.
	- If enabled, and using teams, this requires a GitHub action with `write` permission for `pull request`.

#### Using a GitHub app instead of a PAT
In some cases, specially in big organizations, it is more organized to use a GitHub app to authenticate, as it allows us to give it permissions per repository, and we can fine-grain them even better. If you wish to do that, you need to create a GitHub app with the following permissions:
- Organization permissions:
	- Members
		- [x] Read
- Repository permissions:
	- Checks
		- [x] Write

Because this project is intended to be used with a token, we need to do an extra step to generate one from the GitHub app:
- After you create the app, copy the *App ID* and the *private key* and set them as secrets.
- Then you need to modify the workflow file to have an extra step:
```yml
    steps:
      - name: Generate token
        id: generate_token
        uses: tibdex/github-app-token@v1
        with:
          app_id: ${{ secrets.APP_ID }}
          private_key: ${{ secrets.PRIVATE_KEY }}
      - name: "Evaluates PR reviews"
        uses: paritytech/review-bot@main
        with:
          repo-token: ${{ github.token }}
          # The previous step generates a token which is used as the input for this action
          team-token: ${{ steps.generate_token.outputs.token }
          checks-token: ${{ steps.generate_token.outputs.token }}
          pr-number: ${{ steps.number.outputs.content }}
```

### Outputs
Outputs are needed for your chained actions. If you want to use this information, remember to set an `id` field in the step, so you can access it.

You can find all the outputs in [the action file](./action.yml), but let's walk through each one of them:
- `repo`: Organization and repo name. Written in the format of `owner/repo`.
- `report`: This is a `json` object with the report of the evaluation.
```ts
interface Report {
  // State of the evaluation.
  conclusion: "action_required" | "failure" | "success";
  // list of files that are being modified by the PR
  files: string[];
  // Array of rules that has not been fulfilled.
  // If this is empty it means that it has enough approvals
  report: {
    /** The name of the rule */
    name: string;
    /** The amount of missing reviews to fulfill the requirements */
    missingReviews: number;
    /** The users who would qualify to complete those reviews */
    missingUsers: string[];
    /** If applicable, the teams that should be requested to review */
    teamsToRequest?: string[];
    /** If applicable, the users that should be requested to review */
    usersToRequest?: string[];
  }[];
}
```
## Rule configuration file
This is the file where all the available rules are written. 

**This file is only read from the main branch.** So if you modify the file, the changes won’t happen until it is merged into the main branch. 
This is done to stop users from modifying the rules in their PRs.

It contains an object called `rules` which has an array of rules. Every rule has a same base structure. There is also a second optional field called `preventReviewRequests`.
```yaml
rules:
  - name: Rule name
    condition:
      include:
        - '.*'
      exclude:
        - 'README.md'
    type: the type of the rule

preventReviewRequests:
  users:
    - user-a
    - user-b
  teams:
    - team-a
    - team-b
```

#### Rules fields
- **name**: Name of the rule. This value must be unique per rule.
- **condition**: This is an object that contains two values:
	- **include**: An array of regex expressions of the files that match this rule.
		- If any of the files modified in a Pull Request matches this regex, the rule will be evaluated.
		- If no file matches the regex, then this rule won’t be evaluated.
	- **exclude**: An array of regular expressions pointing to the files that this rule should ignore when deciding if it should evaluate the Pull Request.
		- **optional**
		- Useful if, for example, a whole directory is inside a rule, but you want to ignore a particular file as it doesn’t need specific reviewers.
	- **type**: This is the type of the rule. 
		- The available types are:
			- **basic**: Just requires a given number of reviews.
			- **or**: Has many review options, requires at least *one option* to be fulfilled.
			- **and**: Has many review options, requires *all the options* to be fulfilled.
			-  **and-distinct**: Has many review options, requires *all the options* to be fulfilled *by different people*.

#### preventReviewRequests
This is a special field that applies to all the rules.

This field is **optional** and currently not used. Pending on https://github.com/paritytech/review-bot/issues/53


### Types
Every type has a *slightly* different configuration and works for different scenarios, so let’s analyze all of them.

#### Basic rule
As the name implies, this type is elementary. All the files that fall under the rule evaluation must receive a given number of approvals by the listed users and/or team members.

A minimal full configuration file is:
```yaml
rules:
  - name: General
    condition:
      include:
        - '.*'
      exclude:
        - '.github/'
    type: basic
    minApprovals: 2
    teams:
      - team-1
      - team-2
    users:
      - user-1
      - user-2
    countAuthor: true
    allowedToSkipRule:
      teams:
        - team-1
      users:
        - user-1
```
It has the same parameters as a normal rule:
-  **name**: Name of the rule. This value must be unique per rule.
- **condition**: This is an object that contains two values:
	- **include**: An array of regex expressions of the files that match this rule.
	- **exclude**: An array of regular expressions pointing to the files that this rule should ignore when deciding if it should evaluate the Pull Request.
		- **optional**
- **type**: This must be the string `basic`.
- **minApprovals**: The number of approvals that are need to fulfill this condition.
	- It can not be lower than 1.
	- **Optional**: Defaults to 1.
	- Must be greater than the number of users available (you cannot request 5 approvals from a team of 4 users)
- **teams**: An array of team *slugs* that need to review this file.
	- *Optional if **users** is defined*.
- **users**: An array of the GitHub usernames of the users who need to review this file. 
	- *Optional if **teams** is defined*.
- **countAuthor**: If the pull request author should be considered as an approval.
	- If the author belongs to the list of approved users (either by team or by users) his approval will be counted (requiring one less approvals in total).
	- ** Optional**: Defaults to `false`
- **allowedToSkipRule**: If the author belong to one of the teams and/or users in the list, the rule should be skipped.
	- **Optional**.
	- This is useful for cases where we want to make sure that some eyes look into a PR, but for we don’t need to ensure that much security on internal teams.
		- For example, if someone modifies a CI file, we want to make sure they didn’t break anything. Unless it’s someone from the CI team. They *should know* what they are doing.
#### Other rules
The other three rules (**or**, **and** and **and-distinct**) have the same configuration, so let’s summarize that here and then move into how they work.
```yaml
rules:
  - name: Other rule
    condition:
      include: 
        - '.*'
      exclude: 
        - 'example'
    countAuthor: true
    type: or | and | and-distinct
    reviewers:
      - teams:
        - team-example
        users:
        - user-1
        - user-2
      - teams:
        - team-abc
        minApprovals: 2
```
- The **name** and **conditions** fields have the same requirements that the `basic` rule has.
- **type**: Must be `or`, `and` or `and-distinct`.
- **countAuthor**: If the pull request author should be considered as an approval.
	- If the author belongs to the list of approved users (either by team or by users) his approval will be counted (requiring one less approvals in total).
	- ** Optional**: Defaults to `false`
- **reviewers**: This is an array that contains all the available options for review.
	- Each of these options works independently.
	- Must have at least two options.
		- If you only need 1 option, then use the `basic` rule.
	- Each of the options have the following fields:
		- **minApprovals**: The number of approvals that are need to fulfill this condition.
			- It can not be lower than 1.
			- **Optional**: Defaults to 1.
			- Must be greater than the number of users available (you cannot request 5 approvals from a team of 4 users)
		- **teams**: An array of team *slugs* that need to review this file.
			- *Optional if **users** is defined*.
		- **users**: An array of the GitHub usernames of the users who need to review this file. 
			- *Optional if **teams** is defined*.
##### Or rule logic
This is a rule that has at least two available options of reviewers and needs **at least one group to approve**.

If we look at the `reviewers` field in the example above:
```yaml
reviewers:
  - teams:
    - team-example
    users:
    - user-1
    - user-2
  - teams:
    - team-abc
    minApprovals: 2
```
This rule will be approved with *any of the following* conditions:
- If a user who belongs to `team-example` or is `user-1` or `user-2` approves the PR.
- If *two users* who belong to `team-abc` approve the PR.

As you can see, this only requires **one of the conditions to be fulfilled** to approve the rule. You could approve the rule with only one user’s review instead of two. That’s why it is called the `or` rule.
##### And rule logic
This is a rule that has at least two available options of reviewers and requires **all the options to approve the PR**.

If we look at the `reviewers` field in the example above:
```yaml
reviewers:
  - teams:
    - team-example
    users:
    - user-1
    - user-2
  - teams:
    - team-abc
    minApprovals: 2
```
This rule will be approved if *all the following conditions get fulfilled*:
- *One* user who belongs to `team-example` or is `user-1` or `user-2` approves the PR.
- *Two users* who belong to `team-abc` approve the PR.

If only one of these conditions gets fulfilled, the check won’t pass, as **it requires all the groups**. You would need *3 approvals to fulfill all the conditions*.

Although, there is a *caveat* with this rule.

In this example, if a user belongs to both `team-abc` and to `team-example` his approval will count towards both rules, so you could use only two approvals instead of three. To solve that, we created the `and-distinct` rule.
##### And distinct logic
The logic in this rule is the *same as the `and` rule **but** with one exception.* Like the `and` rule, it needs all of its requirements to be fulfilled, **but they all must be fulfilled by different users.**

Meaning that if a user belongs to both `team-abc` and `team-example` their approval will count only towards one of the available options *even if they fulfill both needs*.

This rule is useful when you need to make sure that at leasts two sets of eyes of two different teams review a Pull Request.
#### Fellows rule
The fellows rule has a slight difference to all of the rules:
```yaml
- name: Fellows review
  condition:
    include:
      - '.*'
    exclude:
      - 'example'
  type: fellows
  minRank: 2
  minApprovals: 2
```
The biggest difference is that it doesn’t have a reviewers type (it doesn’t have a `teams` or `users` field); instead, it has a `minRank` field.

This field receives a number, which will be the lowest rank required to evaluate the PR, and then it fetches [all the fellows from the chain data](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fkusama.api.onfinality.io%2Fpublic-ws#/fellowship), filters only the one to belong to that rank or above and then [looks into their metadata for a field name `github` and the handle there](https://github.com/polkadot-fellows/runtimes/issues/7).

After this is done, the resulting handles will be treated like a normal list of required users.

It also has any other field from the [`basic rule`](#basic-rule) (with the exception of `users` and `teams`):
- **name** 
- **conditions**:
	- **include** is **required**.
	- **exclude** is **optional**.
- **type**: Must be `fellows`.
 - **countAuthor**: If the pull request author should be considered as an approval.
	- **Optional**: Defaults to `false`.
- **minRank**: Must be a number.
	- **Required**
### Evaluating config

If you want to evaluate the config file to find problems before merging it, we have a simple `cli` to do so.

```bash
yarn run cli ".github/review-bot.yml" # set the parameter as the location of the config
```
It will inform you if you have any types of errors.
## Developing
We use `yarn` package manager and `node 18`.
- Use `yarn install` to install the dependencies.
- Use `yarn build` to build the project.
- Use `yarn test` to run tests on all the `*.test.ts` files.
- Use `yarn lint` to run the linter.
- Use `yarn fix` to fix all the auto fixable issues reported by the linter.

## Deployment
To deploy a new version you need to update two files:
- [`package.json`](./package.json): Update the version number.
- [`action.yml`](./action.yml): Update the image number in `runs.image`.
**Important**: Both versions must have the same number.

When a commit is pushed to the main branch and the versions have changed, the system will automatically tag the commit and release a new package with such version.

You can find all the available versions in the [release section](../releases).
