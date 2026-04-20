import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/** 승인된 사용자만 통과 (CONDUCTOR 또는 ADMIN) */
export async function requireApprovedUser() {
  const user = await requireSessionUser();
  if (!user.isApproved) {
    throw new Error("PENDING_APPROVAL");
  }
  return user;
}

/** 관리자만 통과 */
export async function requireAdmin() {
  const user = await requireSessionUser();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}
