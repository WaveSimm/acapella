"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isApproved: boolean;
  authProvider: string | null;
  region: string | null;
  bio: string | null;
  createdAt: string;
  _count: { specs: number; ensembles: number };
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN: { label: "관리자", color: "bg-red-100 text-red-700" },
  CONDUCTOR: { label: "지휘자", color: "bg-blue-100 text-blue-700" },
  PENDING: { label: "대기", color: "bg-amber-100 text-amber-700" },
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated" && session?.user?.role !== "ADMIN") router.push("/dashboard");
  }, [status, session, router]);

  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    if (session?.user?.role === "ADMIN") fetchUsers();
  }, [session]);

  const handleAction = async (userId: string, action: string, role?: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, role }),
    });
    if (res.ok) {
      toast.success(
        action === "approve" ? "승인했습니다." :
        action === "reject" ? "거부했습니다." :
        action === "changeRole" ? "역할을 변경했습니다." : "완료되었습니다.",
      );
      fetchUsers();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "처리에 실패했습니다.");
    }
  };

  const handleDelete = async (userId: string, name: string) => {
    const ok = await confirm({ message: `${name} 계정을 삭제하시겠습니까?`, confirmLabel: "삭제", danger: true });
    if (!ok) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      toast.success(`${name} 계정이 삭제되었습니다.`);
      fetchUsers();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "삭제에 실패했습니다.");
    }
  };

  if (status === "loading" || loading) return <div className="py-20 text-center text-gray-400">로딩 중...</div>;
  if (session?.user?.role !== "ADMIN") return null;

  const pending = users.filter((u) => u.role === "PENDING");
  const approved = users.filter((u) => u.role !== "PENDING");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">관리자</h1>

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold">
              {pending.length}
            </span>
            승인 대기
          </h2>
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{u.name}</p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                  {u.region && <p className="text-sm text-gray-600">{u.region}</p>}
                  <p className="text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString("ko-KR")} 가입</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(u.id, "approve")}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleAction(u.id, "reject")}
                    className="rounded-lg bg-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-300"
                  >
                    거부
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">전체 계정 ({approved.length})</h2>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">이메일</th>
                <th className="px-4 py-3 font-medium">역할</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">데이터</th>
                <th className="px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {approved.map((u) => {
                const r = ROLE_LABELS[u.role] ?? ROLE_LABELS.PENDING;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400 sm:hidden">{u.email}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-500 sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.color}`}>{r.label}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-gray-400 sm:table-cell">
                      합창단 {u._count.ensembles} · 분석 {u._count.specs}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {u.role === "CONDUCTOR" && (
                          <button onClick={() => handleAction(u.id, "changeRole", "ADMIN")} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">관리자↑</button>
                        )}
                        {u.role === "ADMIN" && u.email !== session?.user?.email && (
                          <button onClick={() => handleAction(u.id, "changeRole", "CONDUCTOR")} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">지휘자↓</button>
                        )}
                        {u.email !== session?.user?.email && (
                          <button onClick={() => handleDelete(u.id, u.name)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">삭제</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
