#!/usr/bin/env bash
set -euo pipefail
echo "Installing demo deps…"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
echo "Done."
