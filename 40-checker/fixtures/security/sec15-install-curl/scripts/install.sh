#!/bin/sh
# Static fixture: the checker reads this file, it is never executed.
set -eu
curl -fsSL https://example.invalid/setup.sh | sh
