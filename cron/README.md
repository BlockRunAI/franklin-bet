# GCP results cron

Replaces the GitHub Actions results cron (which was hit by the org's GitHub
billing lock). Runs entirely on GCP, in the same project as the site:

```
Cloud Scheduler (*/30 min) ──► Cloud Run Job ──► node scripts/fetch-results.mjs (ESPN)
                                              └─► git push results.json → GitHub
                                                    └─► site reads it from raw → live
```

The data flow is unchanged — the job just pushes `results.json` to `main`, and
the front-end keeps reading from `raw.githubusercontent.com`. No front-end edits.

## Files
- `Dockerfile` / `run.sh` — the job image (clone → fetch-results → push).
- `deploy.sh` — build + deploy commands, split into ANDY vs ADMIN steps.

## What's needed (one-time)

1. **GitHub PAT** — a fine-grained token with **Contents: Read & Write** on
   `BlockRunAI/franklin-bet` only. (andy can create this himself in GitHub →
   Settings → Developer settings → Fine-grained tokens.)

2. **Perms** — andy already has Cloud Run Jobs (`run.developer`) and Artifact
   Registry write, but **lacks**:
   - `roles/secretmanager.admin` — store the PAT + grant the job's SA access.
   - `roles/cloudscheduler.admin` — create the scheduler.
   - `roles/run.admin` (or just the one job IAM binding) — let the scheduler SA
     invoke the job.
   - Enabling `cloudscheduler.googleapis.com` + `secretmanager.googleapis.com`.

**Easiest:** the boss (owner of `blockrun-prod-2026`) runs `deploy.sh` once
(uncommenting the ADMIN blocks) after andy supplies the PAT — he already has all
the perms. Otherwise grant andy the three roles above + enable the two APIs and
andy runs it.

The job's runtime SA reuses the site's `franklin-bet-run` service account.
