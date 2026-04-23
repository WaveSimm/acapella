import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  // 1) orphan NWC files: mimeType=application/x-nwc AND resource is null
  const orphans = await prisma.uploadedFile.findMany({
    where: {
      mimeType: "application/x-nwc",
      resource: null,
    },
    select: { id: true, fileName: true, size: true, createdAt: true, conductorId: true },
  });

  console.log(`Orphan NWC files: ${orphans.length}개`);
  for (const f of orphans) {
    console.log(`  ${f.id} ${f.fileName} (${(f.size / 1024).toFixed(1)}KB) ${f.createdAt.toISOString()}`);
  }

  if (orphans.length === 0) {
    console.log("No orphans to delete.");
    await prisma.$disconnect();
    return;
  }

  // 2) Backup metadata as JSON
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `orphan-nwc-${ts}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(orphans, null, 2));
  console.log(`Backup: ${backupPath}`);

  // 3) Delete
  const res = await prisma.uploadedFile.deleteMany({
    where: { id: { in: orphans.map((f) => f.id) } },
  });
  console.log(`Deleted: ${res.count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
