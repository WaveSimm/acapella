import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { driveFileUrl } from "@/lib/drive-api";
import { z } from "zod";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  files: z
    .array(
      z.object({
        fileId: z.string().min(1),
        name: z.string().min(1),
        part: z.string().min(1).max(30),
        mimeType: z.string().min(1),
      }),
    )
    .min(1),
});

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
  request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const ensemble = await prisma.ensemble.findUnique({
    where: { id: params.ensembleId },
    select: { id: true, conductorId: true },
  });
  if (!ensemble) return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (ensemble.conductorId !== user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
  }

  const { title, files } = parsed.data;

  // 기존 동일 제목 Song 있으면 재사용, 없으면 생성
  let song = await prisma.song.findFirst({
    where: { titleKo: title },
    select: { id: true, titleKo: true },
  });
  if (!song) {
    song = await prisma.song.create({
      data: { titleKo: title },
      select: { id: true, titleKo: true },
    });
  }

  // EnsembleSong upsert — 이미 레파토리에 있으면 스킵
  const existingLink = await prisma.ensembleSong.findUnique({
    where: { ensembleId_songId: { ensembleId: ensemble.id, songId: song.id } },
    select: { id: true },
  });
  if (!existingLink) {
    const maxOrder = await prisma.ensembleSong.aggregate({
      where: { ensembleId: ensemble.id },
      _max: { orderIdx: true },
    });
    await prisma.ensembleSong.create({
      data: {
        ensembleId: ensemble.id,
        songId: song.id,
        orderIdx: (maxOrder._max.orderIdx ?? -1) + 1,
      },
    });
  }

  // 중복 방지: 이미 등록된 Drive URL 스킵
  const existing = await prisma.practiceResource.findMany({
    where: { songId: song.id, sourceSite: "Google Drive" },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((r) => r.url));

  let created = 0;
  for (const f of files) {
    const url = driveFileUrl(f.fileId);
    if (existingUrls.has(url)) continue;
    await prisma.practiceResource.create({
      data: {
        songId: song.id,
        conductorId: user.id,
        part: f.part,
        url,
        resourceType: detectType(url, f.mimeType),
        sourceSite: "Google Drive",
        label: f.name,
      },
    });
    existingUrls.add(url);
    created++;
  }

  return NextResponse.json({
    songId: song.id,
    songTitle: song.titleKo,
    created,
  });
}
