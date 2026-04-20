import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().nullable().optional(),   // "YYYY-MM-DD" or null
  startTime: z.string().max(20).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
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

export async function POST(
  request: Request,
  { params }: { params: { ensembleId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const err = await verifyOwner(params.ensembleId, user.id);
  if (err === "NOT_FOUND") return NextResponse.json({ error: "합창단을 찾을 수 없습니다." }, { status: 404 });
  if (err === "FORBIDDEN") return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const rehearsal = await prisma.rehearsal.create({
    data: {
      ensembleId: params.ensembleId,
      date: parsed.data.date ? new Date(parsed.data.date) : null,
      startTime: parsed.data.startTime ?? null,
      location: parsed.data.location ?? null,
      note: parsed.data.note ?? null,
    },
  });
  return NextResponse.json(rehearsal, { status: 201 });
}
