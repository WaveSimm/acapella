// 업로드된 악보 파일(NWC 또는 MusicXML)을 형식 자동 판별 후 ParsedScore 로 변환.
// 업로드 라우트와 재변환 라우트가 공용으로 사용한다.
import type { ParsedScore } from "./nwc/parser";
import { parseNwc } from "./nwc/parser";
import { parseMusicXml } from "./musicxml/parse-musicxml";

export type ScoreFormat = "nwc" | "musicxml";

export const SCORE_FILE_EXT_RE = /\.(nwc|nwctxt|xml|musicxml|mxl)$/i;

export function detectScoreFormat(buf: Buffer, fileName?: string): ScoreFormat | null {
  const head = buf.toString("ascii", 0, Math.min(64, buf.length));
  if (head.startsWith("[NWZ]") || head.startsWith("!NoteWorthyComposer")) return "nwc";
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b) return "musicxml"; // "PK" — .mxl (ZIP)
  // XML 텍스트 스니핑 (BOM/선언/루트 태그) — UTF-16LE BOM 이면 해당 인코딩으로
  const isUtf16 = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xfe;
  const sniff = buf.toString(isUtf16 ? "utf16le" : "utf8", 0, Math.min(2048, buf.length));
  if (/<score-(partwise|timewise)/.test(sniff) || /^﻿?\s*<\?xml/.test(sniff)) return "musicxml";
  if (fileName) {
    if (/\.(nwc|nwctxt)$/i.test(fileName)) return "nwc";
    if (/\.(xml|musicxml|mxl)$/i.test(fileName)) return "musicxml";
  }
  return null;
}

export function parseScoreFile(buf: Buffer, fileName?: string): { parsed: ParsedScore; format: ScoreFormat } {
  const format = detectScoreFormat(buf, fileName);
  if (format === "nwc") return { parsed: parseNwc(buf), format };
  if (format === "musicxml") return { parsed: parseMusicXml(buf), format };
  throw new Error("지원하지 않는 악보 형식입니다. (.nwc, .nwctxt, .musicxml, .xml, .mxl 지원)");
}
