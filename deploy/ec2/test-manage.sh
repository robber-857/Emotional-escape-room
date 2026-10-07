#!/usr/bin/env bash
# Isolated command-flow tests. No Docker daemon or real database is used.
set -Eeuo pipefail
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/deploy/ec2" "$TEST_ROOT/bin"
cp "$SOURCE/manage.sh" "$SOURCE/compose.yaml" "$TEST_ROOT/deploy/ec2/"
export TEST_LOG="$TEST_ROOT/commands.log"
export PATH="$TEST_ROOT/bin:$PATH"
cat > "$TEST_ROOT/bin/flock" <<'MOCK'
#!/usr/bin/env bash
# Locking semantics must be verified on Linux; this suite tests command order.
[[ "${LOCK_BUSY:-0}" != 1 ]]
MOCK
cat > "$TEST_ROOT/bin/getent" <<'MOCK'
#!/usr/bin/env bash
[[ "${FAIL_DNS:-0}" != 1 ]]
MOCK
cat > "$TEST_ROOT/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
echo "$*" >> "$TEST_LOG"
case "$*" in
  *pg_dump*) [[ "${FAIL_BACKUP:-0}" != 1 ]] || exit 1; echo 'mock archive' ;;
  *pg_restore*) cat >/dev/null ;;
  *'run --rm --no-deps migrate') [[ "${FAIL_MIGRATION:-0}" != 1 ]] || exit 1 ;;
  *'migrate python'*) [[ "${FAIL_AUTH:-0}" != 1 ]] || exit 1 ;;
  *'caddy validate'*) [[ "${FAIL_CADDY:-0}" != 1 ]] || exit 1 ;;
  *'exec -T api python'*) cat >/dev/null; [[ "${FAIL_READY:-0}" != 1 ]] || exit 1 ;;
esac
MOCK
cat > "$TEST_ROOT/bin/git" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  *status*) [[ "${FAIL_GIT:-0}" != 1 ]] || exit 1; [[ "${DIRTY:-0}" != 1 ]] || echo ' M README.md' ;;
  *rev-parse*) echo 'abcdef01234567890123456789012345678901234' ;;
esac
exit 0
MOCK
cat > "$TEST_ROOT/bin/curl" <<'MOCK'
#!/usr/bin/env bash
[[ "${FAIL_TLS:-0}" != 1 ]] || exit 1
echo '{"status":"ok","persistence_ready":true,"scoring_engine_ready":true,"schema_version":"0005_scoring"}'
MOCK
chmod +x "$TEST_ROOT/bin/"*
run() { bash "$TEST_ROOT/deploy/ec2/manage.sh" "$@"; }
run init game.example.com
cp "$TEST_ROOT/deploy/ec2/.env" "$TEST_ROOT/original.env"
if run init game.example.com >/dev/null 2>&1; then echo 'FAIL: init overwrote env'; exit 1; fi
cmp "$TEST_ROOT/original.env" "$TEST_ROOT/deploy/ec2/.env"
run deploy >/dev/null
stop_line="$(grep -n 'stop proxy web api' "$TEST_LOG" | cut -d: -f1)"
backup_line="$(grep -n pg_dump "$TEST_LOG" | cut -d: -f1)"
migrate_line="$(grep -n 'run --rm --no-deps migrate$' "$TEST_LOG" | cut -d: -f1)"
[[ "$stop_line" -lt "$backup_line" && "$backup_line" -lt "$migrate_line" ]]
grep -q '^RELEASE_ID=abcdef012345-' "$TEST_ROOT/deploy/ec2/.env"
[[ -s "$TEST_ROOT/deploy/ec2/state/releases.log" ]]
for mode in FAIL_BACKUP FAIL_MIGRATION DIRTY FAIL_GIT FAIL_AUTH FAIL_CADDY FAIL_DNS FAIL_TLS FAIL_READY LOCK_BUSY; do
  : > "$TEST_LOG"
  cp "$TEST_ROOT/deploy/ec2/.env" "$TEST_ROOT/before.env"
  if env "$mode=1" bash "$TEST_ROOT/deploy/ec2/manage.sh" deploy >/dev/null 2>&1; then
    echo "FAIL: $mode returned success"; exit 1
  fi
  cmp "$TEST_ROOT/before.env" "$TEST_ROOT/deploy/ec2/.env"
  case "$mode" in
    FAIL_BACKUP) ! grep -q 'run --rm --no-deps migrate$' "$TEST_LOG" ;;
    FAIL_MIGRATION) ! grep -q 'up -d --no-deps' "$TEST_LOG" ;;
    DIRTY|FAIL_GIT|FAIL_DNS|LOCK_BUSY) ! grep -q 'build api web' "$TEST_LOG" ;;
    FAIL_AUTH|FAIL_CADDY) ! grep -q 'stop proxy web api' "$TEST_LOG" ;;
  esac
done
LOCK_BUSY=1 run status >/dev/null
LOCK_BUSY=1 run logs api >/dev/null
printf '\nDOMAIN=duplicate.example.com\n' >> "$TEST_ROOT/deploy/ec2/.env"
if run check >/dev/null 2>&1; then echo 'FAIL: duplicate env key accepted'; exit 1; fi
echo 'PASS: init preservation, release persistence, command ordering, 10 failure guards, diagnostics during lock, duplicate env rejection.'
