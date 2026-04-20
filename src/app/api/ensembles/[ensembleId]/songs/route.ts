import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const addSchema = z.object({
  songId: z.string().min(1),
  note: z.string().max(500).nullable().optional(),
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

// 합창단 곡 추가
export async function POST(
  request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.ensembleId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = addSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  // 이미 있으면 409
  const existing = await prisma.ensembleSong.findUnique({
    where: { ensembleId_songId: { ensembleId: params.ensembleId, songId: parsed.data.songId } },
  });
  if (existing) return NextResponse.json({ error: "이미 등록된 곡입니다." }, { status: 409 });

  // 마지막 순서 + 1
  const last = await prisma.ensembleSong.findFirst({
    where: { ensembleId: params.ensembleId },
    orderBy: { orderIdx: "desc" },
    select: { orderIdx: true },
  });

  const es = await prisma.ensembleSong.create({
    data: {
      ensembleId: params.ensembleId,
      songId: parsed.data.songId,
      note: parsed.data.note ?? null,
      orderIdx: (last?.orderIdx ?? -1) + 1,
    },
  });
  return NextResponse.json(es, { status: 201 });
}

// 순서 일괄 변경: body { order: [{ id, orderIdx }] }
const reorderSchema = z.object({
  order: z.array(z.object({ id: z.string(), orderIdx: z.number().int() })),
});

export async function PATCH(
  request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.ensembleId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  await prisma.$transaction(
    parsed.data.order.map((o) =>
      prisma.ensembleSong.update({
        where: { id: o.id },
        data: { orderIdx: o.orderIdx },
      }),
    ),
  );
  return NextResponse.json({ success: true });
}
