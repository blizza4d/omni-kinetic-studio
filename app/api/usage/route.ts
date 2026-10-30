import { NextRequest, NextResponse } from 'next/server';
import { getUsageState, recordUsage, resetUsage } from '@/lib/nebius/usage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const usage = getUsageState();
  return NextResponse.json(usage);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'reset') {
      const budgetLimit = typeof body.budgetLimitUsd === 'number' ? body.budgetLimitUsd : 5.0;
      const reset = resetUsage(budgetLimit);
      return NextResponse.json(reset);
    }

    if (body.action === 'record') {
      const tier = body.tier || 'ultra';
      const promptTokens = Number(body.promptTokens || 0);
      const completionTokens = Number(body.completionTokens || 0);
      const updated = recordUsage(tier, promptTokens, completionTokens);
      return NextResponse.json(updated);
    }

    return NextResponse.json(getUsageState());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
