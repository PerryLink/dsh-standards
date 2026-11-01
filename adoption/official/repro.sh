#!/usr/bin/env bash
# Reproduce one DSH level record in a clean DSH_HOME.
#
# This script does not grant exemptions, does not edit the profile by hand, and
# does not turn a skip into a pass. If a host is missing, it reports `blocked`.
#
# Usage:
#   ./adoption/official/repro.sh <plugin-dir> [--host <app-boot/lib/index.js>] [--out <dir>]
#
# Exit: 0 record produced (even if the record is partial), 2 input error, 3 tool error.
set -eu

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

PLUGIN=""
HOST=""
OUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) PLUGIN="$1"; shift ;;
  esac
done

if [ -z "$PLUGIN" ] || [ ! -d "$PLUGIN" ]; then
  echo "usage: $0 <plugin-dir> [--host <app-boot/lib/index.js>] [--out <dir>]" >&2
  exit 2
fi

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
AUDIT="$ROOT/40-checker/scripts/level-audit.mjs"
if [ ! -f "$AUDIT" ]; then
  echo "cannot find $AUDIT" >&2
  exit 3
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required (>=20)" >&2
  exit 3
fi

OUT="${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/dsh-repro.XXXXXX")}"
mkdir -p "$OUT"
export DSH_HOME="$OUT/dsh-home"
mkdir -p "$DSH_HOME"

ARGS=(--format json --out "$OUT/audit.json")
if [ -n "$HOST" ]; then
  ARGS+=(--host "$HOST")
fi

echo "plugin: $PLUGIN"
echo "dsh_home: $DSH_HOME"
echo "node: $(node --version)"
echo "record: $OUT/audit.json"

set +e
node "$AUDIT" "$PLUGIN" "${ARGS[@]}"
STATUS=$?
set -e

if [ -f "$OUT/audit.json" ]; then
  echo "produced: $OUT/audit.json"
  # Print only the summary; never rewrite the record.
  node -e "
    const fs = require('fs');
    const r = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const levels = r.levels || {};
    console.log(JSON.stringify({
      schema: r.schema,
      target: r.target,
      levels: {
        entry: levels.entry && levels.entry.state,
        flow: levels.flow && levels.flow.state,
        boost: levels.boost && levels.boost.state,
      },
      nextActions: r.nextActions,
    }, null, 2));
  " "$OUT/audit.json" || true
else
  echo "no record produced; the checker exited $STATUS" >&2
  exit 3
fi

# The checker's exit code is kept for callers that gate on it, but a partial
# record is still a record; do not translate it into PASS.
exit "$STATUS"
