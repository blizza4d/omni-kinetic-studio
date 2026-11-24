'use client';

import React, { useState } from 'react';
import { Play, Check, AlertTriangle, Code, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import {
  BUILT_IN_CONTROLLERS,
  compileUserCode,
  validateControllerOutput,
  Observation,
  ControllerCtx,
} from '@/lib/control/sandbox';

interface ControllerPlaygroundTabProps {
  onApplyController?: (code: string) => void;
}

export function ControllerPlaygroundTab({ onApplyController }: ControllerPlaygroundTabProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('go_to_goal');
  const [code, setCode] = useState<string>(BUILT_IN_CONTROLLERS.go_to_goal.code);
  const [compilationStatus, setCompilationStatus] = useState<{
    ok: boolean;
    error?: string;
    checked: boolean;
    compiledAt?: string;
  }>({ ok: true, checked: false });
  const [testOutput, setTestOutput] = useState<{
    action?: any;
    elapsedMs?: number;
    budgetExceeded?: boolean;
    error?: string;
  } | null>(null);

  const handleTemplateSelect = (key: string) => {
    setSelectedTemplate(key);
    const tmpl = (BUILT_IN_CONTROLLERS as any)[key];
    if (tmpl) {
      setCode(tmpl.code);
      setCompilationStatus({ ok: true, checked: false });
      setTestOutput(null);
    }
  };

  const handleCompileAndTest = () => {
    const res = compileUserCode(code);
    if (!res.ok || !res.fn) {
      setCompilationStatus({
        ok: false,
        error: res.error || 'Syntax or security validation failed.',
        checked: true,
        compiledAt: new Date().toLocaleTimeString(),
      });
      setTestOutput(null);
      return;
    }

    setCompilationStatus({
      ok: true,
      checked: true,
      compiledAt: new Date().toLocaleTimeString(),
    });

    // Run mock step with watchdog timing
    const mockObs: Observation = {
      t: 1.25,
      dt: 1 / 60,
      pose: {
        x: 1.2,
        z: -2.1,
        heading: 0.15,
        pitch: -2.4,
        roll: 1.2,
      },
      vel: {
        forward: 0.8,
        lateral: 0.0,
        yawRate: 0.05,
      },
      gravity: 1.62,
      contacts: [true, true, true, true],
      goal: {
        x: 5.0,
        z: -6.0,
        distance: 5.5,
        bearing: 0.35,
      },
      edgeDistance: 14.5,
    };

    const mockCtx: ControllerCtx = {
      seed: 42,
      storage: {},
      log: () => {},
    };

    try {
      const t0 = performance.now();
      const rawCmd = res.fn(mockObs, mockCtx);
      const action = validateControllerOutput(rawCmd);
      const elapsedMs = performance.now() - t0;

      setTestOutput({
        action,
        elapsedMs,
        budgetExceeded: elapsedMs > 2.0,
      });

      if (onApplyController) {
        onApplyController(code);
      }
    } catch (err: any) {
      setTestOutput({
        error: err?.message || 'Controller runtime error',
        elapsedMs: 0,
        budgetExceeded: false,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4 font-mono text-xs text-cream select-text">
      {/* Header & Template Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-cream/10 pb-3">
        <div className="flex items-center space-x-2">
          <Code className="w-4 h-4 text-sage" />
          <span className="font-bold text-sm uppercase tracking-wide">Controller Playground</span>
          <span className="text-[10px] bg-sage/20 text-sage px-1.5 py-0.5 rounded border border-sage/40">
            PACK A ★
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <label htmlFor="ctrl-template" className="text-cream-dim text-[11px]">
            Template:
          </label>
          <select
            id="ctrl-template"
            value={selectedTemplate}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="bg-charcoal border border-cream/20 text-cream px-2 py-1 rounded text-xs focus:outline-none focus:border-sage"
          >
            {Object.entries(BUILT_IN_CONTROLLERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="text-[11px] text-cream-dim bg-charcoal-deep/60 p-2.5 rounded border border-cream/10 leading-relaxed">
        {(BUILT_IN_CONTROLLERS as any)[selectedTemplate]?.description ||
          'Define a deterministic controller callback receiving Observation and returning LocomotionAction.'}
      </div>

      {/* Code Editor Area */}
      <div className="space-y-1.5 flex-1 flex flex-col">
        <div className="flex items-center justify-between text-[11px] text-cream-dim">
          <span>controller.js (AST Sandboxed · Watchdog 2.0ms budget)</span>
          <span>{code.split('\n').length} lines</span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={12}
          className="w-full flex-1 bg-charcoal border border-cream/15 rounded-lg p-3 text-[11px] font-mono leading-relaxed text-cream focus:outline-none focus:border-sage resize-y selection:bg-sage/40"
        />
      </div>

      {/* Actions & Verification Bar */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCompileAndTest}
            className="px-3.5 py-1.5 rounded-lg bg-sage hover:bg-sage-light text-cream font-bold flex items-center space-x-1.5 shadow-md shadow-sage/20 transition-all text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Verify & Execute Step</span>
          </button>
          <button
            type="button"
            onClick={() => handleTemplateSelect(selectedTemplate)}
            className="px-2.5 py-1.5 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream flex items-center space-x-1 text-xs"
            title="Reset code to template"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {compilationStatus.checked && (
          <div className="flex items-center space-x-1.5 text-[11px]">
            {compilationStatus.ok ? (
              <span className="text-sage flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified ({compilationStatus.compiledAt})</span>
              </span>
            ) : (
              <span className="text-brick flex items-center space-x-1 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Validation Error</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Compiler / Watchdog Diagnostics */}
      {compilationStatus.checked && !compilationStatus.ok && (
        <div className="p-3 rounded-lg bg-brick/15 border border-brick/40 text-brick text-[11px] font-mono">
          <strong>Security / Syntax Error:</strong>
          <pre className="mt-1 whitespace-pre-wrap">{compilationStatus.error}</pre>
        </div>
      )}

      {testOutput && (
        <div className="p-3 rounded-lg bg-charcoal-deep/90 border border-cream/10 space-y-2 text-[11px]">
          <div className="flex items-center justify-between border-b border-cream/10 pb-1.5">
            <span className="font-bold text-cream flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 text-sage" />
              <span>Watchdog Step Result</span>
            </span>
            <span className="text-cream-dim tabular-nums">
              Execution: <strong className="text-cream">{(testOutput.elapsedMs ?? 0).toFixed(2)} ms</strong> / 2.0 ms
            </span>
          </div>

          {testOutput.error ? (
            <div className="text-brick">Error: {testOutput.error}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <div className="text-[10px] text-cream-dim">vx (Forward)</div>
                <div className="text-cream font-bold tabular-nums">
                  {testOutput.action?.vx?.toFixed(2) ?? '0.00'} m/s
                </div>
              </div>
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <div className="text-[10px] text-cream-dim">vy (Lateral)</div>
                <div className="text-cream font-bold tabular-nums">
                  {testOutput.action?.vy?.toFixed(2) ?? '0.00'} m/s
                </div>
              </div>
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <div className="text-[10px] text-cream-dim">yawRate</div>
                <div className="text-cream font-bold tabular-nums">
                  {testOutput.action?.yawRate?.toFixed(2) ?? '0.00'} rad/s
                </div>
              </div>
              <div className="bg-charcoal p-2 rounded border border-cream/10">
                <div className="text-[10px] text-cream-dim">hop</div>
                <div className="text-cream font-bold">
                  {testOutput.action?.hop ? `YES (${(testOutput.action?.hopCharge ?? 0).toFixed(1)})` : 'NO'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
