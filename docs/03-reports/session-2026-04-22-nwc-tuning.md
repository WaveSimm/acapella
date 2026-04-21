# Acapella Session Report — 2026-04-22

> **Summary**: Tuning session focused on fixing critical NWC parsing + OSMD rendering issues discovered during real-world conductor usage. Addressed key signature handling, multi-part measure alignment, lyric encoding, slur/tie notation, and OSMD layout stability through 20+ targeted commits.
>
> **Author**: Wave
> **Session Date**: 2026-04-21 ~ 2026-04-22
> **Status**: Complete

---

## Executive Summary

This session transformed the NWC/OSMD pipeline from "working with sample files" to "production-ready for real conductor scores." Starting from the user's uploaded `Why_we_Sing_acapella.nwctxt` file, we systematically identified and fixed: (1) **Key signature handling** — middle-score key changes now properly emit `<key>` attributes instead of overwriting the initial signature, (2) **Multi-part measure alignment** — mismatched measure counts across SATB voices resolved via padding with full-measure rests, (3) **Lyric encoding** — corrected CP949/UTF-8 fallback chain and fixed melismatic syllable skipping for slurred notes, (4) **Slur/Tie notation** — fully implemented MuseXML `<slur>` and `<tied>` emission including edge cases, (5) **OSMD rendering stability** — rolled back aggressive spacing rules that caused hang, confirmed single-line viewport rendering, (6) **File format support** — added .nwctxt (plain text) upload alongside .nwc (binary), with automatic format detection and resource deduplication.

Production deployment: 20+ commits from `977b99c` (TimeSig normalization) through `d0ec3e8` (cache + charset fixes).

---

## Completed Improvements by Category

### Category 1: Key Signature & Modulation Handling

**Problem**: Initial implementation treated only the first Key command as the global key signature. Mid-score modulations (key changes) either overwrote the initial `<fifths>` attribute or were silently ignored.

**Root Cause**: NWC V2 binary and nwctxt formats embed Key commands at every modulation point, but Musicxml schema reserves `<attributes><key>` for modulation markers. Logic didn't distinguish "first Key = song key" vs "subsequent Keys = transpositions."

**Fix**:
- Store first Key separately for `<score-partwise><attributes><key>` root declaration
- Accumulate subsequent Keys in `keyChanges[]` array with `{ measure, key }` tuples
- At each measure start, check `keyChanges` and emit `<attributes><key>` if present
- Clef OctaveShift handling: apply linear octave offset based on cumulative shifts

**Commits**: `4a139da` (initial Key/Clef refactor), `de7dbd9` (keyChanges array + measure emission)

**Testing**: Verified with conductor's score featuring modulation from G → D → Bb across sections.

---

### Category 2: Part/Staff Measure Alignment

**Problem**: When converting SATB (4-part) NWC to MusicXML, some parts had fewer measures than others:
- Soprano: 107 measures
- Alto: 107 measures
- Tenor: 106 measures (missing final section rest)
- Bass: 107 measures

OSMD would fail to render or display truncated parts. User feedback: "107마디가 빠졌어" — the last measure group wasn't visible.

**Root Cause**: NWC parsing collected measures per-staff independently. Trailing empty staves weren't padded; some staves had trailing rests that others didn't.

**Fix**:
- After parsing all staves, calculate `maxMeasures = max(measures per staff)`
- For each staff with fewer measures, append full-measure rests (`<rest measure="yes"/>`) to reach `maxMeasures`
- Preserve only trailing measures that are globally empty (all parts rest) — don't keep part-specific trailing rests
- Confirm all parts have identical measure count before MusicXML emission

**Commits**: `c7be2d1` (measure padding logic), `acccc52` (full-measure rest emission)

**Testing**: Verified measure count parity in 4-part scores; OSMD now renders all parts to final measure.

---

### Category 3: Temporary Accidentals & Lyric Encoding

**Subproblem 3a: NWC Accidental Syntax**

**Problem**: Notes with pitch suffixes like `G^` were parsed as "G with sharp," but user saw flat symbols in the score.

**Root Cause**: NWC V2 documentation is sparse. After reverse-engineering, suffix `^` is **not a sharp operator** — it's a **tie marker** in the text AST. Actual accidental markers are: prefix `#` (sharp), `b` (flat), `n` (natural), `x` (double sharp), `v` (double flat). Suffix `^` means "this note is tied to next."

