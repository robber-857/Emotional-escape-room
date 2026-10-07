#!/usr/bin/env bash
# Fixed project name, explicit env file, no implicit use of development Compose.
set -Eeuo pipefail
umask 077
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
ENV_FILE="$DIR/.env"
STATE="$DIR/state"
die() { echo "ERROR: $*" >&2; exit 1; }
ACTION="${1:-help}"
if [[ "$ACTION" == help ]]; then
  echo 'Usage: manage.sh init DOMAIN | check | deploy | backup | status | logs | compose ARGS...'
  exit 0
fi
command -v flock >/dev/null || die 'flock is required (Ubuntu package: util-linux).'
mkdir -p "$STATE"
case "$ACTION" in
  status|logs|check) ;; # Diagnostics remain available during a long deployment.
  init|deploy|backup|compose)
    exec 9>"$STATE/operation.lock"
    flock -n 9 || die 'Another operation is running.' ;;
  *) die "Unknown action: $ACTION" ;;
esac
if [[ "$ACTION" == init ]]; then
  [[ ! -e "$ENV_FILE" ]] || die '.env already exists; credentials were not changed.'
  domain="${2:-}"
  [[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$ ]] || die 'Provide a public DNS hostname, e.g. game.example.com.'
  password="$(openssl rand -hex 32)"
  printf 'DOMAIN=%s\nPOSTGRES_USER=emotional\nPOSTGRES_DB=emotional\nPOSTGRES_PASSWORD=%s\nRELEASE_ID=unreleased\n' "$domain" "$password" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo 'Created deploy/ec2/.env (mode 600). Save a secure copy outside this host.'
  exit 0
fi
[[ -f "$ENV_FILE" ]] || die 'Run init first.'
# Parse a deliberately small format; never execute an env file as shell code.
unset DOMAIN POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD RELEASE_ID
declare -A seen=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" == *=* ]] || die 'Invalid env line.'
  key="${line%%=*}"; value="${line#*=}"
  [[ -n "$key" ]] || die 'Empty env key.'
  [[ -z "${seen[$key]:-}" ]] || die "Duplicate env key: $key"
  seen[$key]=1
  case "$key" in DOMAIN|POSTGRES_USER|POSTGRES_DB|POSTGRES_PASSWORD|RELEASE_ID) export "$key=$value" ;; *) die "Unsupported env key: $key" ;; esac
done < "$ENV_FILE"
[[ "${DOMAIN:-}" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$ ]] || die 'Invalid DOMAIN.'
[[ "${POSTGRES_USER:-}" =~ ^[a-z][a-z0-9_]*$ && "${POSTGRES_DB:-}" =~ ^[a-z][a-z0-9_]*$ ]] || die 'Use lowercase database identifiers.'
[[ "${POSTGRES_PASSWORD:-}" =~ ^[a-zA-Z0-9]{32,}$ ]] || die 'Password must contain at least 32 letters/digits; use init.'
[[ "${RELEASE_ID:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die 'Invalid RELEASE_ID.'
docker compose version >/dev/null
docker info >/dev/null
dc() { docker compose --project-name emotional-prod --env-file "$ENV_FILE" -f "$DIR/compose.yaml" "$@"; }
dc config --quiet
preflight() {
  for command in curl git openssl getent; do
    command -v "$command" >/dev/null || die "Missing command: $command. Run bootstrap-ubuntu.sh."
  done
  docker buildx version >/dev/null
  getent ahosts "$DOMAIN" >/dev/null || die 'DOMAIN has no DNS result. Configure public DNS first.'
  echo "Preflight passed for $DOMAIN. Check DNS points to this EC2 and inbound 80/443 are open."
}
verify_ready() {
  dc exec -T api python -c 'import json,sys; r=json.load(sys.stdin); assert r.get("status")=="ok" and r.get("persistence_ready") is True and r.get("scoring_engine_ready") is True and r.get("schema_version"), "Unexpected readiness response"'
}
backup() {
  mkdir -p "$DIR/backups"
  local file="$DIR/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
  if ! dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.partial"; then
    rm -f -- "$file.partial"
    die 'Backup failed; deployment stopped.'
  fi
  [[ -s "$file.partial" ]] || die 'Empty backup.'
  dc exec -T db pg_restore --list < "$file.partial" >/dev/null
  mv -- "$file.partial" "$file"
  echo "Backup created: $file (archive list checked; restore still needs rehearsal)."
}
case "$ACTION" in
  deploy)
    preflight
    # Refuse uncommitted source so a release SHA is meaningful.
    gitcmd=(git -c "safe.directory=$ROOT" -C "$ROOT")
    tree_status="$("${gitcmd[@]}" status --porcelain)" || die 'Cannot read Git checkout status.'
    [[ -z "$tree_status" ]] || die 'Commit/stash intended changes before deployment; checkout must be clean.'
    revision="$("${gitcmd[@]}" rev-parse HEAD)"
    export RELEASE_ID="${revision:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
    printf '%s commit=%s attempted_release=%s\n' "$(date -u +%FT%TZ)" "$revision" "$RELEASE_ID" >> "$STATE/attempts.log"
    trap 'echo "Deployment failed. Check status/logs and state/attempts.log. Services may remain stopped; no automatic schema rollback was attempted." >&2' ERR
    # Build before downtime; retain old application images for rollback.
    dc build api web
    dc pull proxy
    dc run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    dc up -d --wait --wait-timeout 180 db
    # Check configured TCP credentials, not just pg_isready/local socket trust.
    dc run --rm --no-deps migrate python -c 'from app.db import make_engine; e=make_engine(); c=e.connect(); c.exec_driver_sql("SELECT 1"); c.close(); e.dispose()'
    dc stop proxy web api
    backup
    dc run --rm --no-deps migrate 2>&1 | tee "$STATE/migration-$RELEASE_ID.log"
    dc up -d --no-deps --no-build --pull never --wait --wait-timeout 240 api
    dc up -d --no-deps --no-build --pull never --wait --wait-timeout 240 web
    dc up -d --no-deps --force-recreate proxy
    # Prove this EC2's proxy/TLS works before checking the public DNS route.
    curl --fail --silent --show-error --noproxy '*' --resolve "$DOMAIN:443:127.0.0.1" \
      --retry 20 --retry-delay 5 --retry-all-errors --connect-timeout 5 --max-time 10 \
      "https://$DOMAIN/api/v1/ready" | verify_ready
    curl --fail --silent --show-error --retry 20 --retry-delay 5 --retry-all-errors \
      --connect-timeout 5 --max-time 10 "https://$DOMAIN/api/v1/ready" | verify_ready
    curl --fail --silent --show-error --connect-timeout 5 --max-time 30 "https://$DOMAIN/" >/dev/null
    cp -- "$ENV_FILE" "$STATE/previous.env"
    sed "s/^RELEASE_ID=.*/RELEASE_ID=$RELEASE_ID/" "$ENV_FILE" > "$ENV_FILE.tmp"
    mv -- "$ENV_FILE.tmp" "$ENV_FILE"
    printf '%s commit=%s release=%s\n' "$(date -u +%FT%TZ)" "$revision" "$RELEASE_ID" >> "$STATE/releases.log"
    echo; echo "Deployment checks passed: https://$DOMAIN ; run browser UAT next."
    ;;
  backup) backup ;;
  check) preflight ;;
  status) dc ps -a ;;
  logs) dc logs --tail 100 "${2:-api}" ;;
  compose) shift; dc "$@" ;;
  *) die "Unknown action: $ACTION" ;;
esac
