# Arabic and Persian

Hebrew needs two things from a terminal: the right order and right alignment. Arabic and Persian
need a third: **contextual shaping**. An Arabic letter takes one of up to four shapes (isolated,
initial, medial, final) depending on whether it connects to its neighbors, and lam followed by
alef becomes a single ligature (لا). This page describes how the mod handles that. Nothing here
changes Hebrew: a paragraph without Arabic-script letters takes the same path, with the same bytes,
as before Arabic support was added.

## The `arabic` setting

Terminals differ in who can join the letters:

- **Windows Terminal (WT)** joins plain Arabic letters itself, even when they are written in display
  order, one color run per letter. Its default font, Cascadia Mono, has the plain letters but none
  of Unicode's Arabic Presentation Forms (the characters that carry a joined shape).
- **Browser-based terminals (xterm.js)** cannot join them. The mod puts every right-to-left letter
  in its own color run, so that the browser does not reorder the line a second time (see
  [how-it-works.md](how-it-works.md)). The browser draws each run on its own, so it does not join
  letters across runs either.

So one output cannot serve both, and for Arabic script only there is a setting:

| `arabic` | Writes | Windows Terminal | xterm.js |
| --- | --- | --- | --- |
| `letters` (default) | plain letters, in display order | joined by the terminal | right order, not joined |
| `forms` | presentation forms, chosen by the mod | letters overlap or go missing | joined |

`letters` is the default because its worst case, unjoined letters in the right order, is still
readable, while the worst case of `forms` is wrong-looking letters. The mod cannot tell which
terminal shows its output: one session can be watched in a desktop terminal and in a browser at once.

## `letters`

The plain letters are written in display order, and the terminal shapes them.

**Joiners.** Persian uses the zero-width non-joiner (ZWNJ, U+200C) inside words such as `می‌خواهم`,
and the zero-width joiner (ZWJ) can force a join. `Intl.Segmenter` puts a joiner inside the cluster
of the letter before it, after the letter's marks. Drawn right to left, it would land next to the
wrong neighbor. So for clusters of Arabic-script letters, `joinersFirst` in `layout.ts` moves the
joiners to the front of the cluster, and the marks stay on their letter. In `می‌خواهم`, the ZWNJ then
sits between `خ` and `ی`.

When the next letter is not on the same row (a wrap at the joiner, or a reply that is still
streaming), or nothing is drawn before the cluster, the joiner is dropped: there is nothing to join
or part from, and xterm.js would store a leading zero-width character in a cell of its own and push
the row's last letter onto the next line. `tools/xterm-harness/cells.mts` checks a set of sample rows
in xterm.js's buffer, in both settings: each row fills exactly its own line.

**Lam-alef in Windows Terminal.** Cascadia Mono's `rlig` feature turns lam + alef into two glyphs,
the alef with zero advance, and Windows Terminal gives each its own cell. Windows Terminal with
Cascadia Mono therefore displays lam-alef across two cells, in this mod's output and in any other
program's. The mod does not write the ligature code points (U+FEF5-FEFC) instead: the font lacks
them, and a shaping terminal treats them as non-joining, which would break the join before a final
lam-alef (`سلام`).

## `forms`

The mod chooses each letter's shape itself and writes it as a presentation form. The code is
`mod/rtl/src/shape.ts`, called from `layoutParagraph` in `mod/rtl/src/layout.ts`.

1. **Shape the logical text.** A paragraph that contains Arabic-script letters is shaped before it
   is wrapped and reordered, so that each letter connects to its neighbors in reading order.
2. **Joining rules come from Unicode.** Each character's Joining_Type comes from
   `ArabicShaping.txt` (Unicode 15.0): dual-joining, right-joining, join-causing (tatweel, ZWJ),
   transparent (harakat and most format characters), or non-joining (ZWNJ, digits, spaces and
   everything else). Joining also stops at a line break and at the edge of inline code.
