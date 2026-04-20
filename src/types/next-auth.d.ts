import "next-auth";

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
