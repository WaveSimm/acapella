export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

const SUPPORTED_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/midi",
  "audio/x-midi",
  "audio/mid",
  "video/mp4",
  "video/quicktime",
]);

const SUPPORTED_EXT = /\.(mp3|mp4|m4a|wav|mid|midi|mov)$/i;

function isSupported(f: DriveFile): boolean {
  return SUPPORTED_MIMES.has(f.mimeType) || SUPPORTED_EXT.test(f.name);
}

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_DRIVE_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const results: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      key: apiKey,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        // HTTP 리퍼러 제한 API 키 호환용 — 서버 호출이지만 허용 도메인 referer 전달
        Referer: process.env.NEXTAUTH_URL ?? "https://acapella-nine.vercel.app/",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 403 || res.status === 404) {
        throw new Error(
          `Drive 폴더에 접근할 수 없습니다. 폴더가 "링크가 있는 모든 사용자" 로 공개 공유되어 있는지 확인해주세요. (HTTP ${res.status})`,
        );
      }
      throw new Error(`Drive API 오류 (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    const files = json.files ?? [];
    for (const f of files) {
      if (isSupported(f)) results.push(f);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return results;
}

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
