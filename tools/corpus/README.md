# Live-check prompts

Prompts for checking the mod by eye in a real Claude Code session (`claude --plugin-dir mod/rtl`).
Paste one as the prompt; each asks the model to repeat a fixed text, so the result is comparable
from run to run.

- `md2.txt`: the main Markdown corpus (headings, lists, quotes, code, links, niqqud (Hebrew vowel marks), emoji, numbers).
- `md.txt`: an earlier, shorter Markdown corpus.
- `native-md.txt`: English-only Markdown, which Claude Code draws itself (the look the mod copies).
- `softbreak.txt`: soft line breaks inside one paragraph.
- `e1.txt`: cell widths (emoji, niqqud, word boundaries).
