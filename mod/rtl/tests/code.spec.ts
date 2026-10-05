import { test } from 'node:test'
import assert from 'node:assert/strict'

import { COMMENT, STRING } from '../src/code.ts'
import { isolateRow, paletteFor, pieceProps, propsKey } from '../src/isolate.ts'
import { BULLET, modelAssistant, type RowModel, type Settings } from '../src/render.ts'
import { textWidth } from '../src/width.ts'

const S: Settings = { mode: 'visual', base: 'rtl-share', share: 0.3 }
const rows = (text: string, columns = 80, s = S) => {
  const m = modelAssistant(text, columns, true, s)
  assert.ok(m !== null)
  return m.rows
}
// a text row as drawn (LTR: prefix, then the spans), a code leaf as <code>
const show = (r: RowModel) => (r.kind === 'text' ? [...r.lead, ...r.spans].map(s => s.text).join('') : r.kind === 'code' ? `<code>${r.source}` : `<${r.kind}>`)
// the spans of a text row with their styles, the prefix left out
const styled = (r: RowModel) => (r.kind === 'text' ? r.spans.map(s => [s.text, s.style]) : null)
const fence = (lang: string, ...lines: string[]) => '```' + lang + '\n' + lines.join('\n') + '\n```'

test('a Hebrew comment and string in Python: those lines drawn LTR in visual order, the rest left to Code', () => {
  const r = rows('הנה:\n\n' + fence('python', 'def hello():', '    # הערה בעברית', '    print("שלום עולם")', '    return 42'))
  assert.deepEqual(r.slice(2).map(show), ['<code>def hello():', '      # תירבעב הרעה', '      print("םלוע םולש")', '<code>    return 42'])
  assert.deepEqual(styled(r[3]), [['    ', 0], ['# תירבעב הרעה', COMMENT]])
  assert.deepEqual(styled(r[4]), [['    print(', 0], ['"םלוע םולש"', STRING], [')', 0]])
  for (const x of r.slice(2)) {
    if (x.kind === 'code') assert.deepEqual([x.indent, x.bullet, x.language], [2, false, 'python'])
    else assert.ok(x.kind === 'text' && !x.rtl && x.paint)
  }
})

test('an Arabic string literal and comment', () => {
  const r = rows(fence('python', 'x = "مرحبا بالعالم"  # تعليق'))
  assert.deepEqual(r.map(show), ['● x = "ملاعلاب ابحرم"  # قيلعت'])
  assert.deepEqual(styled(r[0]), [['x = ', 0], ['"ملاعلاب ابحرم"', STRING], ['  ', 0], ['# قيلعت', COMMENT]])
  assert.ok(r[0].kind === 'text' && r[0].lead[0].style === BULLET)
})

test('a mixed line: English identifiers keep their places, each RTL piece reads on its own', () => {
  const r = rows(fence('python', 'value = compute(שם, 42)  # מחשב את הערך', 'print(f"שלום {name}")', 'msg = "Hello שלום"', 'log("cannot open file קובץ")'))
  // a string takes its direction by the reply's rule (rtl-share): "Hello שלום" is 4/9 RTL, the
  // last one 4/18
  assert.deepEqual(r.map(show), ['● value = compute(םש, 42)  # ךרעה תא בשחמ', '  print(f"{name} םולש")', '  msg = "םולש Hello"', '  log("cannot open file ץבוק")'])
})

test('an English-only fence is the same Code leaf as before, in an RTL reply and on its own', () => {
  const src = 'def f(x):\n    return "text" + str(42)  # note'
  const r = rows('שלום\n\n' + fence('python', src))
  assert.deepEqual(r[2], { kind: 'code', language: 'python', source: src, indent: 2, bullet: false })
  const first = rows('```js\nlet a = 1\n```\n\nשלום')
  assert.deepEqual(first[0], { kind: 'code', language: 'js', source: 'let a = 1', indent: 2, bullet: true })
})

