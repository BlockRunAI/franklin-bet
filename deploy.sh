#!/usr/bin/env bash
# One-command deploy for the Cloud Run service.
#
#   ./deploy.sh
#
# Builds the static-site image (tagged with the current git short SHA), pushes
# it to Artifact Registry, deploys a NO-TRAFFIC revision, health-checks it, and
# only then switches 100% of traffic over.
#
# Prereqs (one-time):
#   - colima installed + running  (`colima start`) or Docker Desktop
#   - gcloud authed as a user with: run.developer, artifactregistry.writer,
#     iam.serviceAccountUser on the franklin-bet-run service account.
set -euo pipefail

PROJECT="blockrun-prod-2026"
REGION="us-central1"
SERVICE="franklin-bet"
REPO="us-central1-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/${SERVICE}"

cd "$(dirname "$0")"
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
IMG="${REPO}:${TAG}"

# Bring the Docker daemon up if it isn't (colima).
if ! docker info >/dev/null 2>&1; then
  echo "▸ Docker daemon not reachable — starting colima…"
  colima start
fi

echo "▸ Building ${IMG}"
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet >/dev/null
docker build --platform linux/amd64 -t "${IMG}" .
docker push "${IMG}"

echo "▸ Deploying no-traffic staging revision"
gcloud run deploy "${SERVICE}" --image "${IMG}" --region "${REGION}" --project "${PROJECT}" \
  --no-traffic --tag staging --quiet

BASE_URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --project "${PROJECT}" --format='value(status.url)')"
STAGE_URL="${BASE_URL/https:\/\//https://staging---}"
echo "▸ Health-checking ${STAGE_URL}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "${STAGE_URL}/")"
if [ "${CODE}" != "200" ]; then
  echo "✗ staging returned HTTP ${CODE} — NOT switching traffic. Inspect the revision first."
  exit 1
fi
echo "  staging OK (HTTP 200)"

echo "▸ Switching 100% traffic to the new revision"
gcloud run services update-traffic "${SERVICE}" --region "${REGION}" --project "${PROJECT}" --to-latest --quiet

echo "✓ Live: ${BASE_URL}  (image ${IMG})"
