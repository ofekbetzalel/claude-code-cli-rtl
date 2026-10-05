#!/usr/bin/env bash
# Installs the mod for every Claude Code session of this user: a copy of mod/rtl in a stable
# folder, named by CLAUDE_CODE_PLUGIN_DIRS in the env block of ~/.claude/settings.json.
# Re-run it to update the copy; running sessions reload the watched folder on their own.
#
# The live copy is replaced only by a checked candidate: the source must pass the unit tests and
# `claude plugin validate`, and a staged copy must validate. Then the files move in, and the live
# copy must validate in place.
#
# What a failure leaves (tools/install.test.sh checks each case):
# - before the files move: the live copy is untouched;
# - while they move, or when the moved copy does not validate: the previous copy is put back
#   (a first install removes the folder it made). Ctrl-C, TERM and HUP are handled the same way;
# - the owned temporary folders (.rtl-stage, .rtl-prev) are removed in both cases.
# The move is file by file (rsync --delay-updates renames the files in at the end), not one atomic
# switch, so a session may reload a half-moved copy and then reload again. Only a kill or a power
# loss can leave a mixed copy: then .rtl-prev is kept, and the next run stops until someone
# checks it. If putting the previous copy back fails, .rtl-prev is kept and named as well.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
dest=${RTL_MOD_DEST:-$HOME/.local/share/claude-code-cli-rtl/rtl}
settings=${RTL_SETTINGS:-$HOME/.claude/settings.json}
parent=$(dirname "$dest")
stage="$parent/.rtl-stage"
prev="$parent/.rtl-prev"
# the engine's generated declarations in the live copy stay where they are
types='.claude-plugin/types'

if [ -e "$prev" ]; then
  echo "install: $prev is left from an install that did not finish; it may be the last good copy." >&2
  echo "install: compare it with $dest, keep the right one, remove $prev, then run again; nothing changed" >&2
  exit 1
fi

state=checking
had_dest=
finish() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [ "$status" -ne 0 ] && [ "$state" = moving ]; then
    if [ -z "$had_dest" ]; then
      rm -rf "$dest"
      echo "install: the copy failed; the new folder is removed" >&2
    elif rsync -a --delete --exclude "$types" "$prev/" "$dest/"; then
      echo "install: the copy failed; the previous copy is back" >&2
    else
      rm -rf "$stage"
      echo "install: the copy failed, and so did putting the previous copy back; it is in $prev" >&2
      exit "$status"
    fi
  fi
  rm -rf "$stage" "$prev"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

cd "$repo"
node --test 'mod/rtl/tests/*.spec.ts' >/dev/null || { echo "install: unit tests fail; nothing changed" >&2; exit 1; }
claude plugin validate mod/rtl >/dev/null || { echo "install: the source does not validate; nothing changed" >&2; exit 1; }

mkdir -p "$parent"
rm -rf "$stage"
rsync -a --exclude tests --exclude "$types" mod/rtl/ "$stage/"
commit=$(git rev-parse --short HEAD)
git diff --quiet HEAD -- mod/rtl || commit="$commit+dirty"
printf '%s\n' "$commit" > "$stage/.installed-from"
claude plugin validate "$stage" >/dev/null || { echo "install: the staged copy does not validate; nothing changed" >&2; exit 1; }

if [ -d "$dest" ]; then
  had_dest=1
  cp -a "$dest" "$prev"
fi
state=moving
mkdir -p "$dest"
rsync -a --delete --delay-updates --exclude "$types" "$stage/" "$dest/"
claude plugin validate "$dest" >/dev/null || { echo "install: the installed copy does not validate" >&2; exit 1; }
state=moved
rm -rf "$stage" "$prev"

# Settings are written only when the folder is not named yet, after a backup.
python3 - "$settings" "$dest" <<'PY'
import json, os, shutil, sys, time
path, dest = sys.argv[1], sys.argv[2]
data = json.load(open(path)) if os.path.exists(path) else {}
env = data.setdefault('env', {})
dirs = [d for d in env.get('CLAUDE_CODE_PLUGIN_DIRS', '').split(os.pathsep) if d]
if dest in dirs:
    sys.exit(0)
if os.path.exists(path):
    shutil.copy2(path, path + '.bak-rtl-' + time.strftime('%Y%m%dT%H%M%S'))
dirs.append(dest)
env['CLAUDE_CODE_PLUGIN_DIRS'] = os.pathsep.join(dirs)
tmp = path + '.tmp'
try:
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    os.chmod(tmp, os.stat(path).st_mode & 0o777 if os.path.exists(path) else 0o600)
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp):
        os.remove(tmp)
PY
echo "installed: $dest ($commit)"