test('a fence inside an RTL list: at the margin, the list prefix kept free on the right', () => {
  const r = rows('1. שלב ראשון:\n   ```bash\n   echo "שלום"  # מדפיס\n   ls -la\n   ```\n2. שני')
  const code = r.filter(x => x.kind === 'code' || (x.kind === 'text' && !x.rtl))
  assert.deepEqual(code.map(show), ['  echo "םולש"  # סיפדמ', '<code>ls -la'])
  assert.ok(code[1].kind === 'code' && code[1].indent === 2 && code[1].inset === 5)
})

test('logical order keeps every fence in Code', () => {
  const r = rows(fence('python', 'x = "שלום"  # הערה'), 80, { ...S, mode: 'logical' })
  assert.deepEqual(r, [{ kind: 'code', language: 'python', source: 'x = "שלום"  # הערה', indent: 2, bullet: true }])
})

test('a multi-line comment or string stays with the rows drawn here until it closes', () => {
  const js = rows(fence('js', 'a()', '/* הערה', '   more */', 'b()'))
  assert.deepEqual(js.map(show), ['<code>a()', '  /* הרעה', '     more */', '<code>b()'])
  assert.ok(js[2].kind === 'text' && js[2].spans.every(s => s.style === COMMENT))
  const py = rows(fence('python', '"""', 'תיעוד', 'docs', '"""', 'x = 1'))
  assert.deepEqual(py.map(show), ['<code>"""', '  דועית', '  docs', '  """', '<code>x = 1'])
  assert.ok(py.slice(1, 4).every(x => x.kind === 'text' && x.spans.every(s => s.style === STRING)))
})

test('a long line wraps at the fence width; each row of a comment reads on its own', () => {
  // 23 cells, 21 after the indent; a leading tab is 2 spaces, as in Code
  const r = rows(fence('python', 'if x:', '\t# הערה ארוכה מאוד שצריכה לעבור שורה'), 24)
  const drawn = r.filter(x => x.kind === 'text').map(show)
  assert.deepEqual(drawn, ['    # דואמ הכורא הרעה', '  הרוש רובעל הכירצש'])
  for (const t of drawn) assert.ok(textWidth(t) <= 23)
})

test('text fences and data formats: a run of RTL words, its punctuation and numbers, is one piece', () => {
  assert.deepEqual(rows(fence('', 'שורה בעברית עם English באמצע.')).map(show), ['● .עצמאב English םע תירבעב הרוש'])
  assert.deepEqual(rows(fence('yaml', 'title: כותרת בעברית, גרסה 2')).map(show), ['● title: 2 הסרג ,תירבעב תרתוכ'])
  assert.deepEqual(rows(fence('html', '<p class="x">שלום עולם, מה נשמע?</p>')).map(show), ['● <p class="x">?עמשנ המ ,םלוע םולש</p>'])
  // program code: across spaces only, so arguments keep their order
  assert.deepEqual(rows(fence('python', 'f(שם, גיל)')).map(show), ['● f(םש, ליג)'])
})

test('comment syntax follows the language', () => {
  assert.deepEqual(styled(rows(fence('sql', "SELECT 1 -- הערה"))[0]), [['SELECT 1 ', 0], ['-- הרעה', COMMENT]])
  // `#` inside a word is not a comment in a shell
  assert.deepEqual(styled(rows(fence('sh', 'echo $# שם'))[0]), [['echo $# םש', 0]])
  assert.deepEqual(styled(rows(fence('html', '<!-- הערה -->'))[0]), [['<!-- הרעה -->', COMMENT]])
})

