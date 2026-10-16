import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
