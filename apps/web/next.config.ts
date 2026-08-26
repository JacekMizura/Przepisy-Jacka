import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@moja-kuchnia/api-client",
    "@moja-kuchnia/design-tokens",
  ],
  devIndicators: false,
};

export default nextConfig;
