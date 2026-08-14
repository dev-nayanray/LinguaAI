#!/usr/bin/env bash
# ADR-024 — regenerates apps/mobile/assets/design_tokens.json fresh from
# packages/ui's own tokens.css. Run before `flutter run`/`flutter test`/
# `flutter build` (a CI/pre-build step per T5, not committed — see
# apps/mobile/.gitignore).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

node "$REPO_ROOT/packages/ui/scripts/generate-tokens.mjs" \
  --out "$SCRIPT_DIR/../assets/design_tokens.json"
