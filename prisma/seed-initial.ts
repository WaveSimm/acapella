// 초기 데이터 시드 — ChoirNote에서 export한 "아카펠라 · 무반주합창단" 곡/리소스를
// Acapella의 새 스키마(Publisher/Collection 없음)로 변환해 삽입.
//
// 사용법:
//   1. .env에 DATABASE_URL 설정
//   2. npx prisma db push 로 스키마 배포
//   3. 최소 1명의 ADMIN Conductor가 존재해야 함 (로그인 후 DB에서 role=ADMIN 처리)
//   4. npx tsx prisma/seed-initial.ts
//
// 실행하면:
//   - JSON의 곡들을 Song으로 생성
//   - 리소스를 PracticeResource로 생성 (관리자 conductorId로)
//   - "무반주합창단" Ensemble 생성 + EnsembleSong 연결

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, "initial-data.json");
  if (!fs.existsSync(jsonPath)) {
    console.log("initial-data.json이 없습니다. 시드 건너뜀.");
    return;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  if (!raw?.collections?.[0]?.songs) {
    console.log("JSON 포맷이 예상과 다릅니다. 시드 건너뜀.");
    return;
  }

  const admin = await prisma.conductor.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.error("ADMIN 역할의 Conductor가 필요합니다. 먼저 로그인 후 role을 ADMIN으로 바꾸세요.");
    process.exit(1);
  }

  const collection = raw.collections[0];
  const ensembleName: string = collection.name ?? "무반주합창단";

  // Ensemble upsert
  let ensemble = await prisma.ensemble.findFirst({
    where: { name: ensembleName, conductorId: admin.id },
  });
  if (!ensemble) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    ensemble = await prisma.ensemble.create({
      data: {
        conductorId: admin.id,
        name: ensembleName,
        shareCode: code,
      },
    });
    console.log(`합창단 생성: ${ensemble.name} (${ensemble.shareCode})`);
  } else {
    console.log(`합창단 재사용: ${ensemble.name} (${ensemble.shareCode})`);
  }

  let orderIdx = 0;
  for (const s of collection.songs) {
    // 중복 방지: 같은 titleKo가 이미 EnsembleSong에 연결되어 있으면 건너뜀
    let song = await prisma.song.findFirst({ where: { titleKo: s.titleKo } });
    if (!song) {
      song = await prisma.song.create({
        data: {
          titleKo: s.titleKo,
          titleEn: s.titleEn ?? null,
          composer: s.composer ?? null,
          arranger: s.arranger ?? null,
          pageNumber: s.pageNumber ?? null,
        },
      });
      console.log(`  곡 생성: ${song.titleKo}`);
    }

    // Resource
    for (const r of s.resources ?? []) {
      const exists = await prisma.practiceResource.findFirst({
        where: { songId: song.id, url: r.url },
      });
      if (!exists) {
        await prisma.practiceResource.create({
          data: {
            songId: song.id,
            conductorId: admin.id,
            part: r.part ?? "ALL",
            resourceType: r.resourceType ?? "VIDEO",
            url: r.url,
            label: r.label ?? null,
            sourceSite: r.sourceSite ?? null,
          },
        });
      }
    }

    // EnsembleSong upsert
    await prisma.ensembleSong.upsert({
      where: { ensembleId_songId: { ensembleId: ensemble.id, songId: song.id } },
      create: { ensembleId: ensemble.id, songId: song.id, orderIdx: orderIdx++ },
      update: {},
    });
  }

  console.log("시드 완료.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
