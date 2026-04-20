import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  songId: z.string().min(1),
  part: z.enum(["ALL", "SOPRANO", "ALTO", "TENOR", "BASS"]).default("ALL"),
  url: z.string().url().min(1),
  label: z.string().max(100).nullable().optional(),
});

function detectType(url: string): "VIDEO" | "AUDIO" {
  const isYT = url.includes("youtube.com") || url.includes("youtu.be");
  if (isYT) return "VIDEO";
  if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url)) return "AUDIO";
  // Google Drive download URL: AUDIO로 가정
  if (/drive\.google\.com\/uc\?.*export=download/i.test(url)) return "AUDIO";
  return "VIDEO";
}

function rewriteDriveShareUrl(url: string): string {
  // drive.google.com/file/d/{ID}/view → drive.google.com/uc?export=download&id={ID}
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return url;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const song = await prisma.song.findUnique({ where: { id: parsed.data.songId }, select: { id: true } });
  if (!song) return NextResponse.json({ error: "곡을 찾을 수 없습니다." }, { status: 404 });

  const url = rewriteDriveShareUrl(parsed.data.url);
  const resourceType = detectType(url);

  const resource = await prisma.practiceResource.create({
    data: {
      songId: parsed.data.songId,
      conductorId: user.id,
      part: parsed.data.part,
      resourceType,
      url,
      label: parsed.data.label || null,
      sourceSite: url.includes("drive.google.com") ? "Google Drive" : "user",
    },
  });
  return NextResponse.json({ resource }, { status: 201 });
}
