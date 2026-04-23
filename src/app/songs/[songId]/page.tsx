import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SongPlayer } from "@/components/practice/song-player";
import { SongMetaEditor } from "@/components/songs/song-meta-editor";
import { ResourceEditor } from "@/components/songs/resource-editor";
import { NwcUploader } from "@/components/practice/nwc-uploader";
import { NwcScorePlayer } from "@/components/practice/nwc-score-player";

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

  const nwcMidi = song.resources.find((r) => r.sourceSite === "NWC 변환" && r.resourceType === "MIDI");
  const nwcScore = song.resources.find((r) => r.sourceSite === "NWC 변환" && r.resourceType === "SCORE_PREVIEW");
  const hasNwc = !!(nwcMidi && nwcScore);

  // NWC 있으면 MIDI 숨김 + NWC 내부 MusicXML 도 다운로드 리스트에서 제외
  const fileListResources = song.resources.filter((r) => {
    if (r.resourceType === "MIDI") return !hasNwc;
    if (r.resourceType === "SCORE_PREVIEW") return r.sourceSite !== "NWC 변환";
    return false;
  });

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

      {hasNwc && nwcMidi && nwcScore && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">악보 연동 연습 (NWC)</h2>
          <NwcScorePlayer midiSrc={nwcMidi.url} musicXmlSrc={nwcScore.url} />
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">파트별 연습</h2>
        <SongPlayer
          resources={(hasNwc
            ? song.resources.filter((r) => r.resourceType !== "MIDI")
            : song.resources
          ).map((r) => ({
            id: r.id,
            part: r.part,
            resourceType: r.resourceType,
            url: r.url,
            label: r.label,
            sourceSite: r.sourceSite,
          }))}
        />
      </section>

      <section className="mt-6">
        <NwcUploader songId={song.id} />
      </section>

      {fileListResources.length > 0 && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">악보 · MIDI</h2>
          <ul className="space-y-1.5 text-sm">
            {fileListResources.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      r.resourceType === "MIDI"
                        ? "bg-violet-50 text-violet-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {r.resourceType === "MIDI" ? "MIDI" : "PDF"}
                  </span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate text-blue-500 hover:underline"
                  >
                    {r.label || r.url}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">연습 소스 · 악보 관리</h2>
        <ResourceEditor
          songId={song.id}
          resources={song.resources.map((r) => ({
            id: r.id,
            part: r.part,
            resourceType: r.resourceType,
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