test('code rows are isolated like prose: one RTL letter per piece, comments and strings in their colors', () => {
  const r = rows(fence('python', 'x = "שלום"  # הערה'))[0]
  assert.ok(r.kind === 'text')
  const palette = paletteFor('dark')!
  const pieces = isolateRow([...r.lead, ...r.spans], (style, tick) => propsKey(pieceProps(style, tick, palette)))
  assert.ok(pieces.every(p => [...p.text].filter(c => /[א-ת]/.test(c)).length <= 1))
  assert.equal(pieceProps(COMMENT, false, palette).color, '#46a758')
  assert.equal(pieceProps(STRING, false, palette).color, '#e5484d')
  assert.notEqual(pieceProps(COMMENT, true, palette).color, '#46a758')
})

test('tabs as Code draws them: 2 spaces each in the indentation, stops of 8 after text', () => {
  const r = rows(fence('python', '\tprint("hello")', '\t\tprint("שלום")', 'x\t= "שלום"', '\tB\t= "שלום"'))
  assert.deepEqual(r.map(show), ['<code>\tprint("hello")', '      print("םולש")', '  x       = "םולש"', '    B     = "םולש"'])
  // in a list the Markdown parser has already turned the tab into spaces, for both kinds of line
  const listed = rows('- א\n\n  ```python\n  \tprint("hi")\n  \tprint("שלום")\n  ```').slice(2)
  assert.deepEqual(listed.map(show), ['<code>    print("hi")', '      print("םולש")'])
})

test('a quote without its closing quote is code: Rust lifetimes, HTML text, JavaScript regexes', () => {
  assert.deepEqual(rows(fence('rust', "let x: &'a str; // זוהי הערה ארוכה בעברית")).map(show), ["● let x: &'a str; // תירבעב הכורא הרעה יהוז"])
  assert.deepEqual(rows(fence('rust', "let c = 'ש'; // תו")).map(show), ["● let c = 'ש'; // ות"])
  assert.deepEqual(rows(fence('js', 'const pattern = /["#]/g; // הערה חשובה מאוד בעברית')).map(show), ['● const pattern = /["#]/g; // תירבעב דואמ הבושח הרעה'])
  assert.deepEqual(rows(fence('js', 'const half = a / 2 // חצי')).map(show), ['● const half = a / 2 // יצח'])
  assert.deepEqual(rows(fence('html', '<p>ברוכים הבאים לצה"ל היום</p>')).map(show), ['● <p>םויה ל"הצל םיאבה םיכורב</p>'])
  assert.deepEqual(rows(fence('html', '<a title="קישור">דף</a>')).map(show), ['● <a title="רושיק">ףד</a>'])
  assert.deepEqual(rows(fence('python', 'print("שלום)  # לא נסגר')).map(show), ['● print("םולש)  # רגסנ אל'])
})

test('escapes and interpolations keep their order inside a string', () => {
  assert.deepEqual(rows(fence('js', 'const s = `שלום ${foo(שם, גיל)} עולם`;')).map(show), ['● const s = `םלוע ${foo(םש, ליג)} םולש`;'])
  assert.deepEqual(rows(fence('python', 'msg = "צה\\"ל שלום"')).map(show), ['● msg = "םולש ל\\"הצ"'])
  // a literal brace pair is text of the string; around an LTR word it keeps its glyphs (UAX #9 N0)
  assert.deepEqual(rows(fence('python', 'print(f"שלום {name} {{x}}")')).map(show), ['● print(f"{{x}} {name} םולש")'])
  assert.deepEqual(rows(fence('python', 'print("שלום {name}")')).map(show), ['● print("{name} םולש")'])
  assert.deepEqual(rows(fence('sh', 'echo "שלום ${USER} \\n"')).map(show), ['● echo "\\n ${USER} םולש"'])
  const r = rows(fence('js', 'const s = `שלום ${"עולם"}`'))[0]
  assert.ok(r.kind === 'text' && r.spans.some(sp => sp.text.includes('םלוע') && sp.style === STRING))
})

