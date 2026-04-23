import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const xml = await prisma.uploadedFile.findFirst({
    where: { fileName: { contains: "Dont_you" }, mimeType: "application/vnd.recordare.musicxml+xml" },
    select: { data: true, fileName: true },
  });
  if (!xml) { console.log("no musicxml"); process.exit(0); }
  const text = Buffer.from(xml.data).toString("utf-8");
  const parts = text.split("<part id=");
  if (parts[1]) {
    const measures = parts[1].split("<measure number=");
    for (let i = 1; i <= Math.min(3, measures.length - 1); i++) {
      console.log(`\n=== Solo measure ${i} ===`);
      console.log(measures[i].substring(0, 1800));
    }
  }
  await prisma.$disconnect();
}
main();
