import { headers } from "next/headers";
import { prisma } from "./prisma";

/** 서버 컴포넌트에서 접속 로그를 비동기로 기록 (페이지 렌더링을 차단하지 않음) */
export function logAccess(params: {
  path: string;
  pageType: string;
  shareCode?: string;
  conductorId?: string;
}) {
  // fire-and-forget: 로그 실패해도 페이지는 정상 렌더링
  (async () => {
    try {
      const h = headers();
      const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
      const userAgent = h.get("user-agent") ?? null;

      await prisma.accessLog.create({
        data: {
          ip,
          userAgent,
          path: params.path,
          pageType: params.pageType,
          shareCode: params.shareCode ?? null,
          conductorId: params.conductorId ?? null,
        },
      });
    } catch {
      // 로그 실패 무시
    }
  })();
}
