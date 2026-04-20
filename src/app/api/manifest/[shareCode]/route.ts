import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: { shareCode: string } },
) {
  const ensemble = await prisma.ensemble.findUnique({
    where: { shareCode: params.shareCode },
    select: { name: true },
  });
  if (!ensemble) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    name: `${ensemble.name} — 연습곡`,
    short_name: ensemble.name,
    description: "Acapella 합창단 연습곡",
    start_url: `/c/${params.shareCode}`,
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  });
}
