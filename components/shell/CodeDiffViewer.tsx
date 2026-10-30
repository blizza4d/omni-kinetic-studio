'use client';

import React, { useState } from 'react';
import {
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Edit3,
  Eye,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import { SafetyCheckRow } from '@/lib/safety/types';

interface CodeDiffViewerProps {
  initialRewardCode: string;
  initialDatagenCode: string;
  onApprove: (finalReward: string, finalDatagen: string) => void;
  onRejectWithFeedback: (feedback: string) => void;
  isDeploying?: boolean;
}

export default function CodeDiffViewer({
  initialRewardCode,
  initialDatagenCode,
  onApprove,
  onRejectWithFeedback,
  isDeploying = false,
}: CodeDiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<'reward' | 'datagen'>('reward');
  const [isEditing, setIsEditing] = useState(false);
  const [rewardCode, setRewardCode] = useState(initialRewardCode);
  const [datagenCode, setDatagenCode] = useState(initialDatagenCode);
  const [validationResult, setValidationResult] = useState<{
    passed: boolean;
    violations: string[];
    checks: SafetyCheckRow[];
  } | null>(null);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

  const activeCode = selectedFile === 'reward' ? rewardCode : datagenCode;
  const setActiveCode = (val: string) => {
    if (selectedFile === 'reward') setRewardCode(val);
    else setDatagenCode(val);
  };

  const handleValidate = async () => {
    const entrypoint = selectedFile === 'reward' ? 'compute_step_reward' : 'generate_demonstrations';
    try {
      const res = await fetch('/api/safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeCode, expectedEntrypoint: entrypoint }),
      });
      if (res.ok) {
        const data = await res.json();
        setValidationResult({
          passed: data.passed,
          violations: data.violations,
          checks: data.checks || [],
        });
      }
    } catch (err) {
      console.warn('AST validation call failed:', err);
    }
  };

  const handleApprove = () => {
    onApprove(rewardCode, datagenCode);
  };

  const handleConfirmReject = () => {
    setIsRejectModalOpen(false);
    onRejectWithFeedback(rejectFeedback || 'Code rejected by developer review. Adjust constraints.');
    setRejectFeedback('');
  };

  return (
    <div className="flex-1 flex flex-col h-full font-mono text-xs overflow-hidden select-text">
      {/* File Selector & Action Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cream/10 bg-charcoal-deep/60">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              setSelectedFile('reward');
              setValidationResult(null);
            }}
            className={`px-2.5 py-1 rounded text-[11px] transition-colors flex items-center space-x-1 ${
              selectedFile === 'reward'
                ? 'bg-charcoal text-cream font-bold border border-cream/15'
                : 'text-cream-dim hover:text-cream'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-sage" />
            <span>reward.py</span>
          </button>
          <button
            onClick={() => {
              setSelectedFile('datagen');
              setValidationResult(null);
            }}
            className={`px-2.5 py-1 rounded text-[11px] transition-colors flex items-center space-x-1 ${
              selectedFile === 'datagen'
                ? 'bg-charcoal text-cream font-bold border border-cream/15'
                : 'text-cream-dim hover:text-cream'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-sage" />
            <span>datagen.py</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* View vs Edit Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-2 py-1 rounded text-[10px] flex items-center space-x-1 border transition-colors ${
              isEditing
                ? 'bg-sage/20 border-sage/50 text-sage'
                : 'bg-charcoal border-cream/10 text-cream-dim hover:text-cream'
            }`}
          >
            {isEditing ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
            <span>{isEditing ? 'View Diff' : 'Edit Code'}</span>
          </button>

          {/* Re-validate AST button */}
          <button
            onClick={handleValidate}
            className="px-2 py-1 rounded text-[10px] bg-charcoal hover:bg-charcoal-light border border-cream/15 text-cream-dim hover:text-cream flex items-center space-x-1 transition-colors"
            title="Re-run static AST safety gate"
          >
            <ShieldCheck className="w-3 h-3 text-sage" />
            <span>Validate AST</span>
          </button>
        </div>
      </div>

      {/* Validation Banner if validated */}
      {validationResult && (
        <div
          className={`px-3 py-1.5 border-b text-[10px] flex items-center justify-between ${
            validationResult.passed
              ? 'bg-sage/10 border-sage/30 text-sage'
              : 'bg-brick/10 border-brick/30 text-brick'
          }`}
        >
          <div className="flex items-center space-x-1.5">
            {validationResult.passed ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>
              {validationResult.passed
                ? 'AST validation passed. 100% compliant with sandbox.'
                : `${validationResult.violations.length} AST security violations detected!`}
            </span>
          </div>
          <button
            onClick={() => setValidationResult(null)}
            className="text-cream-dim hover:text-cream"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Code Editor / Diff Area */}
      <div className="flex-1 p-3 overflow-y-auto bg-charcoal-deep/30">
        {isEditing ? (
          <textarea
            value={activeCode}
            onChange={(e) => setActiveCode(e.target.value)}
            className="w-full h-full bg-charcoal-deep/90 text-cream font-mono text-[11px] p-3 rounded-lg border border-cream/10 resize-none focus:outline-none focus:border-sage leading-relaxed"
            spellCheck={false}
          />
        ) : (
          <div className="bg-charcoal-deep/80 rounded-lg border border-cream/10 p-3 overflow-x-auto">
            <pre className="text-[11px] leading-relaxed text-cream whitespace-pre">
              {activeCode.split('\n').map((line, idx) => {
                const isComment = line.trim().startsWith('#');
                const isImport = line.trim().startsWith('import ') || line.trim().startsWith('from ');
                const isDef = line.trim().startsWith('def ');
                const isReturn = line.trim().startsWith('return ');

                return (
                  <div key={idx} className="table-row">
                    <span className="table-cell pr-3 text-cream-dim/40 select-none text-right w-8 text-[10px]">
                      {idx + 1}
                    </span>
                    <span
                      className={`table-cell ${
                        isComment
                          ? 'text-cream-dim/60 italic'
                          : isImport
                          ? 'text-sage font-semibold'
                          : isDef
                          ? 'text-cream font-bold'
                          : isReturn
                          ? 'text-sage font-bold'
                          : 'text-cream'
                      }`}
                    >
                      {line || '\n'}
                    </span>
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </div>

      {/* Action Approval Bar */}
      <div className="p-3 border-t border-cream/10 bg-charcoal-deep/80 flex items-center space-x-2">
        <button
          onClick={handleApprove}
          disabled={isDeploying}
          className="flex-1 py-2 px-3 rounded-lg bg-sage hover:bg-sage-light text-cream font-mono text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-sage/20 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isDeploying ? 'Deploying Job...' : 'Approve & Deploy'}</span>
        </button>

        <button
          onClick={() => setIsRejectModalOpen(true)}
          className="py-2 px-3 rounded-lg bg-charcoal hover:bg-charcoal-light border border-cream/20 text-cream-dim hover:text-cream font-mono text-xs flex items-center justify-center space-x-1 transition-colors"
          title="Reject and provide feedback to Architect"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reject & Retry</span>
        </button>
      </div>

      {/* Reject Feedback Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-deep/70 backdrop-blur-sm">
          <div className="w-full max-w-sm analog-glass-elevated border border-cream/20 rounded-xl p-4 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-cream">Reject & Request Retry</h3>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="p-1 rounded text-cream-dim hover:text-cream"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-cream-dim">
              Provide feedback or physics adjustments for the Nemotron Architect retry loop:
            </p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="e.g. Increase stability penalty on roll angle, debris is too dense..."
              className="w-full h-20 bg-charcoal text-cream font-mono text-[11px] p-2 rounded border border-cream/15 focus:outline-none focus:border-sage resize-none"
            />
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 rounded bg-charcoal hover:bg-charcoal-light text-cream-dim text-[11px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-3 py-1.5 rounded bg-brick hover:bg-brick-light text-cream font-semibold text-[11px]"
              >
                Submit Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
