# How the mod works

This page explains the design and the reasons behind it, for contributors and for anyone who
wants to know why the output looks the way it does. Arabic and Persian shaping has its own page:
[arabic-persian.md](arabic-persian.md).

## The hook
Claude Code 2.1.287 added mods: plugins with a hooks module that runs in an isolated environment
inside Claude Code (no Node, no DOM, no network) and can replace how a part of the screen is drawn.
The mod hooks three parts of the conversation (`ui.render` on `AssistantMessage`, `UserMessage`
and `CommandOutput`):

- An **assistant reply** that holds right-to-left (RTL) letters is laid out by the mod. A reply
  without RTL letters goes to Claude Code untouched.
- **Your own messages** (typed in the prompt, or sent from another device through Claude Code's Remote Control) are laid out the same
  way. Messages from other agents and collapsed rows keep Claude Code's drawing.
- A **slash command's output** that holds RTL letters, such as the summary `/recap` prints, is laid
  out the same way under the command's `⎿`. Error rows keep Claude Code's drawing.

The session recap Claude Code adds by itself when you come back after a while (`※ recap:`) cannot be
drawn by a mod: Claude Code 2.1.289 draws that row without a `ui.render` hook. Its RTL text
therefore appears in typed order, which reads backwards in a terminal without bidi. Running
`/recap` gives the same summary as command output, which the mod draws. The setting `recap` offers
a stand-in, the recap band ([below](#the-recap-band)).

Only the drawing changes. The mod never writes to the stored conversation, the prompt, or what is
sent to the model.

## One output for two kinds of terminal
Terminals disagree about bidi. Most desktop terminals (Windows Terminal among them) draw cells in
the order they receive them and do no bidi at all. Browser terminals built on xterm.js draw runs of
cells as HTML, and the browser applies bidi again inside each run. The mod produces one byte stream
that reads right in both, without detecting which terminal it is in. (Arabic and Persian add one
choice, the `arabic` setting, because Windows Terminal and browser terminals need their letters
written differently: see [arabic-persian.md](arabic-persian.md).)

1. **Visual order.** Each line is written in the order it is read on screen, aligned right, so a
   terminal without bidi shows it correctly as is.
2. **One RTL letter per color run.** xterm.js's DOM renderer draws each run of cells with equal
   attributes as its own inline block, and the browser runs bidi inside each block. A block that
   holds a single RTL letter has nothing to reorder. So a new run starts:
   - before an RTL letter, when the run already holds an RTL letter or a number;
   - before a European number, when the run holds an RTL letter;
   - before an Arabic-Indic number, when the run holds an RTL letter or a separate Arabic-Indic
     number.

   Adjacent runs alternate between two colors one unit apart per channel (for example
   `#ffffff` and `#fefefe`), which the eye cannot tell apart. A desktop terminal ignores the split.
   The tests merge runs exactly as xterm.js does and check every run under a left-to-right bidi
   pass, over 4,000 random mixed rows.

For terminals that apply bidi to whole lines themselves (VTE terminals such as GNOME Terminal,
Konsole, mlterm), the `logical` setting keeps the typed order and only aligns right.

**Where Claude Code reorders text itself.** When `WT_SESSION` is set (Windows Terminal) or
`TERM_PROGRAM` is `vscode`, Claude Code 2.1.289 reorders RTL text before it writes the cells
(`isNeeded()` in its renderer). Measured: each `Text` it draws is reordered on its own, in place,
its nested `Text`s with it and sibling `Text`s apart, by UAX #9 with a first-strong base and
without mirroring. The mod reads the same two variables at the session's start. There, each row is
drawn as sibling `Text`s of one direction each, holding the text that this reorder turns back into
the row (`engineSegments` in `src/bidi.ts`): a run of one direction is its own inverse under it,
and a run that is not, a rare case, is drawn one cluster per `Text`. The cells come out as in any
other terminal, and the same build works with and without these variables (herdr, for one, does
not pass `WT_SESSION` to its panes). Claude Code's own drawing, the prompt box included, keeps its
reorder: there the box reads in the right order, aligned left, with brackets unmirrored.

## The layout
For each paragraph:
1. **Direction.** `rtl-share` (the default): a paragraph is RTL when its first letter with a
   direction is RTL (the Unicode rule, UAX #9 P2/P3), or when at least 30% of its letters outside
   inline code are RTL. So a Hebrew sentence that starts with a file name still reads right-to-left.
   `first-strong` keeps the Unicode rule alone.
2. **Levels.** The Unicode Bidirectional Algorithm resolves embedding levels on the whole paragraph,
   before wrapping, with the vendored [bidi-js](https://github.com/lojjic/bidi-js) 1.1.0 (Unicode
   13.0 data). Inline code is an LTR isolate, so a path or a flag keeps its own order.
3. **Tokens stay whole.** UAX #9 alone moves a neutral character that touches a Latin token to the
   far side of it inside RTL text: `src/` would read `/src`, `--dry-run` would read `dry-run--`. So a
   run of punctuation attached to a Latin letter or digit, with no space between them, is resolved
   as part of the token. Sentence punctuation at a token's end and brackets stay neutral.
4. **Wrapping.** Lines break at word boundaries by terminal cell width; an overlong word is broken
   between grapheme clusters, never inside one, and nothing is truncated.
5. **Reordering.** Each line is reordered on its own (rules L1, L2 and L4 of UAX #9) on whole
   grapheme clusters, so niqqud stays on its letter and emoji sequences stay whole. bidi-js's own
   line API is not used: it applies L1 with paragraph-absolute positions on a line slice, and
   reorders UTF-16 code units.

## Widths
A row wider than its box is wrapped a second time by Claude Code's layout engine and loses its
alignment. So the mod measures text exactly as Claude Code does (Bun's `stringWidth` with ambiguous
characters narrow), per grapheme cluster. The table in `src/width.ts` was checked cell by cell
against a live Claude Code 2.1.288 (`tests/fixtures/ink-widths-2.1.288.json`, 699 strings).

## Characters that are not drawn
Claude Code replaces bidi control characters (U+061C, U+202A-202E, U+2066-2069) in drawn text with
U+FFFD and removes U+200F. The mod therefore never draws them: direction is expressed only by the
order of the cells and the padding. Controls in the source still take part in resolving levels.
Format characters standing alone (zero-width space, soft hyphen, BOM) take zero cells.

## Looking native
The mod's rows copy what Claude Code 2.1.288 prints for the same Markdown: `-` for every bullet,
`1.` / `a.` / `i.` by depth, quotes as a dim bar with italic text, bold-italic-underlined level-1
headings, links as `text (url)`, `---` for a rule. On an RTL row the decorations that sit at the
start of a line move to the right: the reply bullet `●`, list markers (`.1`), and the quote bar.

Blocks without RTL text inside an RTL reply are handed to Claude Code's own `Markdown` element, and
code blocks to its `Code` element, so they look exactly as usual.

**Lists** keep all their items on one side. The outermost list decides that side for itself and
every list nested in it. It goes by its own prose (code spans and link targets do not count), or by
the reply's when it has none. Each paragraph still keeps its own direction. So an English item in a
Hebrew list reads left-to-right but sits under its siblings, aligned right, with its marker on the
right. A code block in a right-to-left list starts at the left margin, and the list's markers stay
free on the right.

**Tables** with RTL text are drawn by the mod the way Claude Code draws tables (the same column
widths, borders and wrapping). A table is RTL when its header row reads right-to-left. Otherwise it
takes the direction of the reply's prose, so that in an Arabic reply a table comparing `git merge`
with `git rebase` still runs from the right; a reply that is only tables uses the whole table's text.
Code spans, link destinations and code blocks do not count. An RTL table runs its columns from the right, and Markdown alignment is
read as start and end rather than left and right.

**Code blocks** stay with Claude Code's `Code` element, except for their lines that hold RTL text.
`Code` writes a line in logical order, so a Hebrew comment would read backwards in a terminal without
bidi, and a browser terminal reverses each highlighted token again. The mod draws those lines
itself, as a code editor with bidi support shows them: the line stays left-to-right and
left-aligned at the block's indent, and its RTL pieces are reordered in place.
- **Pieces.** A small scanner per language family finds comments and strings (`#`, `//`, `/* */`,
  `--`, `<!-- -->`, `;`, `%`; `"`, `'`, `` ` ``, `"""`). A comment's text, a string's content, and in
  plain code a run of RTL words are each laid out as a paragraph of their own, in the direction the
  reply's setting gives them (`rtl-share` by default). Without that, the bidi algorithm would mix the
  two sides of a quote or a comma: `x = "שלום"  # הערה` would read `x = "הרעה #  "םולש`.
- **Runs.** In program code a run of RTL words continues across spaces only, so `f(שם, גיל)` keeps
  its arguments in order. In data and markup (YAML, TOML, INI, HTML, XML) it continues across
  punctuation and numbers, and takes its closing punctuation, as a sentence does. Text fences
  (untagged, `text`, `markdown`, `output`, `csv`) lay out each line as one paragraph.
- **A conservative scanner.** What it cannot place stays code, in place. A quote without its
  closing quote on the same line is a plain character (a Rust lifetime `'a`, a Hebrew gershayim in
  `צה"ל`); in Rust and the C family `'` opens a character literal only; a JavaScript regular
  expression such as `/["#]/g` is taken whole; in HTML and XML, quotes count only inside a tag.
- **Escapes and interpolations.** Inside a string, an escape (`\"`, `\n`) and an interpolation
  (`${…}` in JavaScript templates and shell strings, `{…}` in Python f-strings and C# `$"…"`,
  `#{…}` in Ruby, `\(…)` in Swift) are kept whole, in their own order, as left-to-right pieces of the
  string; an interpolated expression is laid out like any code. So `` `שלום ${foo(שם, גיל)} עולם` ``
  shows `` `םלוע ${foo(םש, ליג)} םולש` ``.
- **Identifiers.** A word keeps its zero-width joiners and non-joiners, so a Persian identifier such
  as `کتاب‌ها` stays one word.
- **Multi-line comments and strings.** A line inside one that a drawn line opened is drawn too: a
  `Code` leaf starting there would not know it is inside a comment.
- **Wrapping and tabs.** A long line wraps at the block's width like prose, and each row's piece of
  a comment or string is reordered on its own. Tabs follow what `Code` does in a mod's tree (measured
  on 2.1.289): a tab in the leading indentation is 2 spaces, and a later tab advances to the next
  multiple of 8 from the start of the line.
- **Colors.** The mod has no highlighter. Its lines show comments in green and strings in red,
  the colors Claude Code's highlighter gives them, and everything else in the theme's text color, so
  keywords, function names and numbers lose their color on those lines: a fence with RTL text does
  not keep full syntax highlighting. The colors are the truecolor values Claude Code writes
  for `green` and `red` rather than the terminal's own palette, because the color runs below need
  two colors one unit apart.
- **Where it cannot be sure.** Some fences are left whole to `Code`, as Claude Code draws them,
  while the rest of the reply is still drawn by the mod: an interpolation that goes on past its line,
  a line too narrow for one of its characters, and in Perl, Tcl and Make any fence with RTL text that
  holds something that changes where `#` starts a comment. In Perl: a regex or division, a
  quote-like operator (`q{…}`, `qr/…/`, `s{…}{…}`, `q#…#`), a string that interpolates (`"…$x…"`),
  a heredoc or POD. In Tcl: a brace, a quote or a backslash, or a comment that ends in a backslash
  (it goes on into the next line). In Make: an expansion (`$(…)`), a quote outside a recipe or one
  left open in it, a backslash or a backtick in a recipe outside single quotes (a quote inside the
  other kind is a letter), an inline recipe, a line indented with spaces (a recipe whose tab
  Markdown expanded), a custom recipe prefix, `.ONESHELL`, `define` or a continued line. In such a
  fence even a line that starts with `#` is not drawn, as it may sit inside a literal, or close one
  and go on as code.
- Lines without RTL text, English-only code blocks, and every code block under `order: logical` are
  drawn by `Code` as before.

## When the mod steps back
Claude Code refuses to draw a render tree larger than 20,000 nodes or 100,000 characters. The mod plans the final
drawing against those limits, first with the color runs and then without them. When a message
cannot be drawn right-to-left, Claude Code draws it and a dim line under it says why:

- `rtl: a mermaid diagram, drawn as Claude Code draws it`
- `rtl: too narrow or too long to draw right-to-left`
- `rtl: too long to draw right-to-left`
- `rtl: too long to isolate; a browser terminal may reverse its words` (drawn, but without the
  color runs)

## The prompt preview
Claude Code's prompt box shows what you type in logical order, and so does the dim suggestion it
offers after a reply (Tab or the right arrow takes it). In a terminal without bidi, RTL text there
reads backwards, and a mod cannot redraw the box. With the setting `preview` (`on` by default), the
band above the prompt shows the same text laid out by the mod while it holds RTL letters:

- **The draft**, marked `✎`: each line a paragraph of its own, right-aligned when it is RTL,
  wrapped to the band's width, the last 8 rows when it is longer (`…` marks the cut). A draft over
  4,000 characters gets one dim row that says it is too long to preview. It follows every edit the
  mod sees (`prompt.edit`), and is read from the box each time the band is drawn. It is the box's
  text as Claude Code holds it (a slash command, a shell command, a pasted-text placeholder), not
  what will be sent to the model.
- **The suggestion**, marked `»`, dim italic as Claude Code draws it, while the box is empty. The
  mod sees it through the `prompt.suggest` hook, as Claude Code is about to show it, and never
  changes it: Tab must insert what Claude Code proposed. As Claude Code does, the band shows it
  again whenever an edit empties the box (typing then deleting, Ctrl+U, even after Tab took it).
  `preview: draft` shows the draft alone, never the suggestion.
- **Changes no event reports.** Some changes of the box reach no hook: Tab taking the suggestion,
  a prompt recalled from history, an outside editor. The hint line under the prompt is drawn again
  when the box turns from empty to holding text or back; the band is redrawn then and reads the box.
  While the box holds text, the band also reads it every 400 ms, so a later step through history
  shows within that time.
- **Gone** at the next prompt, a new turn (the suggestion) or a new session, and when the box no
  longer holds RTL letters. Claude Code drops its suggestion when the box is sent, a slash command
  too (it raises no `prompt.submit`). The mod cannot see a send as such: a box that empties with no
  edit to empty it is taken as sent, and the band drops the suggestion then. While Claude Code
  works, the band shows a draft typed meanwhile, never a suggestion.
- **What the mod cannot see.** There is no event when the suggestion leaves the box, and no way to
  read whether it is still there: the band shows the suggestion it saw offered, by the rules above,
  observed on Claude Code 2.1.289, and can differ from the box on a path not observed. Going back
  down through history to an empty box brings Claude Code's suggestion back, but the mod cannot
  tell that from a sent box, so the band leaves it out until the next one. The mark is not the Tab
  key for this reason. Another plugin that rewrites the suggestion after this mod's hook would
  change what the box shows but not the band.
- **The draft pane.** `/rtl-draft` opens a pane beside the transcript (fullscreen, from 110
  columns; above the prompt otherwise) with the whole draft laid out the same way and a bar where
  the cursor stands. The bar is a neutral character put into the text at the cursor, so it lands
  where UAX #9 puts that spot; it is a run of its own style, so a `│` typed in the draft stays text.
  The keys stay in the box, and the pane follows every edit and cursor move, and the changes no
  event reports (below), for any text. While Claude Code shows the pane, placed, the band leaves the
  draft to it, so the draft is not shown twice. `/rtl-draft` again, or the pane's close mark,
  closes it.
- Only the drawing changes: the box, the suggestion and the prompt that is sent are Claude Code's.
  Under `order: logical` the terminal shows the box right by itself, and there is no preview. With
  the recap band on, the preview comes first; the recap is shown above it only when both fit.
  Claude Code gives the band and the prompt together at most half the terminal's rows, so a tall
  draft in a short terminal can leave the band no room: then neither is shown.

## The recap band
The setting `recap` (`off` by default) turns on a stand-in for Claude Code's automatic recap,
which a mod cannot draw. It works only while Claude Code's own recap is off (`/config`, *Session
recap*), so the two do not both make recaps. While both are on, the mod says so in a short note at
the start of a session and when either setting changes. It is close to the native recap, not the
same.

- **When.** About a minute after a reply ends, Claude Code tells hooks that it is waiting for
  input (its `idle_prompt` notification). It sends that once per reply, and only when the reply,
  the background agents it tracks, dialogs and scheduled wake-ups are all done and no key was
  pressed since. The band waits three minutes more, as long as Claude Code's own recap waits by
  default, and then asks for the summary. As with the native recap, the first comes after three of
  your prompts and the next after two more.
- **What cancels it.** Anything the mod can see: a key pressed in the prompt (an edit or a cursor
  move), a sent prompt (from anywhere, even one a hook drops), a new turn, a new or ended session,
  the band turned off or the native recap turned on. Just before it asks, and again when the answer
  comes, the mod checks that the prompt is empty, no agent is running and the native recap is off;
  an answer that comes after any of these is dropped. Only prompts you sent that entered the
  conversation count toward the three and the two.
  Scrolling the conversation is not visible to mods, so it does not cancel a waiting recap. Neither
  does background work that Claude Code does not track (a background shell command, an MCP task, a
  monitor).
- **What it asks.** The native recap's own instruction, word for word, and one sentence more: to
  write in the language of your own messages (without it, a recap of an Arabic or Persian
  conversation often came in English). One more model operation on the session's model with the conversation so far (`$.model.fork`, no tools, nothing stored).
  That operation may make more than one request (the fork allows two model turns; the native recap
  makes one). The conversation is sent again: it is read from the prompt cache when the cache still
  holds it, which the mod cannot check, and billed as fresh input when it does not. There is no
  fixed price. A request that has started cannot be stopped, so a recap that arrives after you
  came back is dropped, and its usage is still charged.
- **Where.** Above the prompt: `※`, a bold dim `recap:` and the summary in dim italic (dim only in
  Arabic script, where a slanted letter can read as another), laid out by the mod, right to left
  when the summary is. The summary is cut at 400 characters, as the native one is. The first three
  have `(turn off: /config, Recap band)`, the row `/config` lists, on a row of its own on the
  summary's side.
  The next prompt, or a new turn, clears the band, and it steps back while Claude Code works. The
  counts behind the first three and the prompts rule are kept in the session (`$.state`), so a
  reload of the mod keeps them (no recap is made until they are read back); `/clear` or a resume
  starts them over. After any of these, no recap comes before a turn ends.
- **How it differs from the native recap.** Claude Code's own recap is made only while the
  terminal window is out of focus, and is kept in the conversation. A mod cannot see the window's
  focus, so the band comes after the idle time even if you never left. The native recap also
  checks how old the prompt cache is, rate limits, background work and loops, and a recap the
  model already wrote itself; the mod sees only part of that (running agents) and none of the rest.
  Its fork is cancelled and billed differently, as above. It is drawn above the prompt and never
  stored, so it is gone after the next prompt and after a resume.

## Colors
Rows that hold RTL text are drawn in the theme's text color (white on dark themes, black on light
ones) so that the two run colors can be one unit apart; `textColor` overrides it for a terminal
whose default text color is different. Your own messages keep the default text color and alternate
their background instead. The `dark-ansi` and `light-ansi` themes have no colors one unit apart and
get no color runs. The `auto` theme is drawn with the dark palette, because a mod cannot read
which way it resolved.
