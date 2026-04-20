import { NextRequest } from "next/server";

// 외부 호스팅 MP3를 CORS 우회해서 스트리밍 (Drive·Dropbox·GitHub 등).
// YouTube는 iframe 자체 처리, cafe24 등 CORS OK인 곳은 프록시 불필요.
const ALLOWED_HOSTS = [
  "drive.google.com",
  "drive.usercontent.google.com",
  "dl.dropboxusercontent.com",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
];

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  if (!src) return new Response("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!ALLOWED_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith(`.${h}`))) {
    return new Response("Host not allowed", { status: 403 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(target.toString(), {
    headers: range ? { range } : {},
    // redirect 자동 추종 (CORS 상관없이 서버라 가능)
    redirect: "follow",
  });

  // 스트림 통과
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("content-range", cr);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
