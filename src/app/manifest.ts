import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Acapella — 합창단 연습곡 레파토리",
    short_name: "Acapella",
    description: "아카펠라·합창단 연습곡 리스트와 파트별 음원·영상 관리.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
