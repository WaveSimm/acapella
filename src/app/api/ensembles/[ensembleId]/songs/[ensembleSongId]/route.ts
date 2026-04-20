import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  note: z.string().max(500).nullable().optional(),
  orderIdx: z.number().int().optional(),
});

async function verifyAccess(ensembleSongId: string, userId: string) {
  const es = await prisma.ensembleSong.findUnique({
    where: { id: ensembleSongId },
    include: { ensemble: { select: { conductorId: true } } },
  });
  if (!es) return { error: "NOT_FOUND" as const };
  if (es.ensemble.conductorId !== userId) return { error: "FORBIDDEN" as const };
  return { es };
}

export async function PATCH(
  request: Request,
  { params }: { params: { ensembleSongId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyAccess(params.ensembleSongId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "연결된 곡을 찾을 수 없습니다." : "수정 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const updated = await prisma.ensembleSong.update({
    where: { id: params.ensembleSongId },
    data: {
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      ...(parsed.data.orderIdx !== undefined && { orderIdx: parsed.data.orderIdx }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { ensembleSongId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyAccess(params.ensembleSongId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "연결된 곡을 찾을 수 없습니다." : "삭제 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  await prisma.ensembleSong.delete({ where: { id: params.ensembleSongId } });
  return NextResponse.json({ success: true });
}