test('a Persian identifier keeps its ZWNJ and its order', () => {
  assert.deepEqual(rows(fence('js', 'const کتاب\u200cها = 1;')).map(show), ['● const اه\u200cباتک = 1;'])
  assert.deepEqual(rows(fence('yaml', 'title: می\u200cخواهم')).map(show), ['● title: مهاوخ\u200cیم'])
})

test('a wide grapheme in an atom stays whole and every row fits its box', () => {
  for (const g of ['界', '😀']) {
    const src = 'const x = `שלום ${"' + 'a'.repeat(54) + g + '"}`;'
    const rs = rows(fence('js', src), 61)
    assert.ok(rs.every(r => textWidth(show(r)) <= 60), rs.map(show).join('\n'))
    assert.ok(rs.map(show).join('').includes(g))
  }
  const tiny = modelAssistant(fence('js', 'x = `ש ${"😀"}`'), 7, true, S)
  assert.ok(tiny === null || tiny.rows.every(r => textWidth(show(r)) <= 6))
})

test('atoms never delete source text: private-use characters and too many escapes', () => {
  const pua = String.fromCodePoint(0x100000)
  assert.ok(rows(fence('js', 'const x = "שלום ' + pua + '";'))[0] !== undefined)
  assert.ok(show(rows(fence('js', 'const x = "שלום ' + pua + '";'))[0]).includes(pua))
  assert.ok(show(rows(fence('js', '// שלום ' + String.fromCodePoint(0x100001)))[0]).includes(String.fromCodePoint(0x100001)))
  const src = 'const s = "שלום ' + String.raw`\n`.repeat(70000) + '";'
  const m = modelAssistant(fence('js', src), 80, true, S)
  if (m !== null) assert.equal(m.rows.map(show).join('').split(String.raw`\n`).length - 1, 70000)
})

test('JavaScript regexes: the closing slash, and a regex after a control header', () => {
  assert.deepEqual(rows(fence('js', 'const re = /a+/; const x = "שלום user עולם"; // fin')).map(show), ['● const re = /a+/; const x = "םלוע user םולש"; // fin'])
  assert.deepEqual(rows(fence('js', 'if (ok) /["#]/g.test("שלום user עולם");')).map(show), ['● if (ok) /["#]/g.test("םלוע user םולש");'])
  assert.deepEqual(rows(fence('js', 'const y = f(a) / 2; // חצי')).map(show), ['● const y = f(a) / 2; // יצח'])
})

test('a Python comment needs no space before #; the shell keeps $#', () => {
  assert.deepEqual(rows(fence('python', 'x=1#שלום hello חבר')).map(show), ['● x=1#רבח hello םולש'])
  assert.deepEqual(rows(fence('sh', 'echo $# שלום')).map(show), ['● echo $# םולש'])
})

