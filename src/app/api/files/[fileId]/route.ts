import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const file = await prisma.uploadedFile.findUnique({
    where: { id: params.fileId },
    select: { fileName: true, mimeType: true, size: true, data: true },
  });
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Prisma returns Bytes as Buffer; convert to Uint8Array with a fresh
  // ArrayBuffer so TS's BodyInit expectation is satisfied.
  const buf = file.data as Buffer;
  const body = new Uint8Array(buf);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": file.mimeType,
      "content-length": String(file.size),
      // 원본 파일명으로 저장되게 inline disposition (다운로드는 브라우저에서 우클릭 저장으로)
      "content-disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "cache-control": "public, max-age=86400",
    },
  });
}
