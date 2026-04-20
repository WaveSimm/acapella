import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const patchSchema = z.object({
  part: z.enum(["ALL", "SOPRANO", "ALTO", "TENOR", "BASS"]).optional(),
  url: z.string().url().optional(),
  label: z.string().max(100).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { resourceId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const resource = await prisma.practiceResource.findUnique({ where: { id: params.resourceId } });
  if (!resource) return NextResponse.json({ error: "리소스를 찾을 수 없습니다." }, { status: 404 });
  if (resource.conductorId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });

  await prisma.practiceResource.update({
    where: { id: params.resourceId },
    data: {
      ...(parsed.data.part !== undefined && { part: parsed.data.part }),
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
      ...(parsed.data.label !== undefined && { label: parsed.data.label }),
    },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { resourceId: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const resource = await prisma.practiceResource.findUnique({ where: { id: params.resourceId } });
  if (!resource) return NextResponse.json({ error: "리소스를 찾을 수 없습니다." }, { status: 404 });
  if (resource.conductorId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  // 파일 기반 리소스면 업로드 파일도 같이 삭제
  await prisma.$transaction(async (tx) => {
    await tx.practiceResource.delete({ where: { id: params.resourceId } });
    if (resource.fileId) {
      await tx.uploadedFile.delete({ where: { id: resource.fileId } }).catch(() => null);
    }
  });
  return NextResponse.json({ success: true });
}
