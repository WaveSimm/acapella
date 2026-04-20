import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-4xl font-bold text-gray-900">Acapella</h1>
      <p className="mt-3 text-gray-500">합창단 연습곡 레파토리</p>

      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-left shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700">주요 기능</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          <li>· 합창단 단위로 연습곡 목록 관리</li>
          <li>· 곡마다 파트별 연습 음원·영상 링크</li>
          <li>· 공유코드 하나로 단원에게 전달</li>
          <li>· 배속·구간반복·전체화면 플레이어</li>
        </ul>
      </div>

      <div className="mt-8">
        {session?.user ? (
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            내 대시보드
          </Link>
        ) : (
          <Link
            href="/auth/signin"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            로그인하고 시작하기
          </Link>
        )}
      </div>
    </div>
  );
}
