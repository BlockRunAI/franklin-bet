# Cloud Run Job image for the results cron (replaces the GitHub Actions cron).
# Clones the repo, runs fetch-results.mjs (ESPN), and pushes results.json back
# to GitHub. Tiny: just node + git + the entrypoint.
FROM node:20-alpine
RUN apk add --no-cache git
COPY run.sh /run.sh
RUN chmod +x /run.sh
ENTRYPOINT ["/run.sh"]
