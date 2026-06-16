#!/usr/bin/env bash
# Deploy the GCP-native results cron (replaces the GitHub Actions cron):
#   Cloud Scheduler (*/30) → Cloud Run Job → fetch ESPN → push results.json.
#
# Steps are split by who can run them. ADMIN steps need roles andy lacks today
# (Secret Manager, Cloud Scheduler, API enablement, job IAM). ANDY steps need
# only run.developer + artifactregistry.writer + serviceAccountUser (already has).
set -euo pipefail
PROJECT=blockrun-prod-2026
REGION=us-central1
SA="franklin-bet-run@${PROJECT}.iam.gserviceaccount.com"   # reuse the site's runtime SA
IMG="us-central1-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/franklin-cron:latest"
JOB=franklin-results-cron
SCHED=franklin-results-sched
SECRET=franklin-github-token

cd "$(dirname "$0")/.."   # repo root (so the build context is cron/)

# ── ADMIN (one-time): APIs + secret + IAM ────────────────────────────────────
# gcloud services enable cloudscheduler.googleapis.com secretmanager.googleapis.com --project $PROJECT
#
# # Store the GitHub fine-grained PAT (contents:write on franklin-bet):
# printf '%s' "$GITHUB_PAT" | gcloud secrets create $SECRET --data-file=- --project $PROJECT
# gcloud secrets add-iam-policy-binding $SECRET --project $PROJECT \
#     --member "serviceAccount:${SA}" --role roles/secretmanager.secretAccessor
#
# # Let the scheduler's SA invoke the job:
# gcloud run jobs add-iam-policy-binding $JOB --region $REGION --project $PROJECT \
#     --member "serviceAccount:${SA}" --role roles/run.invoker

# ── ANDY: build + push the job image ─────────────────────────────────────────
docker build --platform linux/amd64 -t "$IMG" cron/
docker push "$IMG"

# ── ANDY: deploy the Cloud Run Job (secret injected as GITHUB_TOKEN) ──────────
gcloud run jobs deploy $JOB --image "$IMG" --region $REGION --project $PROJECT \
  --service-account "$SA" \
  --set-secrets "GITHUB_TOKEN=${SECRET}:latest" \
  --max-retries 1 --task-timeout 120s

# ── ADMIN: Cloud Scheduler → run the job every 30 min ────────────────────────
# gcloud scheduler jobs create http $SCHED --location $REGION --project $PROJECT \
#   --schedule "*/30 * * * *" \
#   --uri "https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run" \
#   --http-method POST \
#   --oauth-service-account-email "$SA"

echo "✓ Job built + deployed. Uncomment the ADMIN blocks (or have the boss run them) for the secret + scheduler."
