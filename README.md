# review-bot

[![GitHub Issue Sync](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml/badge.svg)](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml)

[![Publish package to GitHub Packages](https://github.com/paritytech/review-bot/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/paritytech/review-bot/actions/workflows/publish.yml)

Have custom review rules for Pull Requests, assigning a given amount of code owners and required requests to different areas of the code.

## Why?

This action is intended for the case where a repository needs to have a more custom review criteria. This is not a replacement for [`CODEOWNERS`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) but an enhancement of it.

It allows sensitive files to be reviewed by a fixed numbers of users.

### Example scenario
#### Requiring reviews from teams
You declare that the file `example.rs` belongs to `team-rs` in the  `CODEOWNERS` file and you require 3 approvals to merge a Pull Request.

If 1 user belonging to `team-rs` approves the PR, and two different users also approve the PR, this will satisfy the requirements for GitHub.

With `Review-Bot` you can request that **3 users from the `team-rs` must review that file**. 
#### Users that belong to multiple teams
There is a file protected in `CODEOWNERS` and requires reviews from both `team-abc` and `team-xyz`.

If one user belongs to both teams, their review will satisfy both requirements.

With the `and-distinct` rule you can request that *two distinct users must review that file*.

## Installation
The installation requires two files for it to work, we first need to create a file (`.github/review-bot.yml` by default).
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

And then we must create a second file. This will be `.github/workflows/review-bot.yml`.
```yaml
name: Review Bot
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

permissions:
  contents: read
  checks: write

jobs:
  review-approvals:
    runs-on: ubuntu-latest
    steps:
      - name: "Evaluates PR reviews"
        uses: paritytech/review-bot@main
        with:
          repo-token: ${{ github.token }}
          team-token: ${{ secrets.TEAM_TOKEN }}

```
Create a new PR and see if it is working.

You should see a new action running called `Review PR/review-approvals`. 

Wait for it to finish.

After this go to your branch protection rules and make sure that you have the following setup enabled:
- [x] Require status checks to pass before merging
- Status checks that are required.
	- `review-bot`

**If `review-bot` does not appear, make a new PR and wait for `review-approvals` action to finish**. This will create the status and now it should be available in your list.
### Important
Use [`pull_request_target`](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target) for the event, not `pull_request`.
- This is a security measure so that an attacker doesn’t have access to our secrets.
## Workflow Configuration
Review bot has multiple configurations available. It has available inputs and outputs. It also has rule configurations, but you can find that in the [Rule Configuration](#rule-configuration) section.

### Inputs
You can find all the inputs in [the action file](./action.yml) but let's walk through each one of them:

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
- `config-file`: The location of the config file.
	- **default**: `.github/review-bot.yml`

#### Using a GitHub app instead of a PAT
In some cases, specially in big organizations, it is more organized to use a GitHub app to authenticate, as it allows us to give it permissions per repository and we can fine-grain them even better. If you wish to do that, you need to create a GitHub app with the following permissions:
- Organization permissions:
	- Members
		- [x] Read

Because this project is intended to be used with a token we need to do an extra step to generate one from the GitHub app:
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
```
### Outputs
Outputs are needed for your chained actions. If you want to use this information, remember to set an `id` field in the step so you can access it.

You can find all the outputs in [the action file](./action.yml) but let's walk through each one of them:
- `repo`: Organization and repo name. Written in the format of `owner/repo`.
- `report`: WIP - THIS PART NEEDS TO BE MODIFIED IN THE `action.yml` FILE
## Rule configuration file
This is the file were all the available rules are written. It contains an object called `rules` which has an array of rules. Every rule has a same base structure:
```yaml
  - name: Rule name
    condition:
      include:
        - '.*'
      exclude:
        - 'README.md'
    type: the type of the rule
```

- **name**: Name of the rule. This value must be unique per rule.
- **condition**: This is an object that contains two values:
	- **include**: An array of regex expressions of the files that match this rule.
		- If any of the files modified in a Pull Request matches this regex, the rule will be evaluated.
		- If no file matches the regex, then this rule won’t be evaluated.
	- **exclude**: The files that this rule should ignore when deciding if it should evaluate the Pull Request.
		- **optional**
		- Useful if, for example, a whole directory is inside a rule but you want to ignore a particular file as it doesn’t need specific reviewers.
	- **type**: This is the type of the rule. 
		- The available types are:
			- **basic**: Just needs a given amount of reviews.
			- **or**: Has many review options, needs at least *one option* to be fulfilled.
			- **and**: Has many review options, needs *all the options* to be fulfilled.
			-  **and-distinct**: Has many review options, needs *all the options* to be fulfilled *by different people*.
### Types
Every type has a *slightly* different configuration and works for different scenarios, so let’s analyze all of them.
#### Basic rule
As the name implies, this type is quite simple. All the files that fall under the rule evaluation must receive a given amount of approvals by the listed users and/or team members.

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
    min_approvals: 2
    teams:
      - team-1
      - team-2
	users:
      - user-1
      - user-2
```
It has the same parameters than a normal rule:
-  **name**: Name of the rule. This value must be unique per rule.
- **condition**: This is an object that contains two values:
	- **include**: An array of regex expressions of the files that match this rule.
	- **exclude**: The files that this rule should ignore when deciding if it should evaluate the Pull Request.
		- **optional**
- **type**: This must be the string `basic`.
- **min_approvals**: The amount of approvals that are need to fulfill this condition.
	- Can not be lower than 1.
	- **Optional**: Defaults to 1.
	- Must be greater than the amount of users available (you can not request 5 approvals from a team of 4 users)
- **teams**: An array of team *slugs* that need to review this file.
	- *Optional if **users** is defined*.
- **users**: An array of the GitHub usernames of the users that need to review this file. 
	- *Optional if **teams** is defined*.
#### Other rules
The other three rules (**or**, **and** and **and-distinct**) have the exact same configuration, so let’s summarize that here and then move into how they work internally.
```yaml
rules:
  - name: Other rule
    condition:
      include: 
        - '.*'
      exclude: 
        - 'example'
    type: or | and | and-distinct
    reviewers:
      - teams:
        - team-example
        users:
        - user-1
        - user-2
      - teams:
        - team-abc
        min_approvals: 2
```
- The **name** and **conditions** fields have the same requirements that the `basic` rule has.
- **type**: Must be `or`, `and` or `and-distinct`.
- **reviewers**: This is an array that contains all the available options for review.
	- Each of this options works independently.
	- Must have at least two options.
		- If you only need 1 option then use the `basic` rule.
	- Each options has the following fields:
		- **min_approvals**: The amount of approvals that are need to fulfill this condition.
			- Can not be lower than 1.
			- **Optional**: Defaults to 1.
			- Must be greater than the amount of users available (you can not request 5 approvals from a team of 4 users)
		- **teams**: An array of team *slugs* that need to review this file.
			- *Optional if **users** is defined*.
		- **users**: An array of the GitHub usernames of the users that need to review this file. 
			- *Optional if **teams** is defined*.

##### Or rule logic
This is a rule that has at least two available options of reviewers and need **at least one group to approve**.

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
    min_approvals: 2
```
This rule will be approved with *any of the following* conditions:
- If a user that belong to `team-example` or is `user-1` or `user-2` approves the PR.
- If *two users* that belong to `team-abc` approves the PR.

As you can see, this only needs **one of the conditions to be fulfilled** to approve the rule. You could approve the rule with only one user’s review instead of two. That’s why it is called the `or` rule.
##### And rule logic
This is a rule that has at least two available options of reviewers and need **all of the options to approve the PR**.

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
    min_approvals: 2
```
This rule will be approved if *all of the the following conditions get fulfilled*:
- *one* user that belong to `team-example` or is `user-1` or `user-2` approves the PR.
- If *two users* that belong to `team-abc` approves the PR.

If only one of these conditions get fulfilled, the check won’t pass as **it needs all the groups**. You would need *3 approvals to fulfill all the conditions*.

Although, there is a *caveat* with this rule.

In this example, if a user belongs to both `team-abc` and to `team-example` his approval will count towards both rules so you could use only two approvals instead of three. To fight that we created the `and-distinct` rule.
##### And distinct logic
The logic in this rule is the *same as the `and` rule with one exception.* Like the `and` rule it needs all of its requirements to be fulfilled, **but they all must be fulfilled by different users.**

Meaning that if a user belongs to both `team-abc` and `team-example` their approval will count only towards one of the available options *even if they fulfill both needs*.

This rule is useful when you need to make sure that at leasts two sets of eyes of two different teams review a Pull Request.

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
- Use `yarn fix` to fix all the auto fixable problems reported by the linter.
## Deployment
Pending on https://github.com/paritytech/review-bot/issues/55
