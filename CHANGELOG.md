# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- The mod (`mod/rtl`): Hebrew right-to-left drawing of completed assistant replies and your own
  messages, with Markdown (headings, lists, quotes, tables, inline code, links), the `rtl-share`
  direction rule, and output that reads right in desktop and browser terminals.
- Settings `order`, `direction` and `textColor`.
- `tools/install.sh`, which installs the mod from a clone for every session.
- Arabic and Persian, with a setting `arabic`:
  - `letters` (default) writes plain letters in display order, which Windows Terminal joins with
    its font; a Persian zero-width non-joiner is placed between the letters it separates;
  - `forms` writes each letter in its joined shape (Unicode presentation forms, lam-alef included),
    for terminals that do not join the letters themselves, such as browser-based terminals,
    WezTerm and Konsole.
  Tatweel, harakat and the Persian letters are supported.
- Code blocks: Hebrew, Arabic and Persian comments and strings read right-to-left, while the code
  around them stays left-to-right. A Perl, Tcl or Make block the mod cannot read safely is drawn by
  Claude Code as usual, and the rest of the reply stays right-to-left.
- The output of slash commands such as `/recap` is drawn right-to-left.
- Lists: an English item in a Hebrew list sits on the list's side, nested items follow the outer
  list, and a code block inside a right-to-left list keeps the list's indent.
- A table in a right-to-left reply runs from the right even when its header row is in English.
- Setting `preview` (`on` by default): a band above the prompt shows what you type, and Claude
  Code's suggestion, right-to-left.
- Setting `recap` (`off` by default): the mod's own right-to-left recap above the prompt, asked
  for in the language of your messages. It needs Claude Code's own Session recap turned off; while
  that is on, the band stays hidden and the mod shows a note saying so. Each recap asks the
  session's model once more.
- Windows Terminal and the VS Code terminal work with Claude Code started as usual. Claude Code
  reorders right-to-left text itself there, so the mod draws its lines in a way that this reorder
  turns into the right order.
- `/rtl-draft`: a pane with the whole draft right-to-left, empty lines included, and a mark at the
  cursor, beside the conversation in a wide terminal and above the prompt in a narrow one.
- A marketplace in the repository:
  `claude plugin marketplace add ofekbetzalel/claude-code-cli-rtl`.
- Design notes: how the mod works, and the Arabic and Persian design.
