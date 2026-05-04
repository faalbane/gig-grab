import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export — Firebase Hosting serves /apps/web/out as the public dir.
  // Switch to App Hosting / Cloud Run later if/when we need SSR.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