test('T10 follow-up: regex context from code only, interpolation ends, PUA with atoms, # after separators', () => {
  const want = '"םלוע user םולש"'
  for (const head of ['while (ok)', 'for (; ok;)', 'if (f(")"))', 'if (f("("))', 'if (f(/* ) */x))']) {
    const out = show(rows(fence('js', head + ' /["#]/g.test("שלום user עולם");'))[0])
    assert.ok(out.includes(want), out)
  }
  assert.ok(show(rows(fence('js', 'function f(){return /* c */ /["#]/g.test("שלום user עולם");}'))[0]).includes(want))
  assert.ok(show(rows(fence('js', 'const v = x++ / a["שלום user עולם"] / b;'))[0]).includes(want))
  const cont = rows(fence('js', 'const q = total', ' / a["שלום user עולם"] / divisor;')).map(show)
  assert.ok(cont.some(r => r.includes(want)), cont.join('\n'))
  // an interpolation whose end cannot be told safely is never drawn corrupted
  for (const src of ['const q = `שלום ${/[}]/.test(x)} עולם`;', 'const q = `שלום ${foo(/* } */ x)} עולם`;']) {
    const m = modelAssistant(fence('js', src), 80, true, S)
    assert.ok(m === null || m.rows.every(r => r.kind !== 'text' || !show(r).includes('{/.test') && !show(r).includes('/*}')), src)
  }
  const pua = String.fromCodePoint(0x100000)
  for (const src of ['const s = `שלום ${foo(שם, גיל)} עולם`; // ' + pua, 'const s = "צה\\"ל שלום"; // ' + pua]) {
    const m = modelAssistant(fence('js', src), 80, true, S)
    assert.ok(m === null || m.rows.every(r => r.kind === 'code') || m.rows.some(r => show(r).includes('${foo(םש, ליג)}') || show(r).includes('ל\\"הצ')), src)
  }
  assert.deepEqual(rows(fence('ruby', 'x=1#שלום hello חבר')).map(show), ['● x=1#רבח hello םולש'])
  assert.deepEqual(rows(fence('r', 'x<-1#שלום hello חבר')).map(show), ['● x<-1#רבח hello םולש'])
  assert.deepEqual(rows(fence('php', '$x=1;#שלום hello חבר')).map(show), ['● $x=1;#רבח hello םולש'])
  assert.deepEqual(rows(fence('sh', 'echo שלום;#שלום hello חבר')).map(show), ['● echo םולש;#רבח hello םולש'])
  assert.deepEqual(rows(fence('sh', 'echo a#b שלום')).map(show), ['● echo a#b םולש'])
})

test('wide and zero-width graphemes in atoms at every wrap position, and a tab after an atom', () => {
  for (const g of ['界', '😀', '👩‍💻', 'e\u0301']) {
    for (let n = 40; n < 62; n++) {
      const src = 'const x = `שלום ${"' + 'a'.repeat(n) + g + '"}`;'
      const m = modelAssistant(fence('js', src), 61, true, S)
      if (m === null) continue
      const all = m.rows.map(show)
      assert.ok(all.every(r => textWidth(r) <= 60), `${g} ${n}`)
      assert.equal(all.join('').split(g).length - 1, 1, `${g} ${n}`)
    }
  }
  const r = show(rows(fence('js', 'x = "\\n"\t// שלום'))[0])
  // `x = "\n"` is 8 cells, so the tab after the escape's atom stops at 16
  assert.equal(r.indexOf('//'), 2 + 16, r)
})

test('T10 compare: a mark after an atom, long regex context, YAML hashes, TOML and Julia comments', () => {
  for (const arabic of ['letters', 'forms'] as const) {
    const src = 'const s = "שלום ' + 'a'.repeat(54) + String.raw`\n` + '⃣' + '";'
    const m = modelAssistant(fence('js', src), 61, true, { ...S, arabic })
    assert.ok(m === null || m.rows.every(r => textWidth(show(r)) <= 60))
    if (m) assert.equal(m.rows.map(show).join('').split('⃣').length - 1, 1)
  }
  const want = '"םלוע user םולש"'
  const long = ['if (' + 'x || '.repeat(450) + 'ok)', '/["#]/g.test("שלום user עולם");']
  assert.ok(rows(fence('js', ...long)).map(show).some(r => r.includes(want)))
  const spaces = ['const q = total' + ' '.repeat(2100), ' / a["שלום user עולם"] / divisor;']
  assert.ok(rows(fence('js', ...spaces)).map(show).some(r => r.includes(want)))
  for (const sep of [';', ')', '(', '|', '&']) {
    const r = rows(fence('yaml', `key: foo${sep}#שלום hello חבר`))[0]
    assert.ok(r.kind === 'text' && r.spans.every(sp => sp.style !== COMMENT), sep)
  }
  for (const l of ['toml', 'julia']) {
    const r = rows(fence(l, 'x=1#שלום hello חבר'))[0]
    assert.equal(show(r), '● x=1#רבח hello םולש')
    assert.ok(r.kind === 'text' && r.spans.some(sp => sp.style === COMMENT && sp.text.includes('hello')))
  }
})

