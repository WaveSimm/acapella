import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// UploadedFile.data (Bytes) 는 base64 로 직렬화
function toJson(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { __type: "Buffer", base64: value.toString("base64") };
  if (value instanceof Uint8Array) return { __type: "Buffer", base64: Buffer.from(value).toString("base64") };
  if (value instanceof Date) return { __type: "Date", iso: value.toISOString() };
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJson(v);
    return out;
  }
  return value;
}

async function main() {
  const tables = {
    songs: await prisma.song.findMany(),
    practice_resources: await prisma.practiceResource.findMany(),
    uploaded_files: await prisma.uploadedFile.findMany(),
    conductors: await prisma.conductor.findMany(),
    conductor_specs: await prisma.conductorSpec.findMany(),
    ensembles: await prisma.ensemble.findMany(),
    ensemble_songs: await prisma.ensembleSong.findMany(),
    rehearsals: await prisma.rehearsal.findMany(),
    rehearsal_songs: await prisma.rehearsalSong.findMany(),
    accounts: await prisma.account.findMany(),
    sessions: await prisma.session.findMany(),
    verification_tokens: await prisma.verificationToken.findMany(),
    access_logs: await prisma.accessLog.findMany(),
  };

  const summary: Record<string, number> = {};
  const serialized: Record<string, unknown> = {};
  for (const [name, rows] of Object.entries(tables)) {
    summary[name] = rows.length;
    serialized[name] = toJson(rows);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const metaPath = path.join(backupDir, `db-full-${ts}.json`);
  fs.writeFileSync(
    metaPath,
    JSON.stringify({
      version: 1,
      takenAt: new Date().toISOString(),
      summary,
      tables: serialized,
    }, null, 2),
  );

  const sizeKb = (fs.statSync(metaPath).size / 1024).toFixed(1);
  console.log(`Backup saved: ${metaPath} (${sizeKb} KB)`);
  console.log("\nRow counts:");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
