import { NextResponse } from 'next/server';
import { getBuildStamp } from '@/lib/build_stamp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stamp = getBuildStamp();
  return NextResponse.json({
    version: '2.0.0',
    build: {
      sha: stamp.sha,
      branch: stamp.branch,
      buildType: stamp.buildType,
    },
    features: {
      userControl: true,
      keyboardDrive: true,
      gamepadApi: true,
      touchJoystick: true,
      clickToMove: true,
      pointerDrive: true,
      cvTeleop: true,
      replayAndGhosts: true,
      missions: true,
      scenarioEditor: true,
      terrainBrush: true,
      sensorOverlays: true,
      screenshotCapture: true,
      clipRecording: true,
      shareLinks: true,
      aiArchitect: Boolean(process.env.NEBIUS_API_KEY),
    },
  });
}
