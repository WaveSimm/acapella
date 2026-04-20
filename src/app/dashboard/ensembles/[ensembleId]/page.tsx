import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RepertoireManager } from "@/components/ensembles/repertoire-manager";

export const dynamic = "force-dynamic";

interface Props {
  params: { ensembleId: string };
}

export default async function EnsembleDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/dashboard/ensembles/${params.ensembleId}`);

  const ensemble = await prisma.ensemble.findUnique({
    where: { id: params.ensembleId },
    include: {
      songs: {
        orderBy: { orderIdx: "asc" },
        include: {
          song: {
            include: {
              _count: { select: { resources: true } },
            },
          },
        },
      },
    },
  });
  if (!ensemble) notFound();
  if (ensemble.conductorId !== session.user.id) redirect("/dashboard");

  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">
          ← 내 합창단
        </Link>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{ensemble.name}</h1>
          {ensemble.description && (
            <p className="mt-1 text-sm text-gray-500">{ensemble.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-sm">
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
        </div>
      </div>

      <RepertoireManager
        ensembleId={ensemble.id}
        songs={ensemble.songs.map((es) => ({
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
        }))}
      />
    </div>
  );
}
