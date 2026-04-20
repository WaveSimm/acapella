import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";

const MAX_SIZE = 4 * 1024 * 1024; // 4MB (Vercel Serverless body limit 내)

const ALLOWED_MIME_PREFIXES = ["audio/"];
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/x-midi",
  "application/vnd.apple.mpegurl",
]);

function isAllowed(mime: string): boolean {
  if (ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return false;
}

function guessMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mid":
    case "midi": return "audio/midi";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "ogg": return "audio/ogg";
    case "pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "빈 파일입니다." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `파일이 너무 큽니다. 최대 ${MAX_SIZE / 1024 / 1024}MB.` }, { status: 413 });
  }

  // 확장자 기반 추론을 우선 (브라우저는 .mid를 audio/mid로 보내는 등 비표준 mime이 많음)
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const guessed = guessMimeFromName(file.name);
  const mime =
    ["mid", "midi", "mp3", "wav", "m4a", "ogg", "pdf"].includes(ext)
      ? guessed
      : file.type || guessed;
  if (!isAllowed(mime)) {
    return NextResponse.json({ error: `지원하지 않는 파일 타입입니다: ${mime}` }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploaded = await prisma.uploadedFile.create({
    data: {
      fileName: file.name,
      mimeType: mime,
      size: file.size,
      data: buffer,
      conductorId: user.id,
    },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });

  return NextResponse.json({
    id: uploaded.id,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    url: `/api/files/${uploaded.id}`,
  }, { status: 201 });
}
