import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { parseNwc } from "@/lib/nwc/parser";
import { buildMidi } from "@/lib/nwc/to-midi";
import { buildMusicXml } from "@/lib/nwc/to-musicxml";

export const runtime = "nodejs";

// 저장된 원본 NWC 로 MIDI/MusicXML 재변환 (변환 코드 업데이트 후 사용).
// Body: { songId: string }
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const songId = body?.songId;
  if (typeof songId !== "string" || !songId) {
    return NextResponse.json({ error: "songId가 필요합니다." }, { status: 400 });
  }

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, titleKo: true, nwcFileId: true, nwcFile: { select: { id: true, fileName: true, data: true } } },
  });
  if (!song) return NextResponse.json({ error: "곡을 찾을 수 없습니다." }, { status: 404 });
  if (!song.nwcFile) {
    return NextResponse.json({ error: "원본 NWC 파일이 저장되어 있지 않습니다. 업로드부터 진행해주세요." }, { status: 404 });
  }

  const buf = Buffer.from(song.nwcFile.data);

  let parsed;
  try {
    parsed = parseNwc(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "NWC 파싱 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let midiBuf: Buffer;
  let musicXml: string;
  try {
    midiBuf = buildMidi(parsed);
    musicXml = buildMusicXml(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "변환 실패";
    return NextResponse.json({ error: "NWC → MIDI/MusicXML 변환 실패: " + msg }, { status: 500 });
  }

  const baseName = (song.nwcFile.fileName || "score").replace(/\.(nwc|nwctxt)$/i, "");

  const result = await prisma.$transaction(async (tx) => {
    // 기존 "NWC 변환" 리소스 삭제 (NWC 원본은 보존)
    const oldRes = await tx.practiceResource.findMany({
      where: { songId: song.id, sourceSite: "NWC 변환" },
      select: { id: true, fileId: true },
    });
    if (oldRes.length > 0) {
      await tx.practiceResource.deleteMany({ where: { id: { in: oldRes.map((r) => r.id) } } });
      const fileIds = oldRes.map((r) => r.fileId).filter((x): x is string => !!x);
      if (fileIds.length > 0) {
        await tx.uploadedFile.deleteMany({ where: { id: { in: fileIds } } });
      }
    }

    const midiFile = await tx.uploadedFile.create({
      data: {
        fileName: `${baseName}.mid`,
        mimeType: "audio/midi",
        size: midiBuf.length,
        data: midiBuf,
        conductorId: user.id,
      },
    });
    const midiResource = await tx.practiceResource.create({
      data: {
        songId: song.id,
        conductorId: user.id,
        part: "전체",
        url: `/api/files/${midiFile.id}`,
        resourceType: "MIDI",
        sourceSite: "NWC 변환",
        label: `${song.titleKo} (NWC→MIDI 전체)`,
        fileId: midiFile.id,
      },
    });

    const xmlBuf = Buffer.from(musicXml, "utf-8");
    const xmlFile = await tx.uploadedFile.create({
      data: {
        fileName: `${baseName}.musicxml`,
        mimeType: "application/vnd.recordare.musicxml+xml",
        size: xmlBuf.length,
        data: xmlBuf,
        conductorId: user.id,
      },
    });
    const xmlResource = await tx.practiceResource.create({
      data: {
        songId: song.id,
        conductorId: user.id,
        part: "전체",
        url: `/api/files/${xmlFile.id}`,
        resourceType: "SCORE_PREVIEW",
        sourceSite: "NWC 변환",
        label: `${song.titleKo} (NWC→악보)`,
        fileId: xmlFile.id,
      },
    });
    return { midiFile, midiResource, xmlFile, xmlResource };
  });

  return NextResponse.json({
    parsed: {
      title: parsed.songTitle,
      composer: parsed.composer,
      tempo: parsed.tempo,
      timeSig: parsed.timeSig,
      fifths: parsed.fifths,
      staves: parsed.staves.map((s) => ({ name: s.name, clef: s.clef, measures: s.measures.length })),
    },
    midiFile: { id: result.midiFile.id, size: result.midiFile.size, resourceId: result.midiResource.id },
    musicXmlFile: { id: result.xmlFile.id, size: result.xmlFile.size, resourceId: result.xmlResource.id },
  }, { status: 200 });
}
