/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "k.kakaocdn.net" },
      { protocol: "http", hostname: "jubil2018.cafe24.com" },
      { protocol: "http", hostname: "jubil.cafe24.com" },
      { protocol: "https", hostname: "www.jubilate.com" },
    ],
  },
};

export default nextConfig;
