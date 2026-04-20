import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?callbackUrl=/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">내 대시보드</h1>
      <p className="mt-2 text-sm text-gray-500">
        {session.user.name}님, 환영합니다.
      </p>

      <div className="mt-10 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-sm text-gray-500">합창단·연습곡 관리 UI는 아직 구현 전입니다.</p>
        <p className="mt-2 text-xs text-gray-400">스키마: Ensemble, EnsembleSong, Song, PracticeResource, ConductorSpec</p>
      </div>
    </div>
  );
}
