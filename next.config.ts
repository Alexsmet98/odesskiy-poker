import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/app", destination: "/app/index.html", permanent: false },
      { source: "/app/", destination: "/app/index.html", permanent: false },
    ];
  },
  async headers() {
    const fresh = [{ key: "Cache-Control", value: "no-cache" }];
    return [
      { source: "/app/sw.js", headers: [...fresh, { key: "Service-Worker-Allowed", value: "/app/" }] },
      { source: "/app/index.html", headers: fresh },
      { source: "/app/manifest.webmanifest", headers: [...fresh, { key: "Content-Type", value: "application/manifest+json" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
