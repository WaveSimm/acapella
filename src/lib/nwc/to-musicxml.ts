import type { ParsedScore } from "./parser";
import { XML_DIVISIONS, clefXml } from "./parser";

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildMusicXml(parsed: ParsedScore): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  lines.push('<score-partwise version="3.1">');
  lines.push("  <work><work-title>" + escapeXml(parsed.songTitle || "Untitled") + "</work-title></work>");
  if (parsed.composer) {
    lines.push('  <identification><creator type="composer">' + escapeXml(parsed.composer) + "</creator></identification>");
  }

  lines.push("  <part-list>");
  for (const staff of parsed.staves) {
    lines.push(`    <score-part id="${staff.partId}">`);
    lines.push(`      <part-name>${escapeXml(staff.label || staff.name)}</part-name>`);
    lines.push(`    </score-part>`);
  }
  lines.push("  </part-list>");

  const [tsNum, tsDen] = parsed.timeSig.split("/").map(Number);

  for (const staff of parsed.staves) {
    lines.push(`  <part id="${staff.partId}">`);
    const cd = clefXml(staff.clef);

    // 마지막 빈 마디가 NWC Bar 명령어로 만들어진 trailing placeholder인지 판정:
    // 이 스태프에만 있고 다른 스태프 중 어떤 곳은 해당 measure index에 notes가 있으면
    // 실제 음악 마디로 간주하고 쉼표로 채워 출력. 전 스태프에서 모두 비어있으면 skip.
    const maxCount = Math.max(...parsed.staves.map((s) => s.measures.length));

    for (let mi = 0; mi < staff.measures.length; mi++) {
      const m = staff.measures[mi];
      // 마지막 (공유되지 않는) trailing 빈 마디만 skip
      if (m.notes.length === 0 && mi === staff.measures.length - 1 && mi === maxCount - 1) {
        const anyOtherHasNotes = parsed.staves.some(
          (other) => other !== staff && other.measures[mi]?.notes.length > 0,
        );
        if (!anyOtherHasNotes) continue;
      }

      const measureNumber = mi + 1;
      lines.push(`    <measure number="${measureNumber}">`);
      if (mi === 0) {
        lines.push(`      <attributes>`);
        lines.push(`        <divisions>${XML_DIVISIONS}</divisions>`);
        lines.push(`        <key><fifths>${staff.fifths ?? 0}</fifths></key>`);
        if (tsNum && tsDen) {
          lines.push(`        <time><beats>${tsNum}</beats><beat-type>${tsDen}</beat-type></time>`);
        }
        lines.push(`        <clef><sign>${cd.sign}</sign><line>${cd.line}</line></clef>`);
        lines.push(`      </attributes>`);
        if (staff === parsed.staves[0] && parsed.tempo) {
          lines.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${parsed.tempo}</per-minute></metronome></direction-type><sound tempo="${parsed.tempo}"/></direction>`);
        }
      } else {
        // mid-score 조성 변화 — 해당 마디 시작에 <attributes><key> 추가
        const keyChange = staff.keyChanges?.find((kc) => kc.measureNumber === measureNumber);
        if (keyChange) {
          lines.push(`      <attributes><key><fifths>${keyChange.fifths}</fifths></key></attributes>`);
        }
      }
      // 빈 마디는 전체 쉼표로 채워 정렬 유지
      if (m.notes.length === 0) {
        const fullMeasureDur = XML_DIVISIONS * 4 * (tsNum ?? 4) / (tsDen ?? 4);
        lines.push(`      <note><rest measure="yes"/><duration>${Math.round(fullMeasureDur)}</duration></note>`);
      }
      for (const n of m.notes) {
        if (n.type === "rest") {
          const dots = "<dot/>".repeat(n.dots || 0);
          lines.push(`      <note><rest/><duration>${n.durDivisions}</duration><type>${n.durType}</type>${dots}</note>`);
        } else {
          for (let pi = 0; pi < n.pitches.length; pi++) {
            const p = n.pitches[pi];
            const parts: string[] = [];
            if (pi > 0) parts.push("<chord/>");
            parts.push("<pitch>");
            parts.push(`<step>${p.step}</step>`);
            if (p.alter) parts.push(`<alter>${p.alter}</alter>`);
            parts.push(`<octave>${p.octave}</octave>`);
            parts.push("</pitch>");
            parts.push(`<duration>${n.durDivisions}</duration>`);
            if (n.tied) parts.push('<tie type="start"/>');
            parts.push(`<type>${n.durType}</type>`);
            for (let d = 0; d < (n.dots || 0); d++) parts.push("<dot/>");
            if (p.explicitAccidental !== null && p.explicitAccidental !== undefined) {
              const accMap: Record<number, string> = { 1: "sharp", [-1]: "flat", 0: "natural", 2: "double-sharp", [-2]: "flat-flat" };
              const accName = accMap[p.explicitAccidental];
              if (accName) parts.push(`<accidental>${accName}</accidental>`);
            }
            // notations (slur, tied 등)은 첫 pitch(chord 노트)에만
            if (pi === 0) {
              const notations: string[] = [];
              if (n.slurEvent) notations.push(`<slur type="${n.slurEvent}" number="1"/>`);
              if (n.tied) notations.push(`<tied type="start"/>`);
              if (notations.length > 0) parts.push(`<notations>${notations.join("")}</notations>`);
            }
            // 가사: 첫 pitch (chord 노트)에만 붙임
            if (pi === 0 && n.lyric) {
              parts.push(`<lyric number="1"><syllabic>${n.lyric.syllabic}</syllabic><text>${escapeXml(n.lyric.text)}</text></lyric>`);
            }
            lines.push(`      <note>${parts.join("")}</note>`);
          }
        }
      }
      lines.push(`    </measure>`);
    }

    lines.push(`  </part>`);
  }

  lines.push("</score-partwise>");
  return lines.join("\n");
}
