"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AuthNav } from "./auth-nav";
import { ToastProvider } from "./toast";
import { ConfirmProvider } from "./confirm";

function safeMemberBack(from: string | null): string | null {
  if (!from) return null;
  if (!from.startsWith("/c/")) return null;
  if (from.includes("..") || from.includes("//")) return null;
  return from;
}

function SiteShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safeFrom = safeMemberBack(searchParams.get("from"));
  const isMemberView = pathname.startsWith("/c/") || safeFrom !== null;

  if (isMemberView) {
    const backPath = pathname.startsWith("/c/") ? pathname : safeFrom!;
    return (
      <>
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
            <span className="text-sm font-bold text-blue-600">Acapella</span>
            {!pathname.startsWith("/c/") && (
              <Link href={backPath} className="text-xs text-gray-400 hover:text-gray-600">
                &larr; 돌아가기
              </Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-4">{children}</main>
        <footer className="mx-auto max-w-2xl border-t border-gray-100 px-4 py-4 text-[11px] leading-relaxed text-gray-400">
          연습 자료의 저작권은 각 권리자에게 있으며, Acapella는 연습 편의를 위한 링크만 제공합니다.
        </footer>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="text-xl font-bold text-blue-600">
              Acapella
            </Link>
            <AuthNav position="left" />
          </div>
          <AuthNav position="right" />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
        <div>Acapella — 합창단 연습곡 레파토리</div>
        <div className="mx-auto mt-2 max-w-xl px-4 text-[11px] leading-relaxed">
          연습 자료의 저작권은 각 권리자에게 있으며, Acapella는 연습 편의를 위한 링크만 제공합니다.
        </div>
      </footer>
    </>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ToastProvider>
        <ConfirmProvider>
          <SiteShellInner>{children}</SiteShellInner>
        </ConfirmProvider>
      </ToastProvider>
    </Suspense>
  );
}
