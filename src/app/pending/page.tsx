import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");

  // 이미 승인된 사용자는 대시보드로
  if (session.user.isApproved) redirect("/dashboard");

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="mx-auto max-w-sm text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900">승인 대기 중</h1>
        <p className="mt-3 text-sm text-gray-500">
          승인 신청이 완료되었습니다.<br />
          관리자가 확인 후 승인해 드리겠습니다.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          승인이 완료되면 대시보드의 모든 기능을<br />
          사용할 수 있습니다.
        </p>

        <div className="mt-6 rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500">
            <span className="font-medium">{session.user.name}</span>님
            {session.user.email && !session.user.email.includes(":") && (
              <> ({session.user.email})</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
