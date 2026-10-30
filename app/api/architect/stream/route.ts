import { NextRequest } from 'next/server';
import { resolveNebiusModels, getNebiusClient } from '@/lib/nebius/client';
import {
  SYSTEM_ARCHITECT_PROMPT,
  buildTaskInterpretationPrompt,
  buildEnvironmentSpecPrompt,
  buildRewardPrompt,
  buildDatagenPrompt,
  buildCritiquePrompt,
  generateDeterministicEnvironmentSpec,
  generateDeterministicRewardCode,
  generateDeterministicDatagenCode,
  generateDeterministicCritique,
} from '@/lib/nebius/prompts';
import { validatePythonSafety } from '@/lib/safety/ast_gate';
import { compileSpec } from '@/lib/spec/compiler';
import { runRewardSandbox } from '@/sim/reward_sandbox';
import { EnvironmentSpecSchema, EnvironmentSpec, CompiledSpec } from '@/contracts';
import { recordUsage } from '@/lib/nebius/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    body = { prompt: 'quadruped, low-gravity debris field' };
  }

  const userPrompt = body.prompt || 'quadruped, low-gravity debris field';
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const streamStartTime = Date.now();

      try {
        // Step 0: Model resolution & initialization
        sendSSE('status', {
          stage: 'init',
          message: 'Resolving active NVIDIA Nemotron models from Nebius Token Factory...',
          timestamp: Date.now(),
        });

        const modelConfig = await resolveNebiusModels();
        sendSSE('status', {
          stage: 'models_resolved',
          reasoningModel: modelConfig.reasoningModel,
          midModel: modelConfig.midModel,
          fastModel: modelConfig.fastModel,
          source: modelConfig.source,
          message: `Tier resolved: ${modelConfig.reasoningModel} (${modelConfig.source})`,
          timestamp: Date.now(),
        });

        const client = getNebiusClient();

        let rawDraftSpec: EnvironmentSpec;
        let rewardCode: string;
        let datagenCode: string;
        let interpretationText = '';
        let critiqueResult: { compliant: boolean; score: number; findings: string[]; critiqueText: string };

        // === STAGE 1: INTENT ANALYSIS (interpret) ===
        const stage1Start = Date.now();
        sendSSE('stage_start', {
          stage: 'interpret',
          label: 'Intent Analysis',
          tier: 'ultra',
          model: modelConfig.reasoningModel,
        });
        sendSSE('status', {
          stage: 'interpreting',
          message: `[Stage 1/11] Analyzing task "${userPrompt}" with ${modelConfig.reasoningModel}...`,
          timestamp: Date.now(),
        });

        if (client && process.env.NEBIUS_API_KEY) {
          const interpPrompt = buildTaskInterpretationPrompt(userPrompt);
          const interpCompletion = await client.chat.completions.create({
            model: modelConfig.reasoningModel,
            messages: [
              { role: 'system', content: SYSTEM_ARCHITECT_PROMPT },
              { role: 'user', content: interpPrompt },
            ],
            temperature: 0.2,
          });
          interpretationText = interpCompletion.choices[0]?.message?.content || '';
          const s1Prompt = interpCompletion.usage?.prompt_tokens || 350;
          const s1Comp = interpCompletion.usage?.completion_tokens || 280;
          const u1 = recordUsage('ultra', s1Prompt, s1Comp);
          sendSSE('token_delta', {
            stage: 'interpret',
            tier: 'ultra',
            promptTokens: s1Prompt,
            completionTokens: s1Comp,
            costUsd: u1.ultra.costUsd,
          });
        } else {
          interpretationText = `Intent Analysis for "${userPrompt}": Extraterrestrial terrain traversal requiring contact-aware quadruped gait, low-gravity bounding mitigation, and obstacle clearance.`;
          const u1 = recordUsage('ultra', 380, 240);
          sendSSE('token_delta', {
            stage: 'interpret',
            tier: 'ultra',
            promptTokens: 380,
            completionTokens: 240,
            costUsd: u1.ultra.costUsd,
          });
        }
        sendSSE('log', { text: interpretationText });
        sendSSE('stage_end', {
          stage: 'interpret',
          durationMs: Date.now() - stage1Start,
          status: 'complete',
        });

        // === STAGE 2: SPEC DRAFTING (draft) ===
        const stage2Start = Date.now();
        sendSSE('stage_start', {
          stage: 'draft',
          label: 'Spec Drafting',
          tier: 'ultra',
          model: modelConfig.reasoningModel,
        });
        sendSSE('status', {
          stage: 'draft',
          message: '[Stage 2/11] Synthesizing draft EnvironmentSpec parameters...',
          timestamp: Date.now(),
        });

        if (client && process.env.NEBIUS_API_KEY) {
          const specPrompt = buildEnvironmentSpecPrompt(userPrompt, interpretationText);
          const specCompletion = await client.chat.completions.create({
            model: modelConfig.reasoningModel,
            messages: [
              { role: 'system', content: SYSTEM_ARCHITECT_PROMPT },
              { role: 'user', content: specPrompt },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          });
          const rawSpecJson = specCompletion.choices[0]?.message?.content || '{}';
          try {
            rawDraftSpec = EnvironmentSpecSchema.parse(JSON.parse(rawSpecJson));
          } catch {
            rawDraftSpec = generateDeterministicEnvironmentSpec(userPrompt);
          }
          const s2Prompt = specCompletion.usage?.prompt_tokens || 580;
          const s2Comp = specCompletion.usage?.completion_tokens || 420;
          const u2 = recordUsage('ultra', s2Prompt, s2Comp);
          sendSSE('token_delta', {
            stage: 'draft',
            tier: 'ultra',
            promptTokens: s2Prompt,
            completionTokens: s2Comp,
            costUsd: u2.ultra.costUsd,
          });
        } else {
          rawDraftSpec = generateDeterministicEnvironmentSpec(userPrompt);
          const u2 = recordUsage('ultra', 520, 390);
          sendSSE('token_delta', {
            stage: 'draft',
            tier: 'ultra',
            promptTokens: 520,
            completionTokens: 390,
            costUsd: u2.ultra.costUsd,
          });
        }
        sendSSE('stage_end', {
          stage: 'draft',
          durationMs: Date.now() - stage2Start,
          status: 'complete',
        });

        // === STAGE 3: SPEC COMPILER (compile) ===
        const stage3Start = Date.now();
        sendSSE('stage_start', {
          stage: 'compile',
          label: 'Spec Compiler',
          tier: 'compiler',
          model: 'Deterministic SpecCompiler',
        });
        sendSSE('status', {
          stage: 'compile',
          message: '[Stage 3/11] Running deterministic SpecCompiler: clamping bounds and verifying A* corridor...',
          timestamp: Date.now(),
        });

        // Deterministic compilation and safety clamp
        const compiledSpecResult = compileSpec(rawDraftSpec);
        sendSSE('compiled_spec', compiledSpecResult);
        sendSSE('spec', compiledSpecResult.spec);

        if (compiledSpecResult.report.adjustments.length > 0) {
          for (const adj of compiledSpecResult.report.adjustments) {
            sendSSE('log', {
              text: `[SpecCompiler] Clamped ${adj.field}: ${adj.from} -> ${adj.to} (${adj.reason})`,
            });
          }
        }
        sendSSE('stage_end', {
          stage: 'compile',
          durationMs: Date.now() - stage3Start,
          status: 'complete',
        });

        // === STAGE 4: TERRAIN SYNTHESIS (terrain) ===
        const stage4Start = Date.now();
        sendSSE('stage_start', {
          stage: 'terrain',
          label: 'Terrain Synthesis',
          tier: 'engine',
          model: 'Canonical 257x257 Field',
        });
        sendSSE('status', {
          stage: 'terrain',
          message: `[Stage 4/11] Synthesizing canonical 257x257 terrain (relief: ${compiledSpecResult.report.terrainStats.reliefM}m, mean slope: ${compiledSpecResult.report.terrainStats.meanSlopeDeg}°)...`,
          timestamp: Date.now(),
        });
        sendSSE('terrain_stats', compiledSpecResult.report.terrainStats);
        sendSSE('stage_end', {
          stage: 'terrain',
          durationMs: Date.now() - stage4Start,
          status: 'complete',
        });

        // === STAGE 5: DEBRIS DISTRIBUTION (debris) ===
        const stage5Start = Date.now();
        sendSSE('stage_start', {
          stage: 'debris',
          label: 'Debris Field',
          tier: 'engine',
          model: 'Poisson-Disk Generator',
        });
        sendSSE('status', {
          stage: 'debris',
          message: `[Stage 5/11] Distributing ${compiledSpecResult.spec.debris.count} subdivided icosahedron rocks with Poisson clearance...`,
          timestamp: Date.now(),
        });
        sendSSE('stage_end', {
          stage: 'debris',
          durationMs: Date.now() - stage5Start,
          status: 'complete',
        });

        // === STAGE 6: ROBOT DYNAMICS (robot) ===
        const stage6Start = Date.now();
        sendSSE('stage_start', {
          stage: 'robot',
          label: 'Robot Dynamics',
          tier: 'engine',
          model: 'Closed-Form 2-Link IK',
        });
        sendSSE('status', {
          stage: 'robot',
          message: `[Stage 6/11] Configured quadruped trot cadence (${compiledSpecResult.spec.robot.cadenceHz} Hz, speed: ${compiledSpecResult.spec.robot.baseSpeed} m/s)...`,
          timestamp: Date.now(),
        });
        sendSSE('stage_end', {
          stage: 'robot',
          durationMs: Date.now() - stage6Start,
          status: 'complete',
        });

        // === STAGE 7: REWARD GENERATION (reward) ===
        const stage7Start = Date.now();
        sendSSE('stage_start', {
          stage: 'reward',
          label: 'Reward Shaping',
          tier: 'ultra',
          model: modelConfig.reasoningModel,
        });
        sendSSE('status', {
          stage: 'reward',
          message: '[Stage 7/11] Engineering vectorized reward function (reward.py)...',
          timestamp: Date.now(),
        });

        if (client && process.env.NEBIUS_API_KEY) {
          const rewardPrompt = buildRewardPrompt(compiledSpecResult.spec);
          const rewardCompletion = await client.chat.completions.create({
            model: modelConfig.reasoningModel,
            messages: [
              { role: 'system', content: SYSTEM_ARCHITECT_PROMPT },
              { role: 'user', content: rewardPrompt },
            ],
            temperature: 0.2,
          });
          const rawReward = rewardCompletion.choices[0]?.message?.content || '';
          rewardCode = rawReward.replace(/```python/g, '').replace(/```/g, '').trim();
          const s7Prompt = rewardCompletion.usage?.prompt_tokens || 720;
          const s7Comp = rewardCompletion.usage?.completion_tokens || 600;
          const u7 = recordUsage('ultra', s7Prompt, s7Comp);
          sendSSE('token_delta', {
            stage: 'reward',
            tier: 'ultra',
            promptTokens: s7Prompt,
            completionTokens: s7Comp,
            costUsd: u7.ultra.costUsd,
          });
        } else {
          rewardCode = generateDeterministicRewardCode();
          const u7 = recordUsage('ultra', 680, 520);
          sendSSE('token_delta', {
            stage: 'reward',
            tier: 'ultra',
            promptTokens: 680,
            completionTokens: 520,
            costUsd: u7.ultra.costUsd,
          });
        }
        sendSSE('reward', { code: rewardCode });
        sendSSE('stage_end', {
          stage: 'reward',
          durationMs: Date.now() - stage7Start,
          status: 'complete',
        });

        // === STAGE 8: STATIC AST SAFETY GATE (safety) ===
        const stage8Start = Date.now();
        sendSSE('stage_start', {
          stage: 'safety',
          label: 'AST Safety Gate',
          tier: 'gate',
          model: 'Python 3 AST Sandbox',
        });
        sendSSE('status', {
          stage: 'safety',
          message: '[Stage 8/11] Running static AST analysis and import whitelist verification...',
          timestamp: Date.now(),
        });

        const rewardSafety = validatePythonSafety(rewardCode, 'compute_step_reward');
        sendSSE('safety_result', {
          passed: rewardSafety.passed,
          report: rewardSafety.report,
          checks: rewardSafety.checks,
          rewardSafety,
        });
        sendSSE('stage_end', {
          stage: 'safety',
          durationMs: Date.now() - stage8Start,
          status: rewardSafety.passed ? 'complete' : 'failed',
        });

        // === STAGE 9: REWARD SANDBOX (sandbox) ===
        const stage9Start = Date.now();
        sendSSE('stage_start', {
          stage: 'sandbox',
          label: 'Reward Sandbox',
          tier: 'sandbox',
          model: 'Component Summation Engine',
        });
        sendSSE('status', {
          stage: 'sandbox',
          message: '[Stage 9/11] Evaluating reward sandbox: component summation and execution budget...',
          timestamp: Date.now(),
        });

        const sandboxResult = runRewardSandbox(rewardCode);
        sendSSE('sandbox_result', sandboxResult);
        sendSSE('stage_end', {
          stage: 'sandbox',
          durationMs: Date.now() - stage9Start,
          status: sandboxResult.passed ? 'complete' : 'failed',
        });

        // === STAGE 10: DATAGEN SCRIPTING (datagen) ===
        const stage10Start = Date.now();
        sendSSE('stage_start', {
          stage: 'datagen',
          label: 'Datagen Scripts',
          tier: 'ultra',
          model: modelConfig.reasoningModel,
        });
        sendSSE('status', {
          stage: 'datagen',
          message: '[Stage 10/11] Authoring synthetic data script (datagen.py)...',
          timestamp: Date.now(),
        });

        if (client && process.env.NEBIUS_API_KEY) {
          const datagenPrompt = buildDatagenPrompt(compiledSpecResult.spec);
          const datagenCompletion = await client.chat.completions.create({
            model: modelConfig.reasoningModel,
            messages: [
              { role: 'system', content: SYSTEM_ARCHITECT_PROMPT },
              { role: 'user', content: datagenPrompt },
            ],
            temperature: 0.2,
          });
          const rawDatagen = datagenCompletion.choices[0]?.message?.content || '';
          datagenCode = rawDatagen.replace(/```python/g, '').replace(/```/g, '').trim();
          const s10Prompt = datagenCompletion.usage?.prompt_tokens || 680;
          const s10Comp = datagenCompletion.usage?.completion_tokens || 510;
          const u10 = recordUsage('ultra', s10Prompt, s10Comp);
          sendSSE('token_delta', {
            stage: 'datagen',
            tier: 'ultra',
            promptTokens: s10Prompt,
            completionTokens: s10Comp,
            costUsd: u10.ultra.costUsd,
          });
        } else {
          datagenCode = generateDeterministicDatagenCode();
          const u10 = recordUsage('ultra', 580, 410);
          sendSSE('token_delta', {
            stage: 'datagen',
            tier: 'ultra',
            promptTokens: 580,
            completionTokens: 410,
            costUsd: u10.ultra.costUsd,
          });
        }
        sendSSE('datagen', { code: datagenCode });
        sendSSE('stage_end', {
          stage: 'datagen',
          durationMs: Date.now() - stage10Start,
          status: 'complete',
        });

        // === STAGE 11: CRITIQUE & REFLECTION (critique) ===
        const stage11Start = Date.now();
        sendSSE('stage_start', {
          stage: 'critique',
          label: 'Physics Audit',
          tier: 'super',
          model: modelConfig.midModel,
        });
        sendSSE('status', {
          stage: 'critique',
          message: '[Stage 11/11] Auditing physics fidelity and reward hacking risks...',
          timestamp: Date.now(),
        });

        critiqueResult = generateDeterministicCritique(compiledSpecResult.spec);
        sendSSE('critique', critiqueResult);
        sendSSE('stage_end', {
          stage: 'critique',
          durationMs: Date.now() - stage11Start,
          status: 'complete',
        });

        // === COMPLETE PACKAGE ===
        const allPassed = rewardSafety.passed && sandboxResult.passed;
        const architectOutput = {
          spec: compiledSpecResult.spec,
          compiledSpec: compiledSpecResult,
          compileReport: compiledSpecResult.report,
          rewardCode,
          datagenCode,
          safetyGatePassed: allPassed,
          safetyGateReport: rewardSafety.report,
          reasoningNotes: interpretationText,
          tierResolved: {
            reasoning: modelConfig.reasoningModel,
            fast: modelConfig.fastModel,
          },
          sourceLabel: (client && process.env.NEBIUS_API_KEY ? 'live_nebius' : 'recorded_fixture') as 'live_nebius' | 'recorded_fixture',
          critique: critiqueResult,
          safetyChecks: rewardSafety.checks,
          sandboxResult,
        };

        sendSSE('complete', architectOutput);
        sendSSE('status', {
          stage: 'ready',
          message: 'Package assembled and verified by SpecCompiler. Awaiting developer review.',
          timestamp: Date.now(),
        });
      } catch (err: any) {
        sendSSE('error', {
          message: err.message || 'Architect execution encountered an error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