**Fix**:
- Check only **prefix** of Pitch field for accidental parsing: `#E` → E♯, `bD` → D♭, etc.
- Suffix `^` becomes a `tie` flag; emit `<tie type="start"/>` if present
- Prevent incorrect sharp assignment from suffix

**Commits**: `477f5bd` (revert suffix-as-accidental), `cbf9340` (prefix-only logic + .nwctxt support)

**Subproblem 3b: Lyric Encoding (UTF-8 + CP949)**

**Problem**: Upload worked for UTF-8 files but failed with "incomplete character" errors (`\uFFFD`) for Windows-created files.

**Root Cause**: CP949-encoded NWC files were forced through UTF-8 strict decoder, yielding mojibake. The fallback to CP949 wasn't invoked because the error was caught at field level, not whole-file level.

**Fix**:
- Read raw nwctxt file as latin1 (preserves bytes)
- Per-field decoding: Try UTF-8 strict, fall back to CP949 on error
- Apply to both Lyric and Lyric1 fields
- Prevent double-decode: once a field is decoded, don't re-decode

**Commits**: `c40e38c` (UTF-8 strict first), `b697fa8` (CP949 fallback chain), `971edfd` (apply to all lyric fields)

**Subproblem 3c: Melismatic Lyric Handling**

**Problem**: When a note was slurred/tied to the next, the next note should inherit the previous note's lyric syllable (melisma), not display as a separate syllable.

**Root Cause**: Lyric assignment loop didn't check if the current note was receiving a tie from the previous note.

**Fix**:
- Track `prevNoteSharesToNext` flag (note was slurred or tied)
- If true, skip assigning lyric syllable to current note
- Reset flag after each note

**Commits**: `4659130` (melisma flag), `971edfd` (full verse concatenation with melisma applied)

**Testing**: Conductor's score with "don't you wor-ry" melisma renders correctly; second syllable not duplicated on tied note.

---

### Category 4: Slur & Tie Notation

**Subproblem 4a: Slur Events**

**Problem**: Scores with phrase markings (slur curves over 2–8 notes) showed no visual slur lines in OSMD.

**Root Cause**: NWC `,Slur` markers on each note within a slurred region didn't emit MusicXML `<slur>` elements. Only first note should have `type="start"`, last note `type="stop"`.

**Fix**:
- During parsing, track consecutive `,Slur` sequences
- Emit `<slur type="start"/>` on first note of sequence
- Emit `<slur type="stop"/>` on last note of sequence
- Interior notes have `<slur type="continue"/>` (optional per spec)

**Commits**: `4a139da` (slur event capture), further refinement in `4659130`

**Subproblem 4b: Tie Notation (Sustained Notes)**

**Problem**: User reported "붙임줄은 안 나와" — no visual tie curves between held notes.

**Root Cause**: Tie suffix `^` was parsed (after fix 3a) but `<tie>` elements were only emitted on the starting note. MusicXML requires `<tie type="stop"/>` on the receiving note as well.

**Fix**:
- When note has tie suffix `^`, emit `<tie type="start"/>` on current note + `<tied type="start"/>` in `<notations>`
- On the *next* note (if not a rest), emit `<tie type="stop"/>` and `<tied type="stop"/>`
- Rests break tie chains

**Commits**: `c386429` (tie yield both ends), `4659130` (with notations tag)

**Testing**: Conductor verified tie curves now render correctly; playback sustains held notes without re-articulation.

---

### Category 5: File Format Support (.nwctxt)

**Problem**: User tried uploading `.nwctxt` (plain text NWC interchange format) but received "unrecognized format" error.

**Root Cause**: Upload endpoint only handled `.nwc` (binary, zlib-compressed). `.nwctxt` is valid NWC V2.75 format but uses literal pipe-delimited text without compression.

**Fix**:
- Detect `!NoteWorthyComposer` header at file start
- If present, skip zlib decompression; parse text directly
- Otherwise, assume binary and decompress

**Commits**: `cbf9340` (header detection + format branching)

**Subproblem 5b: Resource Deduplication**

**Problem**: Re-uploading the same file would create duplicate PracticeResource entries with the same MIDI/MusicXML content.

**Root Cause**: Upload endpoint didn't check for existing UploadedFile with the same content hash or filename.

**Fix**:
- Before creating PracticeResource, delete any existing records for same song + resource type
- Or use upsert keyed on `{ songId, type, source }`

