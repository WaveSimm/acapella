"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface ProfileData {
  name: string;
  email: string;
  region: string;
  bio: string;
  regionPublic: boolean;
  bioPublic: boolean;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    email: "",
    region: "",
    bio: "",
    regionPublic: false,
    bioPublic: false,
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.conductor) {
          const c = data.conductor;
          setProfile({
            name: c.name || "",
            email: c.email || "",
            region: c.region || "",
            bio: c.bio || "",
            regionPublic: c.regionPublic ?? false,
            bioPublic: c.bioPublic ?? false,
          });
        }
        setLoading(false);
      });
  }, [status]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: profile.region,
        bio: profile.bio,
        regionPublic: profile.regionPublic,
        bioPublic: profile.bioPublic,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("프로필이 저장되었습니다.");
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "저장에 실패했습니다.");
    }
  }

  if (status === "loading" || loading) {
    return <div className="py-20 text-center text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">내 프로필</h1>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">계정 정보</h2>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-400">이름</label>
              <p className="text-sm font-medium text-gray-900">{profile.name}</p>
            </div>
            <div>
              <label className="text-xs text-gray-400">이메일</label>
              <p className="text-sm text-gray-600">{profile.email}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">프로필 정보</h2>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500">지역</label>
                <PublicToggle
                  isPublic={profile.regionPublic}
                  onChange={(v) => setProfile({ ...profile, regionPublic: v })}
                />
              </div>
              <input
                type="text"
                value={profile.region}
                onChange={(e) => setProfile({ ...profile, region: e.target.value })}
                placeholder="예: 서울 은평구, 경기 파주시"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">자기소개</h2>
            <PublicToggle
              isPublic={profile.bioPublic}
              onChange={(v) => setProfile({ ...profile, bioPublic: v })}
            />
          </div>
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            placeholder="자유롭게 자기소개를 작성하세요"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}

function PublicToggle({ isPublic, onChange }: { isPublic: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!isPublic)}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
        isPublic ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
      }`}
    >
      {isPublic ? "공개" : "비공개"}
    </button>
  );
}
