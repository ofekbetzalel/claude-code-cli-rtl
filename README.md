<div align="center">

# Claude Code CLI RTL

**Right-to-left Hebrew, Arabic and Persian in the Claude Code terminal.**

[![Tests](https://github.com/ofekbetzalel/claude-code-cli-rtl/actions/workflows/test.yml/badge.svg)](https://github.com/ofekbetzalel/claude-code-cli-rtl/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757)

</div>

A Claude Code mod that displays Hebrew, Arabic and Persian right-to-left and aligned to the right,
while English words, numbers, file paths and code inside the text stay left-to-right. Without it,
most terminals show this text in reverse order.

<p align="center">
  <a href="assets/hebrew-1.png"><img src="assets/hebrew-1.png" width="32%" alt="Hebrew reply with the mod, part 1: paragraphs, mixed English, numbers and brackets"></a>
  <a href="assets/hebrew-2.png"><img src="assets/hebrew-2.png" width="32%" alt="Hebrew reply with the mod, part 2: lists, a quote, a table and a code block"></a>
  <a href="assets/hebrew-3.png"><img src="assets/hebrew-3.png" width="32%" alt="Hebrew reply with the mod, part 3: formatting, emoji, mixed lines, a long wrapped paragraph, and the mod's recap above the prompt"></a>
</p>

<p align="center">
  <a href="assets/arabic-1.png"><img src="assets/arabic-1.png" width="32%" alt="Arabic reply with the mod, part 1: paragraphs, mixed English, numbers and brackets"></a>
  <a href="assets/arabic-2.png"><img src="assets/arabic-2.png" width="32%" alt="Arabic reply with the mod, part 2: lists, a quote, a table and a code block"></a>
  <a href="assets/arabic-3.png"><img src="assets/arabic-3.png" width="32%" alt="Arabic reply with the mod, part 3: formatting, emoji, mixed lines, a long wrapped paragraph, and the mod's recap above the prompt"></a>
</p>

<p align="center">
  <a href="assets/persian-1.png"><img src="assets/persian-1.png" width="32%" alt="Persian reply with the mod, part 1: paragraphs, mixed English, numbers and brackets"></a>
  <a href="assets/persian-2.png"><img src="assets/persian-2.png" width="32%" alt="Persian reply with the mod, part 2: lists, a quote, a table and a code block"></a>
  <a href="assets/persian-3.png"><img src="assets/persian-3.png" width="32%" alt="Persian reply with the mod, part 3: formatting, emoji, mixed lines, a long wrapped paragraph, and the mod's recap above the prompt"></a>
</p>

<p align="center"><sub>The same reply in Hebrew, Arabic and Persian, shown in Claude Code 2.1.289 with the mod, in Windows
Terminal (default font and colors). The third image in each row shows the mod's recap
(<code>※ recap</code>) above the prompt, with the <code>recap</code> setting on. Click an image to enlarge it. See also
<a href="assets/before.png">the Hebrew reply without the mod</a>, in Windows Terminal.</sub></p>

<p align="center"><a href="#install">Install</a> · <a href="#what-it-fixes">What it fixes</a> · <a href="#seeing-what-you-type">What you type</a> · <a href="#terminal-support">Terminal support</a> · <a href="#settings">Settings</a></p>

## Install

You need Claude Code **2.1.287 or newer** (`claude --version`).

### For humans

Run these two commands in a terminal, then restart Claude Code:

```bash
claude plugin marketplace add ofekbetzalel/claude-code-cli-rtl
claude plugin install rtl@claude-code-cli-rtl
```

**For Arabic and Persian** in any terminal except Windows Terminal, also run `/plugin configure rtl@claude-code-cli-rtl` inside Claude Code and set `arabic` to `forms`.

### For AI agents

Paste this into Claude Code, or any coding agent that can run shell commands:

```text
Install the Claude Code RTL mod for me: https://github.com/ofekbetzalel/claude-code-cli-rtl
```

<details>
<summary><b>Instructions for the agent</b></summary>

If a user asked you to install this mod, follow these steps exactly:

1. Run `claude --version`. It must be 2.1.287 or newer. If it is older, tell the user to run
   `claude update`, and stop the installation.
2. Add the marketplace (safe to run even if it is already added):
   ```bash
   claude plugin marketplace add ofekbetzalel/claude-code-cli-rtl
   claude plugin marketplace update claude-code-cli-rtl
   ```
3. Run `claude plugin list` and look for `rtl@claude-code-cli-rtl`:
   - If it is not listed, run `claude plugin install rtl@claude-code-cli-rtl`.
   - If it is listed, run `claude plugin update rtl@claude-code-cli-rtl`.
   - If it is listed with `Status: ✘ disabled`, also run
     `claude plugin enable rtl@claude-code-cli-rtl`.
4. Run `claude plugin list` again and confirm that `rtl@claude-code-cli-rtl` shows
   `Status: ✔ enabled`. Do not report success before this.
5. Ask the user whether they read Arabic or Persian in a terminal other than Windows Terminal.
   Only if they do, set this option. It does not change their other settings:
   ```bash
   echo '{"arabic":"forms"}' | claude plugin configure rtl@claude-code-cli-rtl --values-stdin
   ```
6. Tell the user to restart Claude Code. The session that is already running will not load the
   mod.

Do not change other settings, clone the repository or install anything else.

</details>

### Update

```bash
claude plugin marketplace update claude-code-cli-rtl
claude plugin update rtl@claude-code-cli-rtl
```

### Uninstall

```bash
claude plugin uninstall rtl@claude-code-cli-rtl
```

Restart Claude Code after updating or removing the mod.

## What it fixes

- **Sentences** read right-to-left and are aligned to the right, even when they start with an
  English word or a file path.
- **Mixed text**: English words, numbers, versions, paths, `inline code` and links stay
  left-to-right inside the sentence.
- **Markdown**: headings, bold and italic text, quotes, bullet and numbered lists (markers on the
  right), and tables (columns run from the right).
- **Code blocks**: Hebrew, Arabic and Persian comments and strings read right-to-left, while the
  code around them stays left-to-right.
- **Lists**: an English item in a Hebrew list stays on the list's side.
- **Emoji and brackets** appear on the correct side of the words around them.
- **Arabic and Persian**: letters join into words, including lam-alef (لا), and Persian words with a
  zero-width non-joiner (می‌خواهم) keep their break. Windows Terminal joins the letters itself; the
  other terminals need `arabic` set to `forms`.
- **Your own messages** in the conversation, and the output of commands such as `/recap`.
- **What you type**: the band above the prompt and the `/rtl-draft` command show your draft
  right-to-left ([see below](#seeing-what-you-type)).

Only the display changes: what you type, the saved conversation and what the model reads stay
exactly as written. The mod does not patch Claude Code, and it does not use the network, except for
the optional `recap`, which asks the session's model for a summary.

## Seeing what you type

Claude Code draws its own input box, and mods cannot redraw it. So the box does not show
right-to-left text correctly ([Limitations](#limitations)). The mod gives you two ways to see what
you type.

**`/rtl-draft`** opens a pane that shows your whole draft right-to-left, with a marker at the
cursor. In Claude Code's fullscreen view, when the terminal is about 110 columns wide or wider, the
pane opens beside the conversation. Otherwise, it opens above the prompt. It opens
immediately, even while Claude is replying. Run `/rtl-draft` again or click ✕ in the pane to close
it.

<p align="center"><a href="assets/draft-pane.png"><img src="assets/draft-pane.png" alt="The /rtl-draft pane on the right shows a draft of three paragraphs, the same text in Hebrew, Arabic and Persian, right-to-left. Claude Code's own input box at the bottom holds the same draft."></a></p>
<p align="center"><sub>A draft of three paragraphs: the same text in Hebrew, Arabic and Persian. On the right, the mod's
pane; at the bottom, Claude Code's own input box.</sub></p>

**The band above the prompt** lets you see what you type right-to-left without opening
`/rtl-draft`. It is on by default (the `preview` setting) and appears whenever your draft contains
right-to-left letters. While the `/rtl-draft` pane is open, the band does not show the draft.

<p align="center"><img src="assets/preview-band.png" alt="The mod's band above the prompt, showing a two-line Hebrew draft right-to-left and aligned right"></p>

## Terminal support

Tested on Windows 11 with Ubuntu in WSL and Claude Code 2.1.289.
[Screenshots from each terminal](docs/terminals.md).

| | Windows Terminal | WezTerm | Konsole&nbsp;¹ | mintty&nbsp;² | Browser (xterm.js) |
| --- | :-: | :-: | :-: | :-: | :-: |
| Hebrew reads right-to-left | ✅ | ✅ | ✅ | ❌ | ✅ |
| Lines aligned right | ✅ | ✅ | ✅ | ✅ | ✅ |
| English and numbers in place | ✅ | ✅ | ✅ | ✅ | ✅ |
| Arabic and Persian letters joined | ✅ | ✅&nbsp;³ | ✅&nbsp;³ | ✅&nbsp;³ | ✅&nbsp;³ |

1. Turn off **Bi-Directional text rendering** in the Konsole profile.
2. wsltty, with mintty's bidi turned off (`-o Bidi=0`). Hebrew letters still come out reversed
   inside each word.
3. With `arabic` set to `forms`.

In Windows Terminal and the VS Code terminal, Claude Code reorders right-to-left text itself. The
mod detects this and draws its lines so that they come out in the right order, so start Claude
Code as usual.

Not tested yet: macOS Terminal, iTerm2, GNOME Terminal and the VS Code terminal itself (the mod's
output for it was checked cell by cell, but not on screen). If right-to-left text looks reversed
with the mod on,
your terminal is probably reordering it a second time: turn off its bidi option if it has one, or
set `order` to `logical`. Reports from other terminals are welcome.

## Settings

Change them inside Claude Code, in `/config` (the mod's rows end in `· rtl`) or with
`/plugin configure rtl@claude-code-cli-rtl`. The names in bold are the ones `/config` shows. The
mod also adds the `/rtl-draft` command ([Seeing what you type](#seeing-what-you-type)).

| Setting | Values | What it does |
| --- | --- | --- |
| **Character order**<br>`order` | `visual` (default), `logical`, `off` | `visual`: the mod puts the text in display order itself, for terminals that do not reorder text. `logical`: only align right, for terminals that reorder text themselves. `off`: Claude Code draws text as usual. |
| **Paragraph direction**<br>`direction` | `rtl-share` (default), `first-strong` | `rtl-share`: a paragraph is right-to-left if its first letter is right-to-left, or if at least 30% of its letters are (inline code not counted). `first-strong`: only the first letter decides (the Unicode rule). |
| **Text color for RTL rows**<br>`textColor` | `#rrggbb`, or empty | The color of right-to-left text. Set it if right-to-left text does not match the color of the rest of the text. |
| **Prompt preview**<br>`preview` | `on` (default), `draft`, `off` | The band above the prompt shows what you type, and Claude Code's dim suggestion, right-to-left while they hold right-to-left letters. `draft`: only what you type. `off`: no band. |
| **Recap band**<br>`recap` | `off` (default), `on` | `on`: after you have been away for about four minutes, the mod shows its own recap above the prompt, right-to-left when the recap is. It asks for the recap in the language of your messages, but the model decides. Turn off Claude Code's own Session recap first (`/config`): while it is on, the band stays hidden and the mod shows a note saying so. Each recap asks the session's model once more, which can take more than one request. |
| **Arabic and Persian letters**<br>`arabic` | `letters` (default), `forms` | `letters`: plain letters, which the terminal joins (Windows Terminal does). `forms`: the mod writes each letter in its joined shape, for the other terminals. Hebrew is not affected. |

## Limitations

- **The input box** is drawn by Claude Code, and mods cannot redraw it. In most terminals,
  right-to-left text in the box appears reversed. In Windows Terminal, Claude Code reorders the
  text itself, but aligns it to the left. The cursor may show in the wrong place, and a wrapped line
  with English words or numbers can be out of order. To see your draft right-to-left, use
  `/rtl-draft` or the band above the prompt ([Seeing what you type](#seeing-what-you-type)). Once
  you send it, your message is drawn right-to-left.
- **The preview band needs room.** Claude Code gives the prompt and the band at most half the
  terminal, so a long draft in a short terminal leaves no room for the band.
- **Replies are redrawn when they finish.** While a reply streams it is shown left-to-right.
- **Tool output and permission dialogs** are drawn by Claude Code as usual.
- **Claude Code's automatic recap** (`※ recap:`) cannot be reached by mods, so it reads backwards.
  Turn it off in `/config` (Session recap) and set the mod's `recap` to `on` to get a right-to-left
  recap instead. The `/recap` command's output is drawn right-to-left.
- **Code lines that hold right-to-left text** keep the colors of their comments and strings, but
  the rest of the line (keywords, names) loses its syntax colors.
- **Copying text from the terminal** gives right-to-left text in its on-screen order, which is
  reversed.
- **Very long replies and Mermaid diagrams** may be drawn by Claude Code as usual, with a dim note
  under the reply that says why.
- **Colors**: the mod needs a terminal with 24-bit color. In browser-based terminals, avoid the
  `dark-ansi` and `light-ansi` themes, which can show right-to-left words reversed.
- **Arabic and Persian in Windows Terminal**: keep `arabic` at `letters`. Its default font has no
  glyphs for the joined shapes that `forms` writes. More about fonts in
  [docs/design/arabic-persian.md](docs/design/arabic-persian.md).

## How it works

Claude Code 2.1.287 added mods: plugins that can replace how parts of the screen are drawn. This
mod redraws replies and messages that contain right-to-left letters. It runs the Unicode
Bidirectional Algorithm on each paragraph, wraps it to the terminal width, and writes every line in
the order it is read, aligned to the right. The details are in
[How it works](docs/design/how-it-works.md).

## Contributing

Bug reports with a screenshot, the text, and your terminal's name help the most. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Includes [bidi-js](https://github.com/lojjic/bidi-js) (MIT).

This is an independent project, not affiliated with Anthropic.