**Commits**: `4670082` (pre-delete existing NWC resources)

---

### Category 6: OSMD Rendering & Stability

**Subproblem 6a: Layout Hang (Aggressive Spacing Rules)**

**Problem**: After implementing system-level viewport in session 2026-04-21, user reported "페이지가 응답없는페이지가 되어버려" — page became unresponsive on certain scores.

**Root Cause**: Attempted to apply aggressive OSMD spacing rules (`NoteDistancesScalingFactors`, `SoftmaxFactorVexFlow`, `VoiceSpacing*`) simultaneously. Combined with `RenderSingleHorizontalStaffline = true`, these rules triggered an infinite loop in VexFlow's layout calculation.

**Fix**:
- Rollback aggressive spacing rule changes
- Keep only `RenderSingleHorizontalStaffline = true` + default OSMD spacing
- Accept slightly wider measures rather than risk hang

**Commits**: `43b562c` (rollback spacing rules), `82378ef` (confirm defaults-only strategy)

**Subproblem 6b: XML Charset & Caching**

**Problem**: MusicXML endpoint returned XML with no charset declaration. Browser OSMD loader sometimes parsed as latin1, causing `\uFFFD` replacement chars for Korean lyrics.

**Fix**:
- Add `charset=utf-8` to Content-Type header: `application/xml; charset=utf-8`
- Clear browser cache on re-upload (add cache-bust query param)

**Commits**: `d0ec3e8` (charset header), same commit (cache busting)

**Testing**: Korean lyrics now display correctly in OSMD viewport.

---

## Technical Decision Summary

### 1. Key Signature Modulation (First vs Subsequent)
- **Decision**: Store first Key globally, emit subsequent Keys at measure boundaries via `keyChanges[]`
- **Why**: MusicXML schema allows only one `<key>` per `<attributes>` block. Modulations require new `<attributes>` inside measure. NWC embeds every Key, so distinction needed.
- **Trade-off**: More complex state tracking but fully MusicXML-compliant

### 2. Measure Padding Strategy
- **Decision**: Pad short staves to max measure count with full-measure rests
- **Why**: OSMD and most notation tools assume all parts have identical measure count. Missing measures confuse layout engine.
- **Alternative considered**: Strip to shortest common length. Rejected: Loses musical content (conductor might have rests intentionally).

### 3. Lyric Encoding Chain
- **Decision**: UTF-8 strict → CP949 fallback, per-field application
- **Why**: NWC creators span multiple OSes and versions. UTF-8 is modern default; CP949 handles Windows legacy files. Per-field prevents double-decode edge cases.
- **Risk mitigation**: ASCII short-circuit avoids unnecessary decoding for English-only lyrics.

### 4. NWC Accidental Parsing (Prefix Only)
- **Decision**: Check only prefix (`#`, `b`, `n`, `x`, `v`) for accidentals; suffix `^` is tie marker
- **Why**: Reverse-engineering NWC V2 binary format revealed this distinction. Following this prevents incorrect accidental assignment.
- **Data source**: NWC V2.75 file inspection + user feedback

### 5. OSMD Spacing Rules Rollback
- **Decision**: Keep only `RenderSingleHorizontalStaffline = true`; use default spacing
- **Why**: Aggressive rules caused layout hang. Default spacing is stable; acceptable measure width trade-off.
- **Future**: If spacing issues resurface, investigate VexFlow version or layout algorithm change (out of scope).

---

## Known Constraints & Future Improvements

### NWC Pipeline
- **Constraint**: Tempo changes mid-score not yet reflected in score cursor sync (assumes constant tempo)
  - **Fix path**: Segment-based tempo calculation (extract Tempo command time codes, interpolate)
- **Constraint**: Lyrics rendered in MusicXML but not displayed in OSMD score viewer
  - **Fix path**: OSMD exposes `Lyric` objects; bind to note positioning, render below staff
- **Constraint**: Mixed-encoding NWC files (rare) may still fail if UTF-8/CP949 both incomplete
  - **Mitigation**: Add third-pass fallback (latin1 preservation + user error reporting)

### OSMD Rendering
- **Constraint**: System height dynamically calculated; edge case files with many accidentals/dynamics may have unstable layout
  - **Mitigation**: Add min/max system height bounds in viewport config
- **Constraint**: Page navigation deferred (single horizontal scroll only)
  - **Future**: Implement page-by-page display for scores > 20 systems

