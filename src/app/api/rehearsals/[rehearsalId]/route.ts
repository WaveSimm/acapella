import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  date: z.string().nullable().optional(),
  startTime: z.string().max(20).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

async function verifyOwner(rehearsalId: string, userId: string) {
  const r = await prisma.rehearsal.findUnique({
    where: { id: rehearsalId },
    include: { ensemble: { select: { conductorId: true } } },
  });
  if (!r) return { error: "NOT_FOUND" as const };
  if (r.ensemble.conductorId !== userId) return { error: "FORBIDDEN" as const };
  return { rehearsal: r };
}

export async function PATCH(
  request: Request,
  { params }: { params: { rehearsalId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyOwner(params.rehearsalId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "연습일을 찾을 수 없습니다." : "수정 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const updated = await prisma.rehearsal.update({
    where: { id: params.rehearsalId },
    data: {
      ...(parsed.data.date !== undefined && {
        date: parsed.data.date ? new Date(parsed.data.date) : null,
      }),
      ...(parsed.data.startTime !== undefined && { startTime: parsed.data.startTime }),
      ...(parsed.data.location !== undefined && { location: parsed.data.location }),
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { rehearsalId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const check = await verifyOwner(params.rehearsalId, user.id);
  if ("error" in check) {
    return NextResponse.json(
      { error: check.error === "NOT_FOUND" ? "연습일을 찾을 수 없습니다." : "삭제 권한이 없습니다." },
      { status: check.error === "NOT_FOUND" ? 404 : 403 },
    );
  }

  await prisma.rehearsal.delete({ where: { id: params.rehearsalId } });
  return NextResponse.json({ success: true });
}
