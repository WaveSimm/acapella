import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnsembleTabs } from "@/components/ensembles/ensemble-tabs";

export const dynamic = "force-dynamic";

interface Props {
  params: { ensembleId: string };
}

export default async function EnsembleDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/dashboard/ensembles/${params.ensembleId}`);

  // 오늘(KST) 기준 자정 이후 연습일만
  const nowUtc = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(nowUtc.getTime() + kstOffset);
  const todayKst = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));

  const ensemble = await prisma.ensemble.findUnique({
    where: { id: params.ensembleId },
    include: {
      songs: {
        orderBy: { orderIdx: "asc" },
        include: {
          song: {
            include: { _count: { select: { resources: true } } },
          },
        },
      },
      rehearsals: {
        where: {
          OR: [
            { date: null },
            { date: { gte: todayKst } },
          ],
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: {
          songs: {
            orderBy: { orderIdx: "asc" },
            include: { song: { select: { id: true, titleKo: true, composer: true } } },
          },
        },
      },
    },
  });
  if (!ensemble) notFound();
  if (ensemble.conductorId !== session.user.id) redirect("/dashboard");

  const repertoire = ensemble.songs.map((es) => ({
    id: es.id,
    orderIdx: es.orderIdx,
    note: es.note,
    addedAt: es.addedAt.toISOString(),
    song: {
      id: es.song.id,
      titleKo: es.song.titleKo,
      titleEn: es.song.titleEn,
      composer: es.song.composer,
      resourceCount: es.song._count.resources,
    },
  }));

  const rehearsals = ensemble.rehearsals.map((r) => ({
    id: r.id,
    date: r.date ? toYMD(r.date) : null,
    startTime: r.startTime,
    location: r.location,
    note: r.note,
    songs: r.songs.map((rs) => ({
      id: rs.id,
      orderIdx: rs.orderIdx,
      note: rs.note,
      song: { id: rs.song.id, titleKo: rs.song.titleKo, composer: rs.song.composer },
    })),
  }));

  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">
          ← 내 합창단
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{ensemble.name}</h1>
        {ensemble.description && (
          <p className="mt-1 text-sm text-gray-500">{ensemble.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-500">
            공유코드:{" "}
            <code className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-blue-600">
              {ensemble.shareCode}
            </code>
          </span>
          <Link
            href={`/c/${ensemble.shareCode}`}
            target="_blank"
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            단원 페이지 보기 →
          </Link>
        </div>
        <p className="mt-1 truncate text-xs text-gray-400">
          단원 접속 링크:{" "}
          <Link href={`/c/${ensemble.shareCode}`} className="text-blue-500">
            https://acapella-nine.vercel.app/c/{ensemble.shareCode}
          </Link>
        </p>
      </div>

      <EnsembleTabs
        ensembleId={ensemble.id}
        repertoire={repertoire}
        rehearsals={rehearsals}
      />
    </div>
  );
}

function toYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