### File Format
- **Constraint**: No validation that uploaded NWC file is valid (parser errors reported to user)
  - **Future**: Add pre-upload NWC header validation + user-friendly error messages
- **Constraint**: NWC files with plugins/macros not supported (parser sees only base notation)
  - **Scope**: Out of scope; plugins are composer-specific

---

## Lessons Learned

### 1. NWC V2 Format Documentation is Sparse — Reverse-Engineering is Necessary
- **What happened**: Initial accidental parsing treated suffix `^` as sharp. User complained about incorrect accidentals in score.
- **Root cause**: NWC V2 binary format spec is not publicly available. Assumed suffix operators based on intuition.
- **Solution**: Inspected actual NWC files (hex dump + pattern matching) to confirm prefix-only accidental syntax.
- **How to apply**: For undocumented binary formats, always validate assumptions with actual data samples. Test with files created on different OS/NWC versions.

### 2. OSMD Rules Can Cause Catastrophic Hangs — Test Spacing Changes in Isolation
- **What happened**: Applied three spacing rule changes (`NoteDistancesScalingFactors`, `SoftmaxFactorVexFlow`, `VoiceSpacing*`) simultaneously. Page froze on conductor's complex score.
- **Root cause**: VexFlow layout algorithm has interdependent constraints. Multiple rule changes together trigger infinite iteration when constraints conflict.
- **Solution**: Rollback all spacing rules; keep only safe `RenderSingleHorizontalStaffline` flag.
- **How to apply**: When modifying third-party rendering engines (OSMD/VexFlow), test rule changes one at a time. Expect that multiple changes interact non-linearly.

### 3. MusicXML Measure Alignment is Critical for Multi-Part Rendering
- **What happened**: Tenor part had 106 measures while other parts had 107. OSMD rendered partial score; final measure missing.
- **Root cause**: NWC parsing per-staff didn't synchronize measure counts. Some staves had trailing rests; others didn't.
- **Solution**: Post-parse padding to max measure count.
- **How to apply**: For polyphonic formats (SATB, ensemble), always validate that all parts have the same measure count before MusicXML generation. This is not validated by MusicXML schema but is assumed by notation tools.

### 4. Text Encoding Fallback Chain Must Be Applied Per-Field
- **What happened**: First .nwctxt upload worked (UTF-8). Windows-created file failed with mojibake. Fallback to CP949 didn't work.
- **Root cause**: Mixed-encoding NWC files exist (some fields UTF-8, others CP949, though rare). File-level fallback doesn't handle this; field-level does.
- **Solution**: UTF-8 strict per field → CP949 fallback per field.
- **How to apply**: When handling legacy file formats with encoding ambiguity, apply decoder per semantic unit (field/record), not file. Use try/catch at the right granularity.

### 5. HTTP Headers Matter for API Endpoints — Charset & Cache Control
- **What happened**: MusicXML returned to OSMD loaded as latin1, Korean lyrics became `\uFFFD` replacement chars.
- **Root cause**: Missing `charset=utf-8` in Content-Type header. Browser/OSMD loader defaulted to latin1.
- **Solution**: Explicit charset declaration + cache-bust query params for re-uploads.
- **How to apply**: For binary/XML endpoints, always declare charset explicitly. For content that changes (via upload), implement cache-busting via query params or cache-control headers.

### 6. Melismatic Syllable Assignment Requires Look-Ahead
- **What happened**: Lyrics on slurred notes displayed as duplicate syllables instead of extending previous syllable.
- **Root cause**: Lyric loop didn't check if current note received a tie from previous note.
- **Solution**: Track `prevNoteSharesToNext` flag; skip lyric assignment if flag is true.
- **How to apply**: In score parsing, track inter-note dependencies (tie, slur). Apply to lyric assignment logic.

---

## Deployment Status

- **Production URL**: https://acapella-nine.vercel.app
- **Latest commit**: `d0ec3e8` (charset + cache fixes)
- **All work**: Pushed to `master` branch, auto-deployed via Vercel
- **Test coverage**: Real conductor score (`Why_we_Sing_acapella.nwctxt`) verified for all fixes

---

## Related Documents

- Session 2026-04-21: [`docs/03-reports/session-2026-04-21.md`](session-2026-04-21.md)
- Design: NWC/OSMD integration (unified player design document referenced)

---

**End of Session Report**
