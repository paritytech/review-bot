# review-bot

[![GitHub Issue Sync](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml/badge.svg)](https://github.com/paritytech/review-bot/actions/workflows/github-issue-sync.yml)

[![Publish package to GitHub Packages](https://github.com/paritytech/review-bot/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/paritytech/review-bot/actions/workflows/publish.yml)

Have custom review rules for PRs with auto assignment.

## Evaluating config

If you want to evaluate the config, we have a simple `cli` to do so.

```bash
yarn run cli ".github/review-bot.yml" # set the parameter as the location of the config
```
