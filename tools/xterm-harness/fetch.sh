#!/usr/bin/env bash
# Fetch xterm.js 6.1.0-beta.304, the build the harness was measured with, into tools/out/xterm (git-ignored).
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/out/xterm"; mkdir -p "$out"; tmp=$(mktemp -d)
(cd "$tmp" && npm pack @xterm/xterm@6.1.0-beta.304 --silent >/dev/null && tar xzf xterm-xterm-*.tgz)
cp "$tmp/package/lib/xterm.js" "$tmp/package/css/xterm.css" "$out/"; rm -rf "$tmp"; echo "$out"
