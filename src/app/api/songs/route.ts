import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const createSchema = z.object({
  titleKo: z.string().min(1).max(200),
  titleEn: z.string().max(200).nullable().optional(),
  composer: z.string().max(200).nullable().optional(),
  arranger: z.string().max(200).nullable().optional(),
  pageNumber: z.number().int().positive().nullable().optional(),
});

// 곡 검색/목록
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10));

  const where = q.length > 0
    ? {
        OR: [
          { titleKo: { contains: q, mode: "insensitive" as const } },
          { titleEn: { contains: q, mode: "insensitive" as const } },
          { composer: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      include: { _count: { select: { resources: true, ensembles: true } } },
      orderBy: { titleKo: "asc" },
      take: limit,
    }),
    prisma.song.count({ where }),
  ]);
  return NextResponse.json({ songs, total });
}

// 곡 생성 (승인된 지휘자 누구나)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!user.isApproved) return NextResponse.json({ error: "승인 대기 중입니다." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const song = await prisma.song.create({
    data: {
      titleKo: parsed.data.titleKo,
      titleEn: parsed.data.titleEn ?? null,
      composer: parsed.data.composer ?? null,
      arranger: parsed.data.arranger ?? null,
      pageNumber: parsed.data.pageNumber ?? null,
    },
  });
  return NextResponse.json(song, { status: 201 });
}
