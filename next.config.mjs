import { execSync } from 'node:child_process';

function resolveGitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8);
  }
  if (process.env.NEXT_PUBLIC_GIT_SHA) {
    return process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 8);
  }
  try {
    return execSync('git rev-parse --short=8 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'v2-local';
  }
}

function resolveGitBranch() {
  if (process.env.VERCEL_GIT_COMMIT_REF) return process.env.VERCEL_GIT_COMMIT_REF;
  if (process.env.NEXT_PUBLIC_GIT_BRANCH) return process.env.NEXT_PUBLIC_GIT_BRANCH;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'main';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Prevents duplicate canvas mountings in dev mode
  env: {
    NEXT_PUBLIC_GIT_SHA: resolveGitSha(),
    NEXT_PUBLIC_GIT_BRANCH: resolveGitBranch(),
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
