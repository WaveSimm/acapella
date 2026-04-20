import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartPlayer } from "@/components/practice/part-player";
import { SongMetaEditor } from "@/components/songs/song-meta-editor";
import { ResourceEditor } from "@/components/songs/resource-editor";

export const dynamic = "force-dynamic";

interface Props {
  params: { songId: string };
}

export default async function SongDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/auth/signin?callbackUrl=/songs/${params.songId}`);

  const song = await prisma.song.findUnique({
    where: { id: params.songId },
    include: {
      resources: { orderBy: { part: "asc" } },
      ensembles: {
        where: { ensemble: { conductorId: session.user.id } },
        include: { ensemble: { select: { id: true, name: true } } },
      },
    },
  });
  if (!song) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">← 내 합창단</Link>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{song.titleKo}</h1>
      {song.titleEn && <p className="mt-1 text-gray-400">{song.titleEn}</p>}
      {song.composer && (
        <p className="mt-1 text-sm text-gray-600">
          작곡: {song.composer}
          {song.arranger && ` · 편곡: ${song.arranger}`}
        </p>
      )}

      {song.ensembles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {song.ensembles.map((es) => (
            <Link
              key={es.id}
              href={`/dashboard/ensembles/${es.ensemble.id}`}
              className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 hover:bg-blue-100 hover:text-blue-700"
            >
              {es.ensemble.name}
            </Link>
          ))}
        </div>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">곡 정보</h2>
        <SongMetaEditor
          song={{
            id: song.id,
            titleKo: song.titleKo,
            titleEn: song.titleEn,
            composer: song.composer,
            arranger: song.arranger,
            pageNumber: song.pageNumber,
          }}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">파트별 연습</h2>
        <PartPlayer resources={song.resources} />
      </section>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">연습 소스 관리</h2>
        <ResourceEditor
          songId={song.id}
          resources={song.resources.map((r) => ({
            id: r.id,
            part: r.part,
            url: r.url,
            label: r.label,
            conductorId: r.conductorId,
            sourceSite: r.sourceSite,
          }))}
          conductorId={session.user.id}
        />
      </section>
    </div>
  );
}
