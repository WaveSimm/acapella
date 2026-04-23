import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== Database ===");
  const counts = {
    songs: await prisma.song.count(),
    resources: await prisma.practiceResource.count(),
    files: await prisma.uploadedFile.count(),
    conductors: await prisma.conductor.count(),
    ensembles: await prisma.ensemble.count(),
    rehearsals: await prisma.rehearsal.count(),
    ensembleSongs: await prisma.ensembleSong.count(),
    rehearsalSongs: await prisma.rehearsalSong.count(),
    accessLogs: await prisma.accessLog.count(),
    accounts: await prisma.account.count(),
    conductorSpecs: await prisma.conductorSpec.count(),
  };
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);

  const files = await prisma.uploadedFile.findMany({ select: { size: true, mimeType: true } });
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  console.log(`\n  UploadedFile total bytes: ${totalSize} (${(totalSize / 1024).toFixed(1)} KB)`);
  const byMime = new Map<string, { n: number; s: number }>();
  for (const f of files) {
    const e = byMime.get(f.mimeType) ?? { n: 0, s: 0 };
    e.n++;
    e.s += f.size;
    byMime.set(f.mimeType, e);
  }
  for (const [m, v] of byMime) console.log(`    ${m}: ${v.n}개, ${(v.s / 1024).toFixed(1)} KB`);

  console.log("\n  AccessLog sample:");
  const recentLogs = await prisma.accessLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const l of recentLogs) console.log(`    ${l.createdAt.toISOString()} ${l.method} ${l.path} ${l.status} (${l.bytesOut} bytes)`);

  // 대역폭 추정 (access_log 누적치)
  const bandwidthAgg = await prisma.accessLog.aggregate({
    _sum: { bytesOut: true },
    _count: { id: true },
  });
  console.log(`\n  Total logged bandwidth: ${((bandwidthAgg._sum.bytesOut ?? 0) / 1024 / 1024).toFixed(2)} MB over ${bandwidthAgg._count.id} requests`);

  // 최근 7일 대역폭
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekly = await prisma.accessLog.aggregate({
    where: { createdAt: { gte: weekAgo } },
    _sum: { bytesOut: true },
    _count: { id: true },
  });
  console.log(`  Last 7 days: ${((weekly._sum.bytesOut ?? 0) / 1024 / 1024).toFixed(2)} MB, ${weekly._count.id} requests`);

  await prisma.$disconnect();
}
main().catch(console.error);