test('T10 round 2: # comments in Perl, PowerShell and CMake; $#items stays code', () => {
  const cases: [string, string, string][] = [
    ['perl', 'my $x=1;#שלום hello חבר', '● my $x=1;#רבח hello םולש'],
    ['powershell', 'Write-Output 1;#שלום hello חבר', '● Write-Output 1;#רבח hello םולש'],
    ['cmake', 'message("x")#שלום hello חבר', '● message("x")#רבח hello םולש'],
  ]
  for (const [l, src, want] of cases) {
    const r = rows(fence(l, src))[0]
    assert.equal(show(r), want, l)
    assert.ok(r.kind === 'text' && r.spans.some(sp => sp.style === COMMENT && sp.text.includes('hello')), l)
  }
  const r = rows(fence('perl', 'my $n = $#items; # שלום'))[0]
  assert.equal(show(r), '● my $n = $#items; # םולש')
  assert.ok(r.kind === 'text' && r.spans.every(sp => sp.style !== COMMENT || !sp.text.includes('items')))
  assert.deepEqual(rows(fence('powershell', 'Write-Output a#b שלום')).map(show), ['● Write-Output a#b םולש'])
})

test('T10 round 3: a brace inside a shell word does not start a comment; PowerShell braces do', () => {
  for (const src of ['echo a{#שלום hello חבר', 'echo a}#שלום hello חבר']) {
    const r = rows(fence('bash', src))[0]
    assert.ok(r.kind === 'text' && r.spans.every(sp => sp.style !== COMMENT), src)
  }
  assert.deepEqual(rows(fence('sh', 'echo שלום;#שלום hello חבר')).map(show), ['● echo םולש;#רבח hello םולש'])
  const ps = rows(fence('powershell', 'if ($a) {#שלום hello חבר'))[0]
  assert.equal(show(ps), '● if ($a) {#רבח hello םולש')
})

test('T11: multiline interpolations fall back; Tcl arguments and Make recipes keep their #', () => {
  for (const [l, src] of [
    ['js', 'const x = `שלום ${foo(\n  שם,\n  גיל\n)} עולם`;'],
    ['python', 'x = f"""שלום {foo(\n  name,\n  other\n)} עולם"""'],
  ]) {
    const m = modelAssistant(fence(l, ...src.split('\n')), 61, false, S)
    assert.ok(m === null || m.rows.every(r => r.kind !== 'text' || !show(r).includes(')${') && !show(r).includes(')foo}')), l)
  }
  assert.deepEqual(rows(fence('tcl', 'set color #ff0000; # צבע רקע בעברית')).map(show), ['● set color #ff0000; # תירבעב עקר עבצ'])
  assert.deepEqual(rows(fence('tcl', '# הערה בתחילת שורה')).map(show), ['● # הרוש תליחתב הרעה'])
  const mk = rows(fence('makefile', 'all:', "\tprintf '%s\\n' a#שלום hello עולם")).map(show)
  assert.ok(mk.some(x => x.includes('a#םולש hello םלוע')), mk.join('\n'))
  assert.deepEqual(rows(fence('makefile', 'CC = gcc # מהדר')).map(show), ['● CC = gcc # רדהמ'])
  assert.deepEqual(rows(fence('makefile', 'X = a#שלום hello עולם')).map(show), ['● X = a#םלוע hello םולש'])
})

// A fence the engine draws whole: every row a `Code` leaf, the source unchanged.
const engineDraws = (lang: string, ...lines: string[]) => {
  const r = rows('שלום עולם\n\n' + fence(lang, ...lines))
  assert.ok(r[0].kind === 'text' && r[0].rtl, lang)
  const code = r.slice(2)
  assert.ok(code.length > 0 && code.every(x => x.kind === 'code'), code.map(show).join('\n'))
  assert.equal(code.map(x => (x.kind === 'code' ? x.source : '')).join('\n'), lines.join('\n'))
}

