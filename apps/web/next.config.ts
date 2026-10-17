import path from 'node:path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

// Next only reads env files from apps/web; this monorepo keeps its shared config
// (GEMINI_API_KEY, FALKORDB_URL, GATEWAY_*) in the repository root .env.
// dotenv never overrides variables that are already set, so real env vars still win.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  // Allow an isolated build dir (e.g. a second dev server) so concurrent servers never share
  // and corrupt the same .next cache. Unset in normal use.
  ...(process.env.ARGON_DIST_DIR ? { distDir: process.env.ARGON_DIST_DIR } : {}),
  transpilePackages: ['@argon/graph', '@argon/agent'],
  serverExternalPackages: [
    '@huggingface/transformers',
    'onnxruntime-node',
    'sharp',
    'falkordb',
    'redis',
    '@redis/client',
    '@google/genai',
    '@ai-sdk/google',
    'ai',
  ],
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(
          '@huggingface/transformers',
          'onnxruntime-node',
          'sharp',
          'falkordb',
          'redis',
          '@redis/client'
        );
      }
    }

    return config;
  },
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:8080';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${gatewayUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
