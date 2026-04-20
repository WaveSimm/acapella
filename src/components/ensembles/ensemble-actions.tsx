"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";

export function EnsembleActions({ ensembleId }: { ensembleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      message: "이 합창단을 삭제하시겠습니까?\n레파토리 목록도 함께 사라집니다. (곡 자체는 유지)",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ensembles/${ensembleId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("합창단이 삭제되었습니다.");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "삭제에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
    >
      {loading ? "삭제 중..." : "삭제"}
    </button>
  );
}
