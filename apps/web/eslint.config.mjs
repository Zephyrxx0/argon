import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', 'node_modules/**', '.cache/**', 'next-env.d.ts', 'tsconfig.tsbuildinfo'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Much of the codebase talks to untyped third-party payloads (auth, FalkorDB rows).
      // Keep `any` visible without letting it block the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Avatars come from arbitrary external hosts (GitHub etc.); next/image would need an
      // allow-list for every one of them.
      '@next/next/no-img-element': 'off',
    },
  },
];
