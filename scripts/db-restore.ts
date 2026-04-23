import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// toJson 의 역변환
function fromJson(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (v.__type === "Buffer" && typeof v.base64 === "string") {
      return Buffer.from(v.base64, "base64");
    }
    if (v.__type === "Date" && typeof v.iso === "string") {
      return new Date(v.iso);
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = fromJson(val);
    return out;
  }
  if (Array.isArray(value)) return value.map(fromJson);
  return value;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/db-restore.ts <backup-file-path> [--confirm]");
    console.error("\nAvailable backups:");
    const backupDir = path.join(process.cwd(), "backups");
    if (fs.existsSync(backupDir)) {
      for (const f of fs.readdirSync(backupDir).filter((f) => f.startsWith("db-full-"))) {
        console.error(`  backups/${f}`);
      }
    }
    process.exit(1);
  }

  const confirm = process.argv.includes("--confirm");
  const filePath = path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
  if (!fs.existsSync(filePath)) {
    console.error(`Backup file not found: ${filePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const data = fromJson(raw.tables) as Record<string, Record<string, unknown>[]>;
  console.log(`Loaded backup from ${filePath}`);
  console.log(`Taken at: ${raw.takenAt}`);
  console.log("Row counts in backup:");
  for (const [k, v] of Object.entries(raw.summary ?? {})) console.log(`  ${k}: ${v}`);

  if (!confirm) {
    console.log("\nDRY RUN — pass --confirm to actually restore (this will DELETE all existing data first).");
    await prisma.$disconnect();
    return;
  }

  console.log("\n!! Wiping current DB and restoring backup !!");

  // FK 순서 고려한 삭제 (자식 → 부모)
  await prisma.accessLog.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.rehearsalSong.deleteMany();
  await prisma.rehearsal.deleteMany();
  await prisma.ensembleSong.deleteMany();
  await prisma.ensemble.deleteMany();
  await prisma.practiceResource.deleteMany();
  await prisma.uploadedFile.deleteMany();
  await prisma.conductorSpec.deleteMany();
  await prisma.song.deleteMany();
  await prisma.conductor.deleteMany();

  // 삽입 (부모 → 자식)
  const inserts: Array<[string, (items: Record<string, unknown>[]) => Promise<unknown>]> = [
    ["conductors", (items) => prisma.conductor.createMany({ data: items as never })],
    ["songs", (items) => prisma.song.createMany({ data: items as never })],
    ["conductor_specs", (items) => prisma.conductorSpec.createMany({ data: items as never })],
    ["uploaded_files", (items) => prisma.uploadedFile.createMany({ data: items as never })],
    ["practice_resources", (items) => prisma.practiceResource.createMany({ data: items as never })],
    ["ensembles", (items) => prisma.ensemble.createMany({ data: items as never })],
    ["ensemble_songs", (items) => prisma.ensembleSong.createMany({ data: items as never })],
    ["rehearsals", (items) => prisma.rehearsal.createMany({ data: items as never })],
    ["rehearsal_songs", (items) => prisma.rehearsalSong.createMany({ data: items as never })],
    ["accounts", (items) => prisma.account.createMany({ data: items as never })],
    ["sessions", (items) => prisma.session.createMany({ data: items as never })],
    ["verification_tokens", (items) => prisma.verificationToken.createMany({ data: items as never })],
    ["access_logs", (items) => prisma.accessLog.createMany({ data: items as never })],
  ];
  for (const [name, fn] of inserts) {
    const items = data[name] ?? [];
    if (items.length === 0) {
      console.log(`  ${name}: (empty)`);
      continue;
    }
    await fn(items);
    console.log(`  ${name}: ${items.length} rows restored`);
  }

  console.log("\nRestore complete.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
