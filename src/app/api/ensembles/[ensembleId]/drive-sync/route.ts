import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { listDriveFiles, driveFileUrl } from "@/lib/drive-api";
import { parseFileName, matchSong } from "@/lib/drive-sync";

function detectType(url: string, mimeType?: string): "VIDEO" | "AUDIO" | "MIDI" {
  if (mimeType) {
    if (mimeType.startsWith("video/")) return "VIDEO";
    if (mimeType === "audio/midi" || mimeType === "audio/x-midi" || mimeType === "audio/mid") return "MIDI";
    if (mimeType.startsWith("audio/")) return "AUDIO";
  }
  if (/\.(mid|midi)(\?.*)?$/i.test(url)) return "MIDI";
  if (/\.(mp4|mov)(\?.*)?$/i.test(url)) return "VIDEO";
  return "AUDIO";
}

export async function POST(
  _request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ensemble = await prisma.ensemble.findUnique({
    where: { id: params.ensembleId },
    select: { id: true, conductorId: true, driveFolderId: true },
  });
  if (!ensemble) return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (ensemble.conductorId !== user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!ensemble.driveFolderId) {
    return NextResponse.json(
      { error: "Drive 폴더 URL을 먼저 설정해주세요." },
      { status: 400 },
    );
  }

  let files;
  try {
    files = await listDriveFiles(ensemble.driveFolderId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Drive 호출 오류";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 합창단 레파토리 곡만 대상으로
  const songs = await prisma.song.findMany({
    where: { ensembles: { some: { ensembleId: ensemble.id } } },
    select: { id: true, titleKo: true, titleEn: true },
  });

  // 이미 등록된 Drive URL (중복 방지) — 이 합창단의 곡들에 등록된 리소스만 체크
  const songIds = songs.map((s) => s.id);
  const existing = songIds.length
    ? await prisma.practiceResource.findMany({
        where: { songId: { in: songIds }, sourceSite: "Google Drive" },
        select: { url: true },
      })
    : [];
  const existingUrls = new Set(existing.map((r) => r.url));

  let created = 0;
  let skipped = 0;
  const unmatched: {
    fileId: string;
    name: string;
    parsedTitle: string;
    parsedPart: string;
    mimeType: string;
  }[] = [];
  const createdItems: { name: string; song: string; part: string }[] = [];

  for (const file of files) {
    const parsed = parseFileName(file.name);
    if (!parsed) {
      unmatched.push({
        fileId: file.id,
        name: file.name,
        parsedTitle: file.name,
        parsedPart: "전체",
        mimeType: file.mimeType,
      });
      continue;
    }
    const song = matchSong(songs, parsed.title);
    if (!song) {
      unmatched.push({
        fileId: file.id,
        name: file.name,
        parsedTitle: parsed.title,
        parsedPart: parsed.part,
        mimeType: file.mimeType,
      });
      continue;
    }
    const url = driveFileUrl(file.id);
    if (existingUrls.has(url)) {
      skipped++;
      continue;
    }
    const resourceType = detectType(url, file.mimeType);
    await prisma.practiceResource.create({
      data: {
        songId: song.id,
        conductorId: user.id,
        part: parsed.part,
        url,
        resourceType,
        sourceSite: "Google Drive",
        label: file.name,
      },
    });
    existingUrls.add(url);
    created++;
    createdItems.push({ name: file.name, song: song.titleKo, part: parsed.part });
  }

  // 미매칭 파일을 파싱된 제목으로 그룹핑
  const groupMap = new Map<string, typeof unmatched>();
  for (const u of unmatched) {
    const key = u.parsedTitle.trim().toLowerCase();
    const list = groupMap.get(key);
    if (list) list.push(u);
    else groupMap.set(key, [u]);
  }
  const unmatchedGroups = Array.from(groupMap.entries()).map(([, files]) => ({
    title: files[0].parsedTitle,
    files,
  }));

  return NextResponse.json({
    totalFiles: files.length,
    created,
    skipped,
    failed: unmatched.length,
    unmatchedGroups,
    createdItems,
  });
}
