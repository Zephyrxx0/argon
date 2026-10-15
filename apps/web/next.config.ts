import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@argon/graph'],
  reactStrictMode: true,
};

export default nextConfig;
