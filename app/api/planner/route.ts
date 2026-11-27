import { NextRequest, NextResponse } from 'next/server';
import { planRoboticsTaskWithNemotron } from '@/lib/nebius/taskPlanner';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      prompt?: unknown;
      currentPose?: unknown;
    };
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim().length > 0
        ? body.prompt
        : 'Survey western boulder cluster safely';
    const poseArr = Array.isArray(body.currentPose) ? body.currentPose : [];
    const currentPose: [number, number, number] =
      poseArr.length === 3
        ? [Number(poseArr[0]) || 0, Number(poseArr[1]) || 0.44, Number(poseArr[2]) || 0]
        : [0, 0.44, 0];

    const plan = await planRoboticsTaskWithNemotron(prompt, currentPose);
    return NextResponse.json(plan);
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Failed to generate task plan', details },
      { status: 500 }
    );
  }
}
