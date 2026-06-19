import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in a parent dir otherwise
  // makes Next infer the wrong root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
