import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApprovedUser } from "@/lib/auth-helpers";
import { z } from "zod";

function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
});

// 내 합창단 목록
export async function GET() {
  let user;
  try { user = await requireApprovedUser(); } catch { return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); }

  const ensembles = await prisma.ensemble.findMany({
    where: { conductorId: user.id },
    include: { _count: { select: { songs: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(ensembles);
}

// 새 합창단
export async function POST(request: Request) {
  let user;
  try { user = await requireApprovedUser(); } catch { return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }); }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  // shareCode 유니크 재시도
  for (let attempt = 0; attempt < 5; attempt++) {
    const shareCode = generateShareCode();
    try {
      const ens = await prisma.ensemble.create({
        data: {
          conductorId: user.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          shareCode,
        },
      });
      return NextResponse.json(ens, { status: 201 });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") continue;
      throw err;
    }
  }
  return NextResponse.json({ error: "shareCode 생성 실패. 다시 시도해주세요." }, { status: 500 });
}
