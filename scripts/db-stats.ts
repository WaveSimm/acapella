import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const totalFiles = await prisma.uploadedFile.count();
  const byMime = await prisma.uploadedFile.groupBy({
    by: ['mimeType'],
    _count: { id: true },
    _sum: { size: true },
  });
  const resources = await prisma.practiceResource.groupBy({
    by: ['resourceType', 'sourceSite'],
    _count: { id: true },
  });
  const nwcSongs = await prisma.song.findMany({
    where: { resources: { some: { sourceSite: "NWC 변환" } } },
    select: { id: true, titleKo: true },
  });
  console.log("Total uploaded files:", totalFiles);
  console.log("\nFiles by mime type:");
  for (const r of byMime) console.log(`  ${r.mimeType}: ${r._count.id}개, ${((r._sum.size ?? 0) / 1024 / 1024).toFixed(2)}MB`);
  console.log("\nPracticeResources by type+source:");
  for (const r of resources) console.log(`  ${r.resourceType} / ${r.sourceSite ?? '(none)'}: ${r._count.id}개`);
  console.log("\nSongs with NWC:", nwcSongs.length);
  for (const s of nwcSongs) console.log(`  - ${s.titleKo}`);
  await prisma.$disconnect();
}
main();
