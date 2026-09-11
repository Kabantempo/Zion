import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Images from supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'msgddilylzbbbijpmnhz.supabase.co',
      },
    ],
  },
};

export default nextConfig;
