import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }); }

  const users = await prisma.conductor.findMany({
    select: {
      id: true, name: true, email: true, role: true, isApproved: true,
      authProvider: true, region: true, bio: true, createdAt: true,
      _count: { select: { specs: true, ensembles: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }); }

  const { userId, action, role } = await req.json();
  if (!userId || !action) {
    return NextResponse.json({ error: "userId와 action이 필요합니다." }, { status: 400 });
  }

  if (action === "approve") {
    const user = await prisma.conductor.update({
      where: { id: userId },
      data: { role: "CONDUCTOR", isApproved: true },
    });
    return NextResponse.json(user);
  }

  if (action === "reject") {
    await prisma.conductor.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  }

  if (action === "changeRole" && role) {
    const user = await prisma.conductor.update({
      where: { id: userId },
      data: { role, isApproved: role !== "PENDING" },
    });
    return NextResponse.json(user);
  }

  return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch { return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }); }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 });
  if (admin.id === userId) return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });

  await prisma.conductor.delete({ where: { id: userId } });
  return NextResponse.json({ success: true });
}
