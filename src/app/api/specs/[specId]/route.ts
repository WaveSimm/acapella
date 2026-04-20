import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { specId: string } },
) {
  const user = await getSessionUser();
  const spec = await prisma.conductorSpec.findUnique({
    where: { id: params.specId },
    include: {
      song: { select: { id: true, titleKo: true } },
      conductor: { select: { id: true, name: true } },
    },
  });
  if (!spec) return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  if (!spec.isPublic && spec.conductorId !== user?.id) {
    return NextResponse.json({ error: "열람 권한이 없습니다." }, { status: 403 });
  }
  return NextResponse.json(spec);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { specId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const spec = await prisma.conductorSpec.findUnique({ where: { id: params.specId } });
  if (!spec) return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  if (spec.conductorId !== user.id) return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  const updated = await prisma.conductorSpec.update({
    where: { id: params.specId },
    data: {
      ...(parsed.data.keySignature !== undefined && { keySignature: parsed.data.keySignature }),
      ...(parsed.data.timeSignature !== undefined && { timeSignature: parsed.data.timeSignature }),
      ...(parsed.data.tempo !== undefined && { tempo: parsed.data.tempo }),
      ...(parsed.data.difficulty !== undefined && { difficulty: parsed.data.difficulty }),
      ...(parsed.data.voicing !== undefined && { voicing: parsed.data.voicing }),
      ...(parsed.data.measures !== undefined && { measures: parsed.data.measures }),
      ...(parsed.data.highestNote !== undefined && { highestNote: parsed.data.highestNote }),
      ...(parsed.data.soloInfo !== undefined && { soloInfo: parsed.data.soloInfo }),
      ...(parsed.data.theme !== undefined && { theme: parsed.data.theme }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.isPublic !== undefined && { isPublic: parsed.data.isPublic }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { specId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const spec = await prisma.conductorSpec.findUnique({ where: { id: params.specId } });
  if (!spec) return NextResponse.json({ error: "분석을 찾을 수 없습니다." }, { status: 404 });
  if (spec.conductorId !== user.id) return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });

  await prisma.conductorSpec.delete({ where: { id: params.specId } });
  return NextResponse.json({ success: true });
}
