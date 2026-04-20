import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAccess } from "@/lib/access-log";
import { MemberRepertoire } from "@/components/ensembles/member-repertoire";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: { shareCode: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ens = await prisma.ensemble.findUnique({
    where: { shareCode: params.shareCode },
    select: { name: true, description: true },
  });
  if (!ens) return { title: "찾을 수 없음 | Acapella" };
  return {
    title: `${ens.name} | Acapella`,
    description: ens.description ?? `${ens.name} 연습곡 레파토리`,
    openGraph: {
      title: `${ens.name} — 연습곡`,
      description: "Acapella로 파트별 연습 자료를 확인하세요.",
      locale: "ko_KR",
      type: "website",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: ens.name,
    },
    manifest: `/api/manifest/${params.shareCode}`,
  };
}

export default async function MemberPage({ params }: Props) {
  const ensemble = await prisma.ensemble.findUnique({
    where: { shareCode: params.shareCode },
    include: {
      conductor: { select: { name: true } },
      songs: {
        orderBy: { orderIdx: "asc" },
        include: {
          song: {
            include: {
              resources: { orderBy: { part: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!ensemble) notFound();

  logAccess({
    path: `/c/${params.shareCode}`,
    pageType: "member",
    shareCode: params.shareCode,
  });

  const items = ensemble.songs.map((es) => ({
    id: es.id,
    note: es.note,
    song: {
      id: es.song.id,
      titleKo: es.song.titleKo,
      titleEn: es.song.titleEn,
      composer: es.song.composer,
      pageNumber: es.song.pageNumber,
      resources: es.song.resources.map((r) => ({
        id: r.id,
        part: r.part,
        resourceType: r.resourceType,
        url: r.url,
        sourceSite: r.sourceSite,
      })),
    },
  }));

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-gray-900">{ensemble.name}</h1>
        <span className="text-xs text-gray-400">지휘 {ensemble.conductor.name}</span>
      </div>

      {ensemble.description && (
        <p className="mb-4 text-sm text-gray-500">{ensemble.description}</p>
      )}

      <MemberRepertoire items={items} />
    </div>
  );
}
