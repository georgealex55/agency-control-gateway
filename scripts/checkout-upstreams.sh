#!/usr/bin/env bash
set -euo pipefail
# Explicit opt-in: download full upstream sources only on a development workstation.
# The submodules default to update=none so Vercel builds do not clone huge services.
git submodule sync --recursive
git submodule update --init --recursive --checkout
node scripts/verify-sources.mjs