3. **Missing forms.** A letter with no presentation form for the shape it needs is drawn in its
   closest form (a medial falls back to final, then isolated; an initial to isolated), or unchanged.
   Its neighbors still join towards it.
4. **Lam-alef is one cell.** Lam directly followed by alef (ا آ أ إ) becomes one ligature. They stay
   two joined letters when the lam carries a mark (the ligature would move it over the alef) or when
   lam and alef have different styles.
5. **Direction first.** The paragraph's direction is decided on the logical text, before ligatures
   change the letter count.
6. **Each row is shaped on its own.** The text is shaped once to find the line breaks, then again
   with the start of each row as a joining boundary, so a word broken across two rows does not
   reach from one to the other. The second pass changes only the forms, never the characters
   drawn, so the breaks stay valid.
7. **Joiners** next to an Arabic letter take part in choosing the shapes, and are then left out of
   the displayed text. The saved text keeps them.
8. **Styles follow the source.** Every displayed character maps back to its source character, so
   bold, italic and inline code still apply, even when the style changes in the middle of a word.
9. **Color runs stay.** Each form is still its own color run. Its shape is in the character itself,
   so the browser has nothing left to shape or reorder.
10. **`order: logical` is unchanged.** Terminals that reorder text themselves also shape it, so they
    receive the original characters.

## Tests

- `mod/rtl/tests/shape.spec.ts` covers joining classes, lam-alef with marks and styles, ZWNJ and
  ZWJ, the Persian letters (پ چ ژ گ ک ی), line-break and isolate boundaries, letters without forms,
  hard wraps, the paragraph direction, and a linear-time bound on long runs of marks.
- **Widths.** All 250 presentation forms the shaper can write, and ZWNJ and ZWJ inside and outside a
  cluster, were measured in Claude Code 2.1.288. Each takes the width the mod computes. The
  measurements are in `mod/rtl/tests/fixtures/arabic-widths-2.1.288.json`, and a unit test holds the
  mod to them.
- **Rendering.** A corpus of 53 Arabic and Persian lines (every joining class, lam-alef, harakat and
  shadda, tatweel, ZWNJ words, letter variants, both digit sets with their separators, brackets,
  English words and paths, Hebrew next to Arabic) was rendered in xterm.js 6.1 next to a browser's
  native right-to-left rendering of the same text. With `forms`, words are joined and in the same
  order as the reference, and rows stay on the cell grid in a font with Arabic glyphs. With
  `letters`, sample rows and full Claude Code replies were checked on screenshots of Windows
  Terminal 1.24.
- **Hebrew unchanged.** For 1,150 inputs without Arabic script, the output is byte-identical before
  and after Arabic support, across both orders, every direction setting and five widths.

## Known limitations

- **Windows Terminal with `forms`**: letters overlap or go missing, because its default font has no
  presentation forms. Use `letters` there.
- **Fonts.** Joined letters in a browser terminal need a font with Arabic glyphs, including the
  Persian forms (DejaVu Sans Mono has them; Noto Kufi Arabic does not). Letters the font lacks come
  from another font and may shift the cell grid.
- **Copying with the mouse** copies text in display order, and under `forms` as presentation forms.
  They look right but do not match the original text in a search.
- **Letters added after Unicode 13.0.** The bundled bidi data is Unicode 13.0, which classifies
  letters from the Arabic Extended-B block (U+0870-089F) as generic right-to-left. A number right
  after one of them can be placed on the wrong side. Everyday Arabic and Persian letters are older
  and not affected.
- **Marks U+0898-089F** take a cell each in xterm.js, so a row that holds one wraps there.
- **Letters without presentation forms** (used by some other languages written in Arabic script)
  may look unjoined under `forms`.

## Not tested yet

Other terminals that shape text (WezTerm, kitty, iTerm2, macOS Terminal), VTE terminals with
`order: logical`, and fonts with presentation forms in Windows Terminal.
