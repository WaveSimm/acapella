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

// 부분 마디 앞쪽에 삽입할 쉼표 분해 (큰 단위부터 탐욕적으로)
// XML_DIVISIONS 기준: whole=div*4, half=div*2, quarter=div, 8th=div/2, 16th=div/4, 32nd=div/8
function restsForDivisions(totalDiv: number): Array<{ type: string; dur: number }> {
  const out: Array<{ type: string; dur: number }> = [];
  const units: Array<{ type: string; dur: number }> = [
    { type: "whole", dur: XML_DIVISIONS * 4 },
    { type: "half", dur: XML_DIVISIONS * 2 },
    { type: "quarter", dur: XML_DIVISIONS },
    { type: "eighth", dur: Math.max(1, Math.floor(XML_DIVISIONS / 2)) },
    { type: "16th", dur: Math.max(1, Math.floor(XML_DIVISIONS / 4)) },
    { type: "32nd", dur: Math.max(1, Math.floor(XML_DIVISIONS / 8)) },
  ];
  let remaining = totalDiv;
  for (const u of units) {
    while (remaining >= u.dur) {
      out.push(u);
      remaining -= u.dur;
    }
  }
  return out;
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

  // 템포 변화는 NWC 가 임의 staff 에 저장 (예: VP). 전 staff 에서 모아 dedup, staves[0] 에만 emit.
  const aggTempoChanges: { measureNumber: number; bpm: number }[] = [];
  {
    const seen = new Set<string>();
    const all = parsed.staves.flatMap((s) => s.tempoChanges ?? []);
    all.sort((a, b) => a.measureNumber - b.measureNumber);
    let lastBpm = parsed.tempo;
    for (const tc of all) {
      const key = `${tc.measureNumber}:${tc.bpm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (tc.bpm !== lastBpm) {
        aggTempoChanges.push({ measureNumber: tc.measureNumber, bpm: tc.bpm });
        lastBpm = tc.bpm;
      }
    }
  }

  // 텍스트 지시문도 동일 — 여러 staff 에 같은 "a tempo" 등이 중복되면 OSMD 가 위로 쌓아 그림.
  // (measureNumber, text) 로 dedup 후 staves[0] 에만 emit.
  const aggTextDirections: { measureNumber: number; text: string; italic?: boolean }[] = [];
  {
    const seen = new Set<string>();
    for (const s of parsed.staves) {
      for (const td of s.textDirections ?? []) {
        const key = `${td.measureNumber}:${td.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        aggTextDirections.push({ measureNumber: td.measureNumber, text: td.text, italic: td.italic });
      }
    }
    aggTextDirections.sort((a, b) => a.measureNumber - b.measureNumber);
  }

  for (const staff of parsed.staves) {
    lines.push(`  <part id="${staff.partId}">`);
    const cd = clefXml(staff.clef);

    // 모든 스태프 중 가장 긴 마디 수에 맞춤. 짧은 스태프는 쉼표로 패딩.
    const maxCount = Math.max(...parsed.staves.map((s) => s.measures.length));

    // 모든 스태프가 같은 index에서 전부 비어있으면 스킵 (전 스태프가 끝났는데
    // 남은 trailing 빈 마디들은 NWC Bar artifact)
    const allEmptyAt = (idx: number) =>
      parsed.staves.every((s) => !s.measures[idx] || s.measures[idx].notes.length === 0);
    // 실제 출력할 마디 수: trailing all-empty 제거 후
    let effectiveMaxCount = maxCount;
    while (effectiveMaxCount > 0 && allEmptyAt(effectiveMaxCount - 1)) {
      effectiveMaxCount--;
    }

    // 이전 노트가 tie를 시작했는지 추적 (마디 경계 넘어 유지)
    let prevTied = false;

    // 현재 유효 박자 (마디별로 timeSigChanges 적용해 갱신)
    const initialTs = (staff.timeSig ?? parsed.timeSig ?? "4/4").split("/").map(Number);
    let curTsNum = initialTs[0] || 4;
    let curTsDen = initialTs[1] || 4;

    for (let mi = 0; mi < effectiveMaxCount; mi++) {
      const m = staff.measures[mi] ?? { notes: [] }; // 짧은 스태프는 빈 마디로 대체

      const measureNumber = mi + 1;
      const tsChange = staff.timeSigChanges?.find((tc) => tc.measureNumber === measureNumber);
      if (tsChange) {
        const [n, d] = tsChange.sig.split("/").map(Number);
        if (n && d) { curTsNum = n; curTsDen = d; }
      }

      lines.push(`    <measure number="${measureNumber}">`);
      // 좌측 barline (반복 시작 / 1번·2번 괄호 시작)
      const leftBarParts: string[] = [];
      if (m.startBarStyle === "MasterRepeatOpen" || m.startBarStyle === "LocalRepeatOpen") {
        leftBarParts.push(`<bar-style>heavy-light</bar-style><repeat direction="forward"/>`);
      }
      // ending 시작: 직전 마디와 endingNumber 가 다르면 type=start
      const prevMeasure = mi > 0 ? staff.measures[mi - 1] : undefined;
      const prevEnding = prevMeasure?.endingNumber;
      if (m.endingNumber && m.endingNumber !== prevEnding) {
        leftBarParts.push(`<ending number="${m.endingNumber}" type="start"/>`);
      }
      if (leftBarParts.length > 0) {
        lines.push(`      <barline location="left">${leftBarParts.join("")}</barline>`);
      }
      if (mi === 0) {
        lines.push(`      <attributes>`);
        lines.push(`        <divisions>${XML_DIVISIONS}</divisions>`);
        lines.push(`        <key><fifths>${staff.fifths ?? 0}</fifths></key>`);
        if (curTsNum && curTsDen) {
          lines.push(`        <time><beats>${curTsNum}</beats><beat-type>${curTsDen}</beat-type></time>`);
        }
        // clef-octave-change 는 OSMD 가 추가 octave shift 를 적용해 위치가 어긋나는 케이스가 있어 제거.
        // 픽치는 written 으로 저장되어 OSMD 가 정확한 위치에 그림. (MIDI 는 to-midi 가 octaveShift 적용해 sounding 픽치로 재생.)
        lines.push(`        <clef><sign>${cd.sign}</sign><line>${cd.line}</line></clef>`);
        lines.push(`      </attributes>`);
        if (staff === parsed.staves[0] && parsed.tempo) {
          lines.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${parsed.tempo}</per-minute></metronome></direction-type><sound tempo="${parsed.tempo}"/></direction>`);
        }
      } else {
        // mid-score 조성 변화 / 변박 — 해당 마디 시작에 <attributes> 추가
        const keyChange = staff.keyChanges?.find((kc) => kc.measureNumber === measureNumber);
        if (keyChange || tsChange) {
          const attrParts: string[] = [];
          if (keyChange) attrParts.push(`<key><fifths>${keyChange.fifths}</fifths></key>`);
          if (tsChange) attrParts.push(`<time><beats>${curTsNum}</beats><beat-type>${curTsDen}</beat-type></time>`);
          lines.push(`      <attributes>${attrParts.join("")}</attributes>`);
        }
      }
      // mid-score 템포 변화 — 첫 staff 에만 emit (score-wide 변화)
      if (staff === parsed.staves[0]) {
        const tempoChanges = aggTempoChanges.filter((tc) => tc.measureNumber === measureNumber);
        for (const tc of tempoChanges) {
          lines.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tc.bpm}</per-minute></metronome></direction-type><sound tempo="${tc.bpm}"/></direction>`);
        }
      }
      // 무대 지시문 (예: "slow with rubato", "a tempo") — staves[0] 에만 dedup 후 emit.
      // 같은 텍스트가 여러 staff 에 있으면 OSMD 가 위로 쌓아 그리므로 dedup 필수.
      if (staff === parsed.staves[0]) {
        const texts = aggTextDirections.filter((td) => td.measureNumber === measureNumber);
        for (const td of texts) {
          const fontAttr = td.italic ? ' font-style="italic"' : "";
          lines.push(`      <direction placement="above"><direction-type><words${fontAttr}>${escapeXml(td.text)}</words></direction-type></direction>`);
        }
      }
      // 빈 마디는 전체 쉼표로 채워 정렬 유지
      if (m.notes.length === 0) {
        const fullMeasureDur = XML_DIVISIONS * 4 * curTsNum / curTsDen;
        lines.push(`      <note><rest measure="yes"/><duration>${Math.round(fullMeasureDur)}</duration></note>`);
      } else if (curTsNum && curTsDen) {
        // 부분 마디 앞쪽 쉼표 패딩 — NWC에서 시작 쉼표 생략된 경우 (예: 알토 2마디 첫 2분쉼표)
        const measureDur = Math.round(XML_DIVISIONS * 4 * curTsNum / curTsDen);
        let contentDur = 0;
        for (const n of m.notes) contentDur += n.durDivisions;
        if (contentDur > 0 && contentDur < measureDur) {
          const missing = measureDur - contentDur;
          for (const r of restsForDivisions(missing)) {
            lines.push(`      <note><rest/><duration>${r.dur}</duration><type>${r.type}</type></note>`);
          }
        }
      }
      for (const n of m.notes) {
        if (n.type === "rest") {
          if (n.isMeasureRest) {
            // 마디 전체 쉼표 — type 생략, measure="yes" 로 정렬
            lines.push(`      <note><rest measure="yes"/><duration>${n.durDivisions}</duration></note>`);
          } else {
            const dots = "<dot/>".repeat(n.dots || 0);
            lines.push(`      <note><rest/><duration>${n.durDivisions}</duration><type>${n.durType}</type>${dots}</note>`);
          }
          // 쉼표 중간엔 tie 연결 없음
          prevTied = false;
        } else {
          const thisStopsTie = prevTied;
          const thisStartsTie = n.tied;
          for (let pi = 0; pi < n.pitches.length; pi++) {
            const p = n.pitches[pi];
            const parts: string[] = [];
            // 장식음: <grace/> 가 가장 먼저, <duration> 은 생략
            if (n.isGrace) parts.push("<grace/>");
            if (pi > 0) parts.push("<chord/>");
            parts.push("<pitch>");
            parts.push(`<step>${p.step}</step>`);
            if (p.alter) parts.push(`<alter>${p.alter}</alter>`);
            parts.push(`<octave>${p.octave}</octave>`);
            parts.push("</pitch>");
            if (!n.isGrace) parts.push(`<duration>${n.durDivisions}</duration>`);
            // <tie> 음악 요소 — stop 먼저, start 나중 (MusicXML 순서). 장식음엔 tie 없음
            if (!n.isGrace && thisStopsTie) parts.push('<tie type="stop"/>');
            if (!n.isGrace && thisStartsTie) parts.push('<tie type="start"/>');
            parts.push(`<type>${n.durType}</type>`);
            for (let d = 0; d < (n.dots || 0); d++) parts.push("<dot/>");
            // 3연음: time-modification = 3 in the time of 2
            if (n.tripletMark) {
              parts.push("<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>");
            }
            if (p.explicitAccidental !== null && p.explicitAccidental !== undefined) {
              const accMap: Record<number, string> = { 1: "sharp", [-1]: "flat", 0: "natural", 2: "double-sharp", [-2]: "flat-flat" };
              const accName = accMap[p.explicitAccidental];
              if (accName) parts.push(`<accidental>${accName}</accidental>`);
            }
            // notations (slur, tied, tuplet, fermata, articulations 등)은 첫 pitch(chord 노트)에만
            if (pi === 0) {
              const notations: string[] = [];
              if (n.slurEvent) notations.push(`<slur type="${n.slurEvent}" number="1"/>`);
              if (!n.isGrace && thisStopsTie) notations.push(`<tied type="stop"/>`);
              if (!n.isGrace && thisStartsTie) notations.push(`<tied type="start"/>`);
              if (n.tripletMark === "first") notations.push(`<tuplet type="start" number="1" bracket="yes"/>`);
              if (n.tripletMark === "end") notations.push(`<tuplet type="stop" number="1"/>`);
              if (n.fermata) notations.push(`<fermata/>`);
              if (n.articulations && n.articulations.length > 0) {
                const artMap: Record<string, string> = {
                  staccato: "staccato",
                  staccatissimo: "staccatissimo",
                  accent: "accent",
                  tenuto: "tenuto",
                  marcato: "strong-accent",
                };
                const artElems = n.articulations.map((a) => `<${artMap[a]}/>`).join("");
                if (artElems) notations.push(`<articulations>${artElems}</articulations>`);
              }
              if (notations.length > 0) parts.push(`<notations>${notations.join("")}</notations>`);
            }
            if (pi === 0 && n.lyric) {
              const extendTag = n.lyric.extend ? "<extend/>" : "";
              parts.push(`<lyric number="1"><syllabic>${n.lyric.syllabic}</syllabic><text>${escapeXml(n.lyric.text)}</text>${extendTag}</lyric>`);
            }
            lines.push(`      <note>${parts.join("")}</note>`);
          }
          // 장식음은 tie chain 에 참여 안 함 — prevTied 유지
          if (!n.isGrace) prevTied = thisStartsTie;
        }
      }
      // 우측 barline (반복 끝 / 겹세로줄 / 종지선 / 1번·2번 괄호 종료)
      const rightBarParts: string[] = [];
      const nextMeasure = mi + 1 < effectiveMaxCount ? staff.measures[mi + 1] : undefined;
      const isFinalMeasure = mi === effectiveMaxCount - 1;
      if (m.endBarStyle === "MasterRepeatClose" || m.endBarStyle === "LocalRepeatClose") {
        rightBarParts.push(`<bar-style>light-heavy</bar-style><repeat direction="backward"/>`);
      } else if (m.endBarStyle === "Double" || m.endBarStyle === "SectionOpen") {
        rightBarParts.push(`<bar-style>light-light</bar-style>`);
      } else if (m.endBarStyle === "SectionClose" || isFinalMeasure) {
        rightBarParts.push(`<bar-style>light-heavy</bar-style>`);
      }
      // ending 종료: 다음 마디에 endingNumber 가 없거나 다르면 stop
      if (m.endingNumber && (!nextMeasure || nextMeasure.endingNumber !== m.endingNumber)) {
        rightBarParts.push(`<ending number="${m.endingNumber}" type="stop"/>`);
      }
      if (rightBarParts.length > 0) {
        lines.push(`      <barline location="right">${rightBarParts.join("")}</barline>`);
      }
      lines.push(`    </measure>`);
    }

    lines.push(`  </part>`);
  }

  lines.push("</score-partwise>");
  return lines.join("\n");
}
