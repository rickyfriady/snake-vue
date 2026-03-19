#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Release tag aborted: working tree is not clean."
  echo "Commit or stash your changes before tagging."
  exit 1
fi

PACKAGE_VERSION="$(bun -e "import { readFileSync } from 'node:fs'; const pkg = JSON.parse(readFileSync('package.json', 'utf8')); console.log(pkg.version)")"
INPUT_VERSION="${1:-$PACKAGE_VERSION}"
TAG_NAME="v${INPUT_VERSION#v}"

if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
  echo "Release tag aborted: tag '$TAG_NAME' already exists."
  exit 1
fi

bun run release:check
git tag -a "$TAG_NAME" -m "release $TAG_NAME"

echo "Release tag created: $TAG_NAME"
