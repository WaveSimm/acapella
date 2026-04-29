import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  const songId = process.argv[2];
  const out = process.argv[3] || `scripts/_out/${songId}.nwc`;
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { nwcFile: true },
  });
  if (!song?.nwcFile) { console.error("no nwc"); process.exit(1); }
  mkdirSync("scripts/_out", { recursive: true });
  writeFileSync(out, Buffer.from(song.nwcFile.data));
  console.log(`Saved ${song.nwcFile.fileName} (${song.nwcFile.size}B) to ${out}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
