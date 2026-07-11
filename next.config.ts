import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/menu/:id/personalizations",
        destination: "/menu/:id/personalizations/manage",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