test('T12: Perl, Tcl and Make lines the scanner cannot be sure of leave their fence to the engine', () => {
  // Perl: regexes, quote-like operators (multiline or not), and a sub named q
  engineDraws('perl', 'my $re = qr{', '^#שלום hello חבר$', '}; # הערה בעברית')
  engineDraws('perl', 'my $msg = qq{', 'שלום user עולם', '}; # הערה בעברית')
  engineDraws('perl', 'my $re = /^#/; # זיהוי הערות בעברית')
  engineDraws('perl', 'my $re = qr=^#=; # הערה בעברית')
  engineDraws('perl', 'my $re = qr/^#/; # זיהוי הערות בעברית')
  engineDraws('perl', '$s =~ s{#}{x}g; # הערה')
  engineDraws('perl', 'if ($x =~ /#/) { print "שלום" }')
  engineDraws('perl', 'my %h = (s => 1); # הערה')
  engineDraws('perl', 'my $msg = qq{שלום user עולם};')
  engineDraws('perl', 'my $msg = q{שלום user עולם};')
  engineDraws('perl', 'sub q { return "שלום user עולם"; }')
  engineDraws('perl', 'print <<END;', 'שלום # עולם', 'END')
  engineDraws('perl', 'my $s = "שלום', 'עולם";')
  // Make: an inline recipe, a custom recipe prefix, a variable reference, a continued line
  engineDraws('makefile', "all: ; printf '%s\\n' a#שלום hello עולם")
  engineDraws('makefile', '.RECIPEPREFIX := >', 'all:', ">printf '%s\\n' a#שלום hello עולם")
  engineDraws('makefile', 'X = $(subst #,a,שלום hello עולם)')
  engineDraws('makefile', 'X = a \\', '  b#שלום hello עולם')
  // Tcl: an escaped separator, a braced argument
  engineDraws('tcl', 'set color a\\;#שלום; # צבע רקע בעברית')
  engineDraws('tcl', 'set x {a; #שלום hello עולם}')
})

test('T12: a Make recipe in a list lost its tab, so its fence is the engine\'s', () => {
  const r = rows('- שלום\n\n  ```makefile\n  all:\n  \tprintf \'%s\\n\' a#שלום hello עולם\n  ```')
  const code = r.filter(x => x.kind === 'code' || (x.kind === 'text' && show(x).includes('printf')))
  assert.ok(code.length > 0 && code.every(x => x.kind === 'code'), r.map(show).join('\n'))
})

test('T12: what the scanner is sure of is still drawn', () => {
  assert.deepEqual(rows(fence('perl', 'print "שלום עולם"; # הערה')).map(show), ['● print "םלוע םולש"; # הרעה'])
  assert.deepEqual(rows(fence('perl', "print 'שלום $x'; # הערה")).map(show), ["● print '$x םולש'; # הרעה"])
  assert.deepEqual(rows(fence('perl', 'my $n = $#items; # שלום')).map(show), ['● my $n = $#items; # םולש'])
  // whole-line comments in fences with nothing that moves `#`
  assert.deepEqual(rows(fence('perl', '# בודק הערות', 'my $x = 1;')).map(show), ['● # תורעה קדוב', '<code>my $x = 1;'])
  assert.deepEqual(rows(fence('tcl', '# הערה', 'set a 1')).map(show), ['● # הרעה', '<code>set a 1'])
  assert.deepEqual(rows(fence('makefile', '# הערה', 'CC = gcc')).map(show), ['● # הרעה', '<code>CC = gcc'])
})

