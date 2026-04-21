import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { parseNwc } from "@/lib/nwc/parser";
import { buildMidi } from "@/lib/nwc/to-midi";
import { buildMusicXml } from "@/lib/nwc/to-musicxml";

export const runtime = "nodejs";

const MAX_SIZE = 4 * 1024 * 1024;

interface NwcBody {
  songId: string;
}

// Body: multipart with fields `file` (.nwc) + `songId`
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const songId = form.get("songId");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "NWC 파일이 없습니다." }, { status: 400 });
  }
  if (typeof songId !== "string" || !songId) {
    return NextResponse.json({ error: "songId가 필요합니다." }, { status: 400 });
  }
  if (!/\.(nwc|nwctxt)$/i.test(file.name)) {
    return NextResponse.json({ error: "NWC 파일(.nwc 또는 .nwctxt)만 업로드 가능합니다." }, { status: 415 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `파일이 너무 큽니다. 최대 ${MAX_SIZE / 1024 / 1024}MB.` }, { status: 413 });
  }

  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true, titleKo: true } });
  if (!song) return NextResponse.json({ error: "곡을 찾을 수 없습니다." }, { status: 404 });

  const buf = Buffer.from(await file.arrayBuffer());

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

  const baseName = file.name.replace(/\.(nwc|nwctxt)$/i, "");

  // UploadedFile + PracticeResource를 한 트랜잭션으로
  const result = await prisma.$transaction(async (tx) => {
    // 원본 NWC 저장
    const nwcFile = await tx.uploadedFile.create({
      data: {
        fileName: file.name,
        mimeType: "application/x-nwc",
        size: buf.length,
        data: buf,
        conductorId: user.id,
      },
    });
    // 생성된 MIDI 저장 + PracticeResource
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
    // 생성된 MusicXML 저장 + PracticeResource (SCORE_PREVIEW 타입 사용, 악보)
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
    return { nwcFile, midiFile, midiResource, xmlFile, xmlResource };
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
    nwcFile: { id: result.nwcFile.id, size: result.nwcFile.size },
  }, { status: 201 });
}
