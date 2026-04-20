import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }); }

  const pageType = req.nextUrl.searchParams.get("type") ?? undefined;
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const limit = Math.min(500, Math.max(1, isNaN(rawLimit) ? 100 : rawLimit));
  const skip = (page - 1) * limit;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = {
    createdAt: { gte: since },
    ...(pageType && { pageType }),
  };

  const [logs, total, stats] = await Promise.all([
    prisma.accessLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.accessLog.count({ where }),
    prisma.accessLog.groupBy({ by: ["pageType"], where: { createdAt: { gte: since } }, _count: true }),
  ]);

  const shareCodes = [...new Set(logs.filter((l) => l.shareCode).map((l) => l.shareCode!))];
  const ensembles = shareCodes.length > 0
    ? await prisma.ensemble.findMany({
        where: { shareCode: { in: shareCodes } },
        select: { shareCode: true, name: true },
      })
    : [];
  const ensembleMap: Record<string, { name: string }> = {};
  for (const e of ensembles) ensembleMap[e.shareCode] = { name: e.name };

  return NextResponse.json({ logs, stats, ensembleMap, total, page, limit });
}
