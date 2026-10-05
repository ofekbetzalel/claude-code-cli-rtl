#!/usr/bin/env bash
# Regressions for tools/install.sh: what a failure leaves behind.
# Everything happens in a temporary folder. `node` and `claude` are stubbed (the real checks run
# in `npm run check`); `rsync` is the real one, wrapped so a test can break the move into the live
# copy after its first file, or interrupt it.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir "$tmp/bin"
real_rsync=$(command -v rsync)
cat > "$tmp/bin/node" <<'SH'
#!/bin/sh
exit 0
SH
cat > "$tmp/bin/claude" <<'SH'
#!/bin/sh
# claude plugin validate <path>: fails only for the path named by FAKE_BAD_VALIDATE
[ -n "${FAKE_BAD_VALIDATE:-}" ] && [ "$3" = "$FAKE_BAD_VALIDATE" ] && exit 1
exit 0
SH
cat > "$tmp/bin/rsync" <<SH
#!/bin/sh
# FAKE_RSYNC=fail|term breaks the move into the live copy (the call with --delay-updates) after
# replacing its first file; fail-both also breaks the call that puts the previous copy back.
for last; do :; done
case " \$* " in
  *" --delay-updates "*)
    case "\${FAKE_RSYNC:-}" in
      fail|fail-both|term)
        mkdir -p "\$last/hooks"
        cp "$tmp/new-register.tsx" "\$last/hooks/register.tsx"
        [ "\$FAKE_RSYNC" = term ] && { kill -TERM \$PPID; exit 0; }
        exit 23 ;;
    esac ;;
  *"/.rtl-prev/ "*)
    [ "\${FAKE_RSYNC:-}" = fail-both ] && exit 23 ;;
esac
exec "$real_rsync" "\$@"
SH
chmod +x "$tmp/bin/"*
printf '// a file the failed move wrote\n' > "$tmp/new-register.tsx"

export PATH="$tmp/bin:$PATH"
export RTL_MOD_DEST="$tmp/share/rtl"
export RTL_SETTINGS="$tmp/settings.json"
dest=$RTL_MOD_DEST
parent=$(dirname "$dest")
printf '{"env":{"KEEP":"1"}}\n' > "$RTL_SETTINGS"
chmod 600 "$RTL_SETTINGS"

fails=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }
install() { "$here/install.sh" >"$tmp/out" 2>&1; }
no_temp() { [ ! -e "$parent/.rtl-stage" ] && [ ! -e "$parent/.rtl-prev" ]; }
same_live() { diff -r "$tmp/snapshot" "$dest" >/dev/null; }
settings_sum() { sha256sum "$RTL_SETTINGS" | cut -d' ' -f1; }

# A first install into an empty place
if install && [ -f "$dest/hooks/register.tsx" ] && [ -s "$dest/.installed-from" ] && no_temp \
  && python3 -c 'import json,sys; e=json.load(open(sys.argv[1]))["env"]; assert e["KEEP"]=="1" and sys.argv[2] in e["CLAUDE_CODE_PLUGIN_DIRS"]' "$RTL_SETTINGS" "$dest" \
  && [ "$(stat -c %a "$RTL_SETTINGS")" = 600 ]; then
  pass "a first install copies the mod, names it in settings and keeps the settings mode"
else
  fail "first install: $(cat "$tmp/out")"
fi

# An older live copy, with the engine's generated declarations beside it
printf '// the old copy\n' >> "$dest/hooks/register.tsx"
printf 'OLD\n' > "$dest/.installed-from"
mkdir -p "$dest/.claude-plugin/types"
printf 'declare const generated: 1\n' > "$dest/.claude-plugin/types/index.d.ts"
cp -a "$dest" "$tmp/snapshot"
sum=$(settings_sum)

check_restored() {
  local name=$1
  shift
  if ! env "$@" "$here/install.sh" >"$tmp/out" 2>&1 && same_live && no_temp \
    && [ "$(cat "$dest/.installed-from")" = OLD ] && [ "$(settings_sum)" = "$sum" ]; then
    pass "$name: the old copy, its marker and its declarations are back; temporary folders gone"
  else
    fail "$name: $(cat "$tmp/out"); $(diff -r "$tmp/snapshot" "$dest" 2>&1 | head -3)"
  fi
}
check_restored "the move fails after its first file" FAKE_RSYNC=fail
check_restored "the move is interrupted (TERM)" FAKE_RSYNC=term
check_restored "the moved copy does not validate" FAKE_BAD_VALIDATE="$dest"

# Putting the previous copy back fails too: it is kept and named, and the next run stops
if ! FAKE_RSYNC=fail-both install && [ -d "$parent/.rtl-prev" ] && [ ! -e "$parent/.rtl-stage" ] \
  && grep -q "it is in $parent/.rtl-prev" "$tmp/out" \
  && diff -r "$tmp/snapshot" "$parent/.rtl-prev" >/dev/null; then
  pass "a failed restore keeps the previous copy in .rtl-prev and says where"
else
  fail "failed restore: $(cat "$tmp/out")"
fi
cp "$dest/hooks/register.tsx" "$tmp/mixed"
if ! install && [ -d "$parent/.rtl-prev" ] && cmp -s "$tmp/mixed" "$dest/hooks/register.tsx" \
  && grep -q "did not finish" "$tmp/out"; then
  pass "a run that finds .rtl-prev changes nothing and says why"
else
  fail "leftover .rtl-prev: $(cat "$tmp/out")"
fi
rm -rf "$parent/.rtl-prev"

# A first install that fails while moving removes the folder it made
rm -rf "$dest"
if ! FAKE_RSYNC=fail install && [ ! -e "$dest" ] && no_temp; then
  pass "a first install that fails removes the new folder"
else
  fail "failed first install: $(cat "$tmp/out")"
fi

[ "$fails" -eq 0 ] || exit 1
