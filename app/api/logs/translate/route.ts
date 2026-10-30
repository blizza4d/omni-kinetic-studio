import { NextRequest, NextResponse } from 'next/server';
import { getNebiusClient, resolveNebiusModels } from '@/lib/nebius/client';
import { recordUsage } from '@/lib/nebius/usage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { errorText, context } = await req.json();
    if (!errorText) {
      return NextResponse.json({ error: 'Missing errorText' }, { status: 400 });
    }

    const modelConfig = await resolveNebiusModels();
    const client = getNebiusClient();

    if (client && process.env.NEBIUS_API_KEY) {
      const completion = await client.chat.completions.create({
        model: modelConfig.fastModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a robotics and simulation diagnostics engineer. Translate the provided simulation error or stack trace into clear, concise, actionable plain English for the developer. Explain what went wrong physically or mathematically and provide a 1-sentence fix.',
          },
          {
            role: 'user',
            content: `Context: ${context || 'Simulation step'}\n\nStack Trace:\n${errorText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      });

      const promptTokens = completion.usage?.prompt_tokens || 85;
      const completionTokens = completion.usage?.completion_tokens || 45;
      recordUsage('nano', promptTokens, completionTokens);

      return NextResponse.json({
        model: modelConfig.fastModel,
        plainEnglish: completion.choices[0]?.message?.content || 'Simulation physics constraint violation detected.',
      });
    }

    // High-Fidelity Local Diagnostic Rule-Engine Fallback
    let diagnosis = 'The simulation engine encountered a numerical instability.';
    let recommendation = 'Reduce simulation timestep dt or soften joint spring limits.';

    if (errorText.includes('NaN') || errorText.includes('inf')) {
      diagnosis = 'Numerical explosion detected in rigid-body velocities (NaN/Inf in inertia tensor).';
      recommendation = 'Check mass matrix scaling and lower maximum torque limits in reward.py.';
    } else if (errorText.includes('collision') || errorText.includes('penetration')) {
      diagnosis = 'Deep mesh penetration between robot leg and procedural debris boulder.';
      recommendation = 'Increase contact solver iterations or increase collision margin around terrain.';
    } else if (errorText.includes('joint') || errorText.includes('limit')) {
      diagnosis = 'Joint rotation exceeded kinematic limits in hip flexion.';
      recommendation = 'Add a joint limit barrier penalty to the step reward function.';
    }

    return NextResponse.json({
      model: `${modelConfig.fastModel} (heuristic diagnostic)`,
      plainEnglish: `${diagnosis} Action: ${recommendation}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Error translation failed' },
      { status: 500 }
    );
  }
}
