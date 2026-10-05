# Contributing to Claude Code CLI RTL

Thank you for helping. Right-to-left rendering depends on the terminal, the font, the Claude Code
version and the text itself, so the details of your setup matter more than usual.

## Reporting a problem
Open an issue with:
- what you expected and what you saw, with a **screenshot**;
- the **text** that showed the problem, copied from the conversation (not from the screen), so it
  keeps its typed order;
- your **terminal** (name and version), the **font**, and the **operating system**;
- `claude --version`, and your mod settings (`order`, `direction`, `arabic`, `textColor`) if you changed
  them.

## Working on the code
The mod lives in `mod/rtl/`. Everything under `mod/rtl/src/` is pure TypeScript that does not call
Claude Code, so it is tested with plain Node:

```bash
node --test 'mod/rtl/tests/*.spec.ts'    # Node 24 or newer runs the .ts files directly
claude plugin validate mod/rtl           # checks the plugin the way Claude Code loads it
```

To try a change live, start Claude Code with `claude --plugin-dir mod/rtl`. It reloads the mod when
you save a file. To use your clone in every session, `tools/install.sh` runs the tests, copies the
mod to `~/.local/share/claude-code-cli-rtl/rtl` and adds that folder to `CLAUDE_CODE_PLUGIN_DIRS` in
`~/.claude/settings.json` (it keeps a backup of the file). It needs Node 24 or newer, `rsync` and
`python3`. A folder loaded this way replaces a copy
installed from the marketplace, so use one or the other.

Rules the code follows, and that a pull request should keep:
- **Display only.** The mod never changes stored messages, the prompt, or what the model reads.
- **Widths match Claude Code's.** A row wider than its box is wrapped again by the engine and loses
  its alignment. Width changes need a measurement, not only a unit test.
- **No bidi control characters in drawn text.** Claude Code replaces them with U+FFFD. Direction
  is expressed by the order of the cells only.
- **Hebrew stays as it is.** Every change keeps the existing tests passing; a rendering change
  comes with a test for the case it fixes.

## Pull requests
Keep them small and focused, with a short description of what changed and how you checked it (test
output, before/after screenshots for anything visible). Commit messages are imperative and scoped,
for example `layout: keep a quote bar on the right of an RTL quote`.

## Code of conduct
Be kind and patient. Many people here are writing in their second or third language.
