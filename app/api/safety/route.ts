import { NextRequest, NextResponse } from 'next/server';
import { validatePythonSafety } from '@/lib/safety/ast_gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { code, expectedEntrypoint } = await req.json();
    if (typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code string' }, { status: 400 });
    }

    const result = validatePythonSafety(code, expectedEntrypoint);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AST validation failed' }, { status: 500 });
  }
}
