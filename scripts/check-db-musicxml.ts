import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // pure_imagination 또는 무합 키워드로 검색
  const songs = await prisma.song.findMany({
    where: {
      OR: [
        { titleKo: { contains: "imagination", mode: "insensitive" } },
        { titleKo: { contains: "무합" } },
        { titleKo: { contains: "퓨어" } },
      ],
    },
    select: { id: true, titleKo: true },
  });
  console.log("Matching songs:");
  for (const s of songs) console.log(`  ${s.id}  ${s.titleKo}`);

  for (const song of songs) {
    const res = await prisma.practiceResource.findMany({
      where: { songId: song.id, sourceSite: "NWC 변환", resourceType: "SCORE_PREVIEW" },
      orderBy: { createdAt: "desc" },
      include: { file: { select: { id: true, fileName: true, size: true, createdAt: true, data: true } } },
    });
    console.log(`\nSong "${song.titleKo}" — NWC 변환 SCORE_PREVIEW resources: ${res.length}`);
    for (const r of res) {
      const f = r.file;
      if (!f) { console.log(`  ${r.id} (no file)`); continue; }
      console.log(`  ${r.id}  file=${f.fileName}  size=${f.size}  created=${f.createdAt.toISOString()}`);
      // MusicXML 안에서 <time> 등장 위치 찾기
      const xml = Buffer.from(f.data).toString("utf-8");
      const partOne = xml.match(/<part id="P1">[\s\S]*?<\/part>/);
      if (partOne) {
        const measureRegex = /<measure number="(\d+)">([\s\S]*?)<\/measure>/g;
        let m;
        const tsHits: string[] = [];
        while ((m = measureRegex.exec(partOne[0])) !== null) {
          const num = parseInt(m[1], 10);
          const t = m[2].match(/<time><beats>(\d+)<\/beats><beat-type>(\d+)<\/beat-type><\/time>/);
          if (t) tsHits.push(`measure ${num}: ${t[1]}/${t[2]}`);
        }
        console.log(`    <time> elements in P1: ${tsHits.length === 0 ? "(none — OLD VERSION)" : ""}`);
        for (const h of tsHits) console.log(`      ${h}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
