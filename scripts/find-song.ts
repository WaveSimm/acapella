import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const q = process.argv[2] || "worry";
  const songs = await prisma.song.findMany({
    where: {
      OR: [
        { titleKo: { contains: q, mode: "insensitive" } },
        { titleEn: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, titleKo: true, titleEn: true, nwcFileId: true, nwcFile: { select: { fileName: true, size: true } } },
  });
  for (const s of songs) {
    console.log(`id=${s.id}  ko=${s.titleKo}  en=${s.titleEn}  nwc=${s.nwcFileId ? `${s.nwcFile?.fileName} (${s.nwcFile?.size}B)` : "(none)"}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
