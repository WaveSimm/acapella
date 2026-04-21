import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { z } from "zod";

const ALLOWED_PAGE_TYPES = new Set([
  "member",
  "dashboard",
  "admin",
  "song",
  "song_list",
  "ensemble",
  "choir_member", // legacy
]);

const bodySchema = z.object({
  path: z.string().max(500),
  pageType: z.string().max(50),
  shareCode: z.string().max(20).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const { path, pageType, shareCode } = parsed.data;
    if (!ALLOWED_PAGE_TYPES.has(pageType)) {
      return NextResponse.json({ ok: false, error: "Unknown pageType" }, { status: 400 });
    }

    // conductorId는 서버 세션에서만 확정 (클라이언트가 임의로 주입하지 못하게)
    const user = await getSessionUser();
    const conductorId = user?.id ?? null;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;

    await prisma.accessLog.create({
      data: { ip, userAgent, path, pageType, shareCode: shareCode ?? null, conductorId },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
