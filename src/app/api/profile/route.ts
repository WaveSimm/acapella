import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const profileSchema = z.object({
  region: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  regionPublic: z.boolean().optional(),
  bioPublic: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const conductor = await prisma.conductor.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      region: true,
      bio: true,
      regionPublic: true,
      bioPublic: true,
    },
  });

  return NextResponse.json({ conductor });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.region !== undefined) data.region = parsed.data.region;
  if (parsed.data.bio !== undefined) data.bio = parsed.data.bio;
  if (parsed.data.regionPublic !== undefined) data.regionPublic = parsed.data.regionPublic;
  if (parsed.data.bioPublic !== undefined) data.bioPublic = parsed.data.bioPublic;

  await prisma.conductor.update({
    where: { id: session.user.id },
    data,
  });

  return NextResponse.json({ success: true });
}
