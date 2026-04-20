import "next-auth";

// html-midi-player 타입 선언 (패키지 자체는 declaration 없음)
declare module "html-midi-player";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      isApproved: boolean;
    };
  }

  interface User {
    id: string;
    role: string;
    isApproved: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    role?: string;
    isApproved?: boolean;
  }
}
