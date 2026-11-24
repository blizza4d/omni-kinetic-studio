/**
 * Build Information & System Identity (Phase X0)
 */

export interface BuildInfo {
  version: string;
  gitSha: string;
  branch: string;
  buildTimeUtc: string;
  environment: 'production' | 'development' | 'test';
}

export const buildInfo: BuildInfo = {
  version: '2.0.0-studio',
  gitSha: process.env.NEXT_PUBLIC_GIT_SHA || '7c4283e',
  branch: process.env.NEXT_PUBLIC_GIT_BRANCH || 'main',
  buildTimeUtc: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
  environment: (process.env.NODE_ENV as any) || 'development',
};
