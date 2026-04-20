import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

async function verifyOwner(ensembleId: string, userId: string) {
  const ens = await prisma.ensemble.findUnique({
    where: { id: ensembleId },
    select: { conductorId: true },
  });
  if (!ens) return "NOT_FOUND";
  if (ens.conductorId !== userId) return "FORBIDDEN";
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.ensembleId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const updated = await prisma.ensemble.update({
    where: { id: params.ensembleId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.ensembleId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });

  // EnsembleSong은 onDelete: Cascade로 자동 제거
  await prisma.ensemble.delete({ where: { id: params.ensembleId } });
  return NextResponse.json({ success: true });
}
