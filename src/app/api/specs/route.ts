import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  songId: z.string().min(1),
  keySignature: z.string().max(200).nullable().optional(),
  timeSignature: z.string().max(100).nullable().optional(),
  tempo: z.string().max(200).nullable().optional(),
  difficulty: z.enum(["EASY", "BELOW_MID", "MEDIUM", "ABOVE_MID", "HARD"]).nullable().optional(),
  voicing: z.string().max(50).nullable().optional(),
  measures: z.number().int().positive().nullable().optional(),
  highestNote: z.string().max(30).nullable().optional(),
  soloInfo: z.string().max(100).nullable().optional(),
  theme: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() }, { status: 400 });

  // 이미 있으면 409
  const existing = await prisma.conductorSpec.findUnique({
    where: { songId_conductorId: { songId: parsed.data.songId, conductorId: user.id } },
  });
  if (existing) return NextResponse.json({ error: "이미 이 곡에 대한 분석이 있습니다." }, { status: 409 });

  const spec = await prisma.conductorSpec.create({
    data: {
      songId: parsed.data.songId,
      conductorId: user.id,
      keySignature: parsed.data.keySignature ?? null,
      timeSignature: parsed.data.timeSignature ?? null,
      tempo: parsed.data.tempo ?? null,
      difficulty: parsed.data.difficulty ?? null,
      voicing: parsed.data.voicing ?? null,
      measures: parsed.data.measures ?? null,
      highestNote: parsed.data.highestNote ?? null,
      soloInfo: parsed.data.soloInfo ?? null,
      theme: parsed.data.theme ?? null,
      notes: parsed.data.notes ?? null,
      isPublic: parsed.data.isPublic ?? false,
    },
  });
  return NextResponse.json(spec, { status: 201 });
}
