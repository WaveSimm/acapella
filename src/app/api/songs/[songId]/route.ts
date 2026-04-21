import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  titleKo: z.string().min(1).max(200).optional(),
  titleEn: z.string().max(200).nullable().optional(),
  composer: z.string().max(200).nullable().optional(),
  arranger: z.string().max(200).nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { songId: string } },
) {
  const song = await prisma.song.findUnique({
    where: { id: params.songId },
    include: {
      resources: { orderBy: { part: "asc" } },
      specs: {
        where: { isPublic: true },
        include: { conductor: { select: { id: true, name: true } } },
      },
    },
  });
  if (!song) return NextResponse.json({ error: "곡을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(song);
}

// 누구나 편집 (곡은 공용 자원). Admin-only로 좁힐 수 있음.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { songId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const updated = await prisma.song.update({
    where: { id: params.songId },
    data: {
      ...(parsed.data.titleKo !== undefined && { titleKo: parsed.data.titleKo }),
      ...(parsed.data.titleEn !== undefined && { titleEn: parsed.data.titleEn }),
      ...(parsed.data.composer !== undefined && { composer: parsed.data.composer }),
      ...(parsed.data.arranger !== undefined && { arranger: parsed.data.arranger }),
      ...(parsed.data.pageNumber !== undefined && { pageNumber: parsed.data.pageNumber }),
    },
  });
  return NextResponse.json(updated);
}

// 곡 삭제 (admin 전용)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { songId: string } },
) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const [specCount, resCount, esCount, rsCount] = await Promise.all([
    prisma.conductorSpec.count({ where: { songId: params.songId } }),
    prisma.practiceResource.count({ where: { songId: params.songId } }),
    prisma.ensembleSong.count({ where: { songId: params.songId } }),
    prisma.rehearsalSong.count({ where: { songId: params.songId } }),
  ]);
  const problems: string[] = [];
  if (specCount > 0) problems.push(`분석 ${specCount}`);
  if (resCount > 0) problems.push(`리소스 ${resCount}`);
  if (esCount > 0) problems.push(`합창단 등록 ${esCount}`);
  if (rsCount > 0) problems.push(`연습일 등록 ${rsCount}`);
  if (problems.length > 0) {
    return NextResponse.json(
      { error: `${problems.join(", ")}건이 연결되어 있어 삭제할 수 없습니다.` },
      { status: 409 },
    );
  }

  await prisma.song.delete({ where: { id: params.songId } });
  return NextResponse.json({ success: true });
}
