import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SongListManager } from "@/components/songs/song-list-manager";

export const dynamic = "force-dynamic";

export default async function SongsManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?callbackUrl=/dashboard/songs");
  if (!session.user.isApproved) redirect("/pending");

  const songs = await prisma.song.findMany({
    orderBy: { titleKo: "asc" },
    include: {
      resources: { select: { id: true, resourceType: true, url: true } },
      ensembles: {
        include: { ensemble: { select: { id: true, name: true, conductorId: true } } },
      },
      _count: { select: { ensembles: true } },
    },
  });

  const items = songs.map((s) => {
    const audio = s.resources.filter((r) =>
      r.resourceType === "AUDIO" ||
      /\.(mp3|wav|m4a|ogg)(\?.*)?$/i.test(r.url),
    ).length;
    const video = s.resources.filter((r) =>
      r.resourceType === "VIDEO" ||
      r.url.includes("youtube.com") || r.url.includes("youtu.be"),
    ).length;
    const score = s.resources.filter((r) =>
      r.resourceType === "SCORE_PREVIEW" ||
      /\.pdf(\?.*)?$/i.test(r.url),
    ).length;
    const myEnsembles = s.ensembles
      .filter((es) => es.ensemble.conductorId === session.user.id)
      .map((es) => ({ id: es.ensemble.id, name: es.ensemble.name }));
    return {
      id: s.id,
      titleKo: s.titleKo,
      titleEn: s.titleEn,
      composer: s.composer,
      pageNumber: s.pageNumber,
      audio,
      video,
      score,
      totalResources: s.resources.length,
      myEnsembles,
      totalEnsembles: s._count.ensembles,
    };
  });

  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">
          ← 내 합창단
        </Link>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">곡 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          전체 곡 목록. 제목·작곡가로 검색, 행 클릭하면 상세(연습소스·악보·분석) 편집.
        </p>
      </div>

      <SongListManager items={items} />
    </div>
  );
}
