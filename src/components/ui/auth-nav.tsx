"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export function AuthNav({ position }: { position: "left" | "right" }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return position === "right" ? <div className="h-8 w-16 animate-pulse rounded-md bg-gray-200" /> : null;
  }

  if (!session) {
    if (position === "left") return null;
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/auth/signin"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          로그인
        </Link>
      </div>
    );
  }

  if (position === "left") {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <NavLink href="/dashboard">내 합창단</NavLink>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-3">
      {session.user?.role === "ADMIN" && (
        <Link href="/admin" className="text-xs sm:text-sm font-medium text-red-500 hover:text-red-700">
          관리
        </Link>
      )}
      <Link
        href="/profile"
        className="max-w-[80px] sm:max-w-none truncate text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {session.user?.name || "프로필"}
      </Link>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-md border border-gray-300 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs text-gray-500 transition-colors hover:bg-gray-50"
      >
        로그아웃
      </button>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900"
    >
      {children}
    </Link>
  );
}
