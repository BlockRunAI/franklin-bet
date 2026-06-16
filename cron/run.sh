#!/bin/sh
# Cloud Run Job entrypoint: clone the repo, refresh results from ESPN, push back.
# GITHUB_TOKEN (a fine-grained PAT with contents:write on the repo) is injected
# from Secret Manager by the job config.
set -eu
: "${GITHUB_TOKEN:?GITHUB_TOKEN not set}"
REPO="${REPO:-BlockRunAI/franklin-bet}"
BRANCH="${BRANCH:-main}"

git clone --depth 1 --branch "$BRANCH" "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" /work
cd /work

node scripts/fetch-results.mjs

if git diff --quiet -- data/results.json; then
  echo "no change"
  exit 0
fi
git config user.name  "franklin-bet-bot"
git config user.email "bot@franklin.bet"
git add data/results.json
git commit -m "chore: refresh match results (cloud cron)"
git push origin "HEAD:${BRANCH}"
echo "pushed results"
