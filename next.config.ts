import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `ws` uses native-compatible frame helpers. Keep it external in the
  // server bundle so Next does not transform those helpers.
  serverExternalPackages: ["ws"]
};

export default nextConfig;
