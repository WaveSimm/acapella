import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } },
) {
  const file = await prisma.uploadedFile.findUnique({
    where: { id: params.fileId },
    select: {
      fileName: true,
      mimeType: true,
      size: true,
      data: true,
      conductorId: true,
      resource: {
        select: {
          song: {
            select: {
              ensembles: {
                select: { ensemble: { select: { shareCode: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!file) return new NextResponse("Not found", { status: 404 });

  // 접근 허용 조건:
  //  1) 파일 업로더 본인
  //  2) 곡이 속한 합창단의 지휘자 본인
  //  3) 요청 시점에 해당 합창단의 shareCode를 referer가 가리키는 단원 접근
  const user = await getSessionUser();
  const shareCodes = file.resource?.song.ensembles.map((e) => e.ensemble.shareCode) ?? [];
  const referer = request.headers.get("referer") ?? "";
  const refererMatches = shareCodes.some((code) => referer.includes(`/c/${code}`));
  const isOwner = !!user && file.conductorId === user.id;
  const isAdmin = user?.role === "ADMIN";
  const isConductorOfLinkedEnsemble =
    !!user &&
    shareCodes.length > 0 &&
    (await prisma.ensemble.count({
      where: { shareCode: { in: shareCodes }, conductorId: user.id },
    })) > 0;

  if (!isOwner && !isAdmin && !isConductorOfLinkedEnsemble && !refererMatches) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const buf = file.data as Buffer;
  const body = new Uint8Array(buf);

  // RFC 5987: non-ASCII 파일명은 filename*=UTF-8''... 로
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  // XML/MusicXML은 charset 명시해 브라우저가 항상 UTF-8로 파싱
  const isXml = /xml/i.test(file.mimeType);
  const contentType = isXml ? `${file.mimeType}; charset=utf-8` : file.mimeType;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(file.size),
      "content-disposition": disposition,
      "cache-control": "private, max-age=3600",
    },
  });
}
