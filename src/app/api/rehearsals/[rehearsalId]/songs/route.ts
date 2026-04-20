import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const addSchema = z.object({
  songId: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
});

async function verifyOwner(rehearsalId: string, userId: string) {
  const r = await prisma.rehearsal.findUnique({
    where: { id: rehearsalId },
    include: { ensemble: { select: { conductorId: true } } },
  });
  if (!r) return "NOT_FOUND";
  if (r.ensemble.conductorId !== userId) return "FORBIDDEN";
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: { rehearsalId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.rehearsalId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "연습일을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = addSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const existing = await prisma.rehearsalSong.findUnique({
    where: { rehearsalId_songId: { rehearsalId: params.rehearsalId, songId: parsed.data.songId } },
  });
  if (existing) return NextResponse.json({ error: "이미 추가된 곡입니다." }, { status: 409 });

  const last = await prisma.rehearsalSong.findFirst({
    where: { rehearsalId: params.rehearsalId },
    orderBy: { orderIdx: "desc" },
    select: { orderIdx: true },
  });

  const rs = await prisma.rehearsalSong.create({
    data: {
      rehearsalId: params.rehearsalId,
      songId: parsed.data.songId,
      note: parsed.data.note ?? null,
      orderIdx: (last?.orderIdx ?? -1) + 1,
    },
  });
  return NextResponse.json(rs, { status: 201 });
}
