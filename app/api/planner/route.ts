import { NextRequest, NextResponse } from 'next/server';
import { planRoboticsTaskWithNemotron } from '@/lib/nebius/taskPlanner';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body.prompt || 'Survey western boulder cluster safely';
    const currentPose: [number, number, number] = body.currentPose || [0, 0.44, 0];

    const plan = await planRoboticsTaskWithNemotron(prompt, currentPose);
    return NextResponse.json(plan);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate task plan', details: err.message },
      { status: 500 }
    );
  }
}
