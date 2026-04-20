import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  songId: z.string().min(1),
  part: z.string().trim().min(1).max(30).default("전체"),
  url: z.string().min(1),
  label: z.string().max(100).nullable().optional(),
  resourceType: z.enum(["VIDEO", "AUDIO", "SCORE_PREVIEW", "MIDI"]).optional(),
  fileId: z.string().nullable().optional(),
});

function detectType(url: string): "VIDEO" | "AUDIO" | "SCORE_PREVIEW" | "MIDI" {
  const isYT = url.includes("youtube.com") || url.includes("youtu.be");
  if (isYT) return "VIDEO";
  if (/\.(mid|midi)(\?.*)?$/i.test(url)) return "MIDI";
  if (/\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(url)) return "AUDIO";
  if (/\.pdf(\?.*)?$/i.test(url)) return "SCORE_PREVIEW";
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

  // 업로드 파일이면 본인이 올린 건지 + mimeType 기반 자동 분류
  let linkedFile: { id: string; mimeType: string } | null = null;
  if (parsed.data.fileId) {
    const f = await prisma.uploadedFile.findUnique({
      where: { id: parsed.data.fileId },
      select: { id: true, mimeType: true, conductorId: true, resource: { select: { id: true } } },
    });
    if (!f) return NextResponse.json({ error: "업로드 파일을 찾을 수 없습니다." }, { status: 404 });
    if (f.conductorId && f.conductorId !== user.id) {
      return NextResponse.json({ error: "내 파일만 연결할 수 있습니다." }, { status: 403 });
    }
    if (f.resource) {
      return NextResponse.json({ error: "이미 다른 리소스에 연결된 파일입니다." }, { status: 409 });
    }
    linkedFile = { id: f.id, mimeType: f.mimeType };
  }

  const url = linkedFile ? `/api/files/${linkedFile.id}` : rewriteDriveShareUrl(parsed.data.url);
  const MIDI_MIMES = new Set(["audio/midi", "audio/x-midi", "audio/mid", "application/x-midi"]);
  const autoType = linkedFile
    ? (linkedFile.mimeType === "application/pdf" ? "SCORE_PREVIEW"
       : MIDI_MIMES.has(linkedFile.mimeType) ? "MIDI"
       : linkedFile.mimeType.startsWith("audio/") ? "AUDIO"
       : "VIDEO")
    : detectType(url);
  const resourceType = parsed.data.resourceType ?? autoType;

  const resource = await prisma.practiceResource.create({
    data: {
      songId: parsed.data.songId,
      conductorId: user.id,
      part: parsed.data.part,
      resourceType,
      url,
      label: parsed.data.label || null,
      sourceSite: linkedFile ? "업로드" : url.includes("drive.google.com") ? "Google Drive" : "user",
      fileId: linkedFile?.id ?? null,
    },
  });
  return NextResponse.json({ resource }, { status: 201 });
}
