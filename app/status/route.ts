import { NextResponse } from 'next/server';
import { getBuildStamp } from '@/lib/build_stamp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const stamp = getBuildStamp();

  return NextResponse.json({
    status: 'ok',
    buildStamp: stamp,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    tokenFactory: {
      endpoint: 'https://api.tokenfactory.nebius.com/v1',
      configured: Boolean(process.env.NEBIUS_API_KEY),
      resolvedModelIds: stamp.modelIds,
      mode: process.env.NEBIUS_API_KEY ? 'LIVE_CLOUD' : 'OFFLINE_FIXTURE',
    },
    invariants: {
      singleTerrainSource: true,
      authoritativeClock: true,
      noRobotPoseSmoothing: true,
      groundContactChecked: true,
    },
  });
}
