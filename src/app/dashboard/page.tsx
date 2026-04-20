import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateEnsembleForm } from "@/components/ensembles/create-ensemble-form";
import { EnsembleActions } from "@/components/ensembles/ensemble-actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?callbackUrl=/dashboard");
  if (!session.user.isApproved) {
    const conductor = await prisma.conductor.findUnique({
      where: { id: session.user.id },
      select: { region: true },
    });
    redirect(conductor?.region ? "/pending" : "/onboarding");
  }

  const ensembles = await prisma.ensemble.findMany({
    where: { conductorId: session.user.id },
    include: { _count: { select: { songs: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">내 합창단</h1>
      </div>

      <CreateEnsembleForm />

      <div className="mt-6 space-y-3">
        {ensembles.map((ens) => (
          <div key={ens.id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/ensembles/${ens.id}`}
                  className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                >
                  {ens.name}
                </Link>
                {ens.description && (
                  <p className="mt-1 text-sm text-gray-500">{ens.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-gray-500">
                    공유코드:{" "}
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono font-bold text-blue-600">
                      {ens.shareCode}
                    </code>
                  </span>
                  <span className="text-gray-400">곡 {ens._count.songs}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-400">
                  단원 접속 링크:{" "}
                  <Link href={`/c/${ens.shareCode}`} className="text-blue-500">
                    /c/{ens.shareCode}
                  </Link>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/c/${ens.shareCode}`}
                  target="_blank"
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  미리보기
                </Link>
                <EnsembleActions ensembleId={ens.id} />
              </div>
            </div>
          </div>
        ))}

        {ensembles.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">위에서 합창단을 만들어보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
