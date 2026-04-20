import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  note: z.string().max(500).nullable().optional(),
  orderIdx: z.number().int().optional(),
});

async function verifyAccess(rehearsalSongId: string, userId: string) {
  const rs = await prisma.rehearsalSong.findUnique({
    where: { id: rehearsalSongId },
    include: { rehearsal: { include: { ensemble: { select: { conductorId: true } } } } },
  });
  if (!rs) return { error: "NOT_FOUND" as const };
  if (rs.rehearsal.ensemble.conductorId !== userId) return { error: "FORBIDDEN" as const };
  return { rs };
}

export async function PATCH(
  request: Request,
  { params }: { params: { rehearsalSongId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyAccess(params.rehearsalSongId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "찾을 수 없습니다." : "수정 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const updated = await prisma.rehearsalSong.update({
    where: { id: params.rehearsalSongId },
    data: {
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      ...(parsed.data.orderIdx !== undefined && { orderIdx: parsed.data.orderIdx }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { rehearsalSongId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyAccess(params.rehearsalSongId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "찾을 수 없습니다." : "삭제 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  await prisma.rehearsalSong.delete({ where: { id: params.rehearsalSongId } });
  return NextResponse.json({ success: true });
}
