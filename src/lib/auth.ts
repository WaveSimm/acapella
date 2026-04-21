import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import KakaoProvider from "next-auth/providers/kakao";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

const providers: NextAuthOptions["providers"] = [];

// Google OAuth (설정된 경우만)
if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: "select_account" } },
    })
  );
}

// Kakao OAuth (설정된 경우만)
if (process.env.KAKAO_CLIENT_ID) {
  providers.push(
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
    })
  );
}

// 허용된 이메일 화이트리스트 (OAuth 설정 전 임시 인증)
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);

// 간편 로그인: 개발 모드에서만, 또는 OAuth provider가 하나도 설정되지 않은 부트스트랩 상황에서만 허용
const hasOAuthProvider = !!process.env.GOOGLE_CLIENT_ID || !!process.env.KAKAO_CLIENT_ID;
const allowCredentials = process.env.NODE_ENV === "development" || !hasOAuthProvider;
if (allowCredentials && ALLOWED_EMAILS.length > 0) {
  providers.push(
    CredentialsProvider({
      id: "dev-login",
      name: "이메일 로그인",
      credentials: {
        name: { label: "이름", type: "text", placeholder: "지휘자 이름" },
        email: { label: "이메일", type: "email", placeholder: "email@example.com" },
      },
      async authorize(credentials) {
        if (!credentials?.name || !credentials?.email) return null;

        // 프로덕션: 화이트리스트에 있는 이메일만 허용
        if (process.env.NODE_ENV !== "development") {
          if (!ALLOWED_EMAILS.includes(credentials.email)) return null;
        }

        // 기존 사용자 찾기 또는 생성
        let conductor = await prisma.conductor.findUnique({
          where: { email: credentials.email },
        });

        if (!conductor) {
          conductor = await prisma.conductor.create({
            data: {
              name: credentials.name,
              email: credentials.email,
              authProvider: "credentials",
              role: "PENDING",
              isApproved: false,
            },
          });
        }

        return {
          id: conductor.id,
          name: conductor.name,
          email: conductor.email,
          role: conductor.role,
          isApproved: conductor.isApproved,
        };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  // PrismaAdapter 제거 — Conductor 모델과 호환되지 않으므로 직접 처리
  providers,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // OAuth 로그인: Conductor 레코드 찾기 또는 생성
      if (account?.provider && account.provider !== "dev-login") {
        // 카카오는 이메일 없이 올 수 있음 → provider:id 형태로 대체
        const email = user.email || `${account.provider}:${account.providerAccountId}`;

        // Account 테이블에서 기존 연결 확인
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          include: { user: true },
        });

        let conductor = existingAccount?.user
          || await prisma.conductor.findUnique({ where: { email } });

        if (!conductor) {
          // 신규 사용자 생성
          conductor = await prisma.conductor.create({
            data: {
              name: user.name || profile?.name || "이름 미입력",
              email,
              image: user.image,
              authProvider: account.provider,
              role: "PENDING",
              isApproved: false,
            },
          });
        } else {
          // 기존 사용자: authProvider, image 업데이트
          await prisma.conductor.update({
            where: { id: conductor.id },
            data: {
              authProvider: account.provider,
              image: user.image || conductor.image,
            },
          });
        }

        // Account 레코드 연결 (OAuth 토큰 저장)
        if (!existingAccount) {
          await prisma.account.create({
            data: {
              userId: conductor.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state as string | undefined,
            },
          });
        }

        // user.id를 Conductor ID로 설정 (JWT에서 사용)
        user.id = conductor.id;
        (user as any).role = conductor.role;
        (user as any).isApproved = conductor.isApproved;
      }
      return true;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as string) ?? "PENDING";
        session.user.isApproved = (token.isApproved as boolean) ?? false;
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as any).role;
        token.isApproved = (user as any).isApproved;
      }
      // 세션 갱신 시 DB에서 최신 역할 조회
      if (trigger === "update" && token.sub) {
        const conductor = await prisma.conductor.findUnique({
          where: { id: token.sub },
          select: { role: true, isApproved: true },
        });
        if (conductor) {
          token.role = conductor.role;
          token.isApproved = conductor.isApproved;
        }
      }
      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