test('T13: a whole-line comment in an unsure fence, # as a Perl delimiter, Perl interpolation, Make expansions in recipes', () => {
  // a line that starts with # may close a literal and go on as code
  engineDraws('perl', 'my $msg = qq{', '# שלום }; print "שלום user עולם";')
  engineDraws('tcl', 'set x {', '# שלום}; puts "שלום user עולם"')
  engineDraws('makefile', '.ONESHELL:', 'all:', "\tprintf '%s\\n' '", "\t# שלום'; printf '%s\\n' 'שלום user עולם'")
  engineDraws('makefile', 'all:', "\tprintf '%s\\n' '", "\t# שלום'")
  engineDraws('perl', '# בודק הערות', 'my $re = qr/^#/;')
  engineDraws('tcl', 'proc f {} {', '  # הערה', '}')
  engineDraws('makefile', 'X = $(Y)', '# הערה')
  // # as the delimiter of a quote-like operator
  engineDraws('perl', 'my $msg = q#שלום user עולם#;')
  engineDraws('perl', 'my $msg = qq#שלום user עולם#;')
  engineDraws('perl', 'my $re = m#^שלום user עולם$#;')
  // an interpolating string
  engineDraws('perl', 'my $שם = "x"; my $msg = "שלום ${שם} עולם";')
  engineDraws('perl', 'print "שלום @names עולם";')
  // a Make expansion on a recipe line is Make's before it is the shell's
  engineDraws('makefile', 'all:', "\tprintf '%s\\n' $(subst #,x,שלום hello עולם)")
})

test('T14: Make: an escaped # and expansions inside a recipe\'s quotes leave the fence to the engine', () => {
  engineDraws('makefile', 'X = a\\#שלום hello עולם')
  engineDraws('makefile', 'all:', '\tprintf \'%s\\n\' "$(subst #,x,שלום hello עולם)"')
  engineDraws('makefile', 'שם = x', 'all:', '\tprintf \'%s\\n\' "שלום $(שם) עולם"')
  engineDraws('makefile', 'all:', '\techo "שלום ${HOME} עולם"')
  // the simple tab recipe is still drawn
  const mk = rows(fence('makefile', 'all:', "\tprintf '%s\\n' a#שלום hello עולם")).map(show)
  assert.ok(mk.some(x => x.includes('a#םולש hello םלוע')), mk.join('\n'))
})

test('T15: Make backticks and escapes on a recipe line, and a Tcl comment that goes on, leave the fence to the engine', () => {
  engineDraws('makefile', 'all:', "\techo `printf '%s' שלום` # הערה בעברית")
  engineDraws('makefile', 'all:', '\techo \\;#שלום hello עולם')
  engineDraws('tcl', '# הערה \\', 'puts שלום', 'puts עולם')
  // a backslash inside single quotes is the shell's literal: still drawn
  const mk = rows(fence('makefile', 'all:', "\tprintf 'a\\tb' x#שלום hello עולם")).map(show)
  assert.ok(mk.some(x => x.includes('x#םולש hello םלוע')), mk.join('\n'))
  // a Tcl comment without the backslash: still drawn
  const tcl = rows(fence('tcl', '# הערה בעברית', 'puts hello')).map(show)
  assert.ok(tcl.some(x => x.includes('תירבעב הרעה')), tcl.join('\n'))
})

test('T16: Make: single quote characters inside a recipe\'s double quotes hide no backtick', () => {
  engineDraws('makefile', 'all:', "\techo \"'`printf %s שלום`'\" # הערה בעברית")
  engineDraws('makefile', 'all:', "\techo \"'\\\\'\" שלום hello עולם")
  // quote characters inside the other kind of quote are letters: still drawn
  const dq = rows(fence('makefile', 'all:', "\techo \"it's\" x#שלום hello עולם")).map(show)
  assert.ok(dq.some(x => x.includes('x#םולש hello םלוע')), dq.join('\n'))
  const sq = rows(fence('makefile', 'all:', "\techo 'say \"hi\"' x#שלום hello עולם")).map(show)
  assert.ok(sq.some(x => x.includes('x#םולש hello םלוע')), sq.join('\n'))
})
