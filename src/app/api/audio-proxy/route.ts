import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// 외부 호스팅 MP3를 CORS 우회해서 스트리밍 (Drive·Dropbox·GitHub 등).
const ALLOWED_HOSTS = [
  "drive.google.com",
  "drive.usercontent.google.com",
  "dl.dropboxusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
];

const ALLOWED_CONTENT_TYPE_PREFIXES = [
  "audio/",
  "video/",
  "application/pdf",
  "application/octet-stream",
];

function isAllowedHost(u: URL): boolean {
  return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

async function isCallerAuthorized(req: NextRequest): Promise<boolean> {
  const user = await getSessionUser();
  if (user) return true;
  // 비로그인 접근: referer가 유효 shareCode를 가리키는 단원 페이지일 때만 허용
  const referer = req.headers.get("referer") ?? "";
  const match = referer.match(/\/c\/([A-Z0-9]{4,})/i);
  if (!match) return false;
  const ensemble = await prisma.ensemble.findUnique({
    where: { shareCode: match[1] },
    select: { id: true },
  });
  return !!ensemble;
}

async function fetchWithManualRedirect(target: URL, range: string | null): Promise<Response> {
  let url = target;
  for (let i = 0; i < 5; i++) {
    const upstream = await fetch(url.toString(), {
      headers: range ? { range } : {},
      redirect: "manual",
    });
    if (upstream.status < 300 || upstream.status >= 400) return upstream;
    const loc = upstream.headers.get("location");
    if (!loc) return upstream;
    const next = new URL(loc, url);
    if (!isAllowedHost(next)) {
      return new Response(`Redirect blocked: ${next.hostname}`, { status: 502 });
    }
    url = next;
  }
  return new Response("Too many redirects", { status: 508 });
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  if (!src) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!isAllowedHost(target)) {
    return new Response("Host not allowed", { status: 403 });
  }

  if (!(await isCallerAuthorized(req))) {
    return new Response("Forbidden", { status: 403 });
  }

  const range = req.headers.get("range");
  const upstream = await fetchWithManualRedirect(target, range);

  const ct = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => ct.startsWith(p))) {
    return new Response(`Unsupported content-type: ${ct}`, { status: 415 });
  }

  const headers = new Headers();
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("content-range", cr);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
