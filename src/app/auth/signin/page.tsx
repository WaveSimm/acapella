"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">로그인</h1>
          <p className="mt-2 text-sm text-gray-500">
            지휘자 계정으로 로그인하세요
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            로그인 중 오류가 발생했습니다. 다시 시도해주세요.
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google 계정으로 로그인
          </button>

          <button
            onClick={() => signIn("kakao", { callbackUrl })}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#FEE500] px-4 py-3 text-sm font-medium text-[#191919] transition-colors hover:bg-[#FDD835]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24-.19.7-.69 2.54-.79 2.94-.13.49.18.48.37.35.15-.1 2.4-1.63 3.36-2.29.54.08 1.1.12 1.68.12 5.52 0 10-3.36 10-7.44C22 6.36 17.52 3 12 3z"
                fill="#191919"
              />
            </svg>
            카카오 계정으로 로그인
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-center">
          <p className="text-xs text-amber-700">
            처음 가입할 때 사용한 방법으로 로그인하세요.<br />
            다른 방법으로 로그인하면 별도의 계정이 생성됩니다.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Google 또는 카카오 계정으로 로그인하면<br />
          곡 분석, 성가대 배정 등 지휘자 기능을 사용할 수 있습니다.
        </p>

        <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-gray-500">성가대원이신가요?</p>
          <p className="mt-1 text-xs text-gray-400">
            별도 가입이 필요 없습니다.<br />
            지휘자가 공유한 링크로 바로 접속하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
