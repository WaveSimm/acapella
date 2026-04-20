import type { Metadata } from "next";
import { SessionProvider } from "@/components/providers/session-provider";
import { SiteShell } from "@/components/ui/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acapella | 합창단 연습곡 레파토리",
  description: "아카펠라·합창단을 위한 연습곡 리스트와 파트별 음원·영상 관리 플랫폼.",
  openGraph: {
    title: "Acapella",
    description: "합창단 연습곡 레파토리",
    locale: "ko_KR",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Acapella",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>
          <SiteShell>{children}</SiteShell>
        </SessionProvider>
      </body>
    </html>
  );
}
