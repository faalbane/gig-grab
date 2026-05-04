#!/usr/bin/env bash
# Provision a Cloud SQL Postgres instance for Gig-grab.
# Idempotent — safe to re-run; will skip steps that already exist.
#
# Prerequisites:
#   1. `gcloud auth login` (already done)
#   2. Billing enabled on the project — DO THIS IN THE CONSOLE FIRST:
#        https://console.cloud.google.com/billing/linkedaccount?project=gig-grab
#
# Cost: smallest practical Postgres tier (db-custom-1-3840, 1 vCPU 3.75GB RAM)
#       runs ~$50/mo + $0.17/GB SSD. We can scale down to db-perf-optimized later
#       if needed; no smaller tier exists for Postgres.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gig-grab}"
REGION="${REGION:-europe-west2}"           # London — closest to UK pilot
INSTANCE="${INSTANCE:-gig-grab-db}"
DB_NAME="${DB_NAME:-gig_grab}"
DB_USER="${DB_USER:-gig_app}"
DB_TIER="${DB_TIER:-db-custom-1-3840}"     # 1 vCPU, 3.75GB RAM
DB_VERSION="${DB_VERSION:-POSTGRES_16}"

echo "==> Setting active project to $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

echo "==> Enabling required APIs"
gcloud services enable \
  sqladmin.googleapis.com \
  servicenetworking.googleapis.com \
  --project "$PROJECT_ID"

if gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "==> Instance $INSTANCE already exists — skipping create"
else
  echo "==> Creating Cloud SQL instance $INSTANCE in $REGION ($DB_TIER, $DB_VERSION)"
  gcloud sql instances create "$INSTANCE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --database-version="$DB_VERSION" \
    --tier="$DB_TIER" \
    --storage-type=SSD \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --enable-point-in-time-recovery \
    --database-flags=cloudsql.enable_pgvector=on
fi

echo "==> Ensuring database $DB_NAME exists"
gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" --project="$PROJECT_ID"

if ! gcloud sql users list --instance="$INSTANCE" --project="$PROJECT_ID" --format="value(name)" | grep -qx "$DB_USER"; then
  DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
  echo "==> Creating user $DB_USER (password generated; copy it now)"
  gcloud sql users create "$DB_USER" \
    --instance="$INSTANCE" \
    --password="$DB_PASSWORD" \
    --project="$PROJECT_ID"
  echo
  echo "    DB password: $DB_PASSWORD"
  echo "    Save this — it will not be shown again."
  echo
else
  echo "==> User $DB_USER already exists"
fi

CONNECTION_NAME="$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"

echo
echo "==> Done. Connection name: $CONNECTION_NAME"
echo
echo "Next: enable pgvector in the database (one-time):"
echo "    gcloud sql connect $INSTANCE --user=$DB_USER --database=$DB_NAME"
echo "    (in psql) CREATE EXTENSION IF NOT EXISTS vector;"
echo "    (in psql) CREATE EXTENSION IF NOT EXISTS pg_trgm;"
echo
echo "Then set in .env:"
echo "    DATABASE_URL=postgres://$DB_USER:<password>@/$DB_NAME?host=/cloudsql/$CONNECTION_NAME"
echo
echo "For local dev with the proxy:"
echo "    cloud-sql-proxy $CONNECTION_NAME --port 5433"
echo "    DATABASE_URL=postgres://$DB_USER:<password>@127.0.0.1:5433/$DB_NAME"
