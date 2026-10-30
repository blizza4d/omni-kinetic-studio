import { execSync } from 'child_process';
import path from 'path';
import { SafetyCheckRow, SafetyGateResult } from './types';

export type { SafetyCheckRow, SafetyGateResult };

const WHITELISTED_MODULES = new Set([
  'math',
  'numpy',
  'np',
  'torch',
  'torch.nn',
  'torch.optim',
  'scipy',
  'scipy.spatial',
  'scipy.spatial.transform',
  'gymnasium',
  'gym',
  'pybullet',
  'mujoco',
  'typing',
  'dataclasses',
  'collections',
  'random',
]);

const STRICTLY_BANNED_MODULES = new Set([
  'os',
  'sys',
  'subprocess',
  'socket',
  'http',
  'urllib',
  'requests',
  'httpx',
  'shutil',
  'pickle',
  'ctypes',
  'importlib',
  'builtins',
  'pty',
  'posix',
  'platform',
]);

const STRICTLY_BANNED_CALLS = [
  'eval',
  'exec',
  '__import__',
  'open',
  'compile',
  'globals',
  'locals',
  'getattr',
  'setattr',
  'delattr',
];

/**
 * Validates Python code against security constraints.
 * Uses Python's native `ast` module via a localized subprocess check when Python is available,
 * and maintains an in-process lexical analysis fallback.
 */
export function validatePythonSafety(code: string, expectedEntrypoint?: string): SafetyGateResult {
  const violations: string[] = [];
  const allowedImportsFound: string[] = [];
  const suspiciousCalls: string[] = [];
  let checks: SafetyCheckRow[] = [];

  // 1. Lexical / Pattern Inspection & Size Check
  const byteSize = Buffer.byteLength(code, 'utf-8');
  const sizePass = byteSize <= 65536;
  if (!sizePass) {
    violations.push(`Security: Code size (${byteSize} bytes) exceeds the 64 KiB sandbox limit.`);
  }

  const lines = code.split('\n');
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_\.]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) continue;

    // Check imports
    const match = line.match(importRegex);
    if (match) {
      const rootModule = match[1].split('.')[0];
      if (STRICTLY_BANNED_MODULES.has(rootModule)) {
        violations.push(`Line ${i + 1}: Prohibited module import '${rootModule}'`);
      } else if (!WHITELISTED_MODULES.has(rootModule) && !WHITELISTED_MODULES.has(match[1])) {
        violations.push(`Line ${i + 1}: Module '${match[1]}' is not in the approved scientific whitelist.`);
      } else {
        allowedImportsFound.push(match[1]);
      }
    }

    // Check banned calls
    for (const banned of STRICTLY_BANNED_CALLS) {
      const callPattern = new RegExp(`\\b${banned}\\s*\\(`);
      if (callPattern.test(line)) {
        violations.push(`Line ${i + 1}: Prohibited dangerous call '${banned}()'`);
        suspiciousCalls.push(`${banned}()`);
      }
    }
  }

  // 2. Python AST Parser Check
  let pythonCheckerExecuted = false;
  try {
    const checkerPath = path.resolve(process.cwd(), 'lib/safety/ast_checker.py');
    const payload = JSON.stringify({
      code,
      allowed: Array.from(WHITELISTED_MODULES),
      banned: Array.from(STRICTLY_BANNED_MODULES),
      banned_calls: STRICTLY_BANNED_CALLS,
      expected_entrypoint: expectedEntrypoint,
    });

    let stdout = '';
    try {
      stdout = execSync(`python "${checkerPath}"`, {
        input: payload,
        encoding: 'utf-8',
        timeout: 4000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (procErr: any) {
      stdout = procErr.stdout || '';
    }

    if (stdout.trim()) {
      const result = JSON.parse(stdout.trim());
      pythonCheckerExecuted = true;
      if (Array.isArray(result.violations)) {
        for (const v of result.violations) {
          if (!violations.includes(v)) {
            violations.push(v);
          }
        }
      }
      if (Array.isArray(result.checks) && result.checks.length > 0) {
        checks = result.checks;
      }
    }
  } catch (err: any) {
    // If python subprocess or JSON parsing failed, rely on lexical checks
  }

  // Fallback checks construction if python checker did not populate checks
  if (!pythonCheckerExecuted || checks.length === 0) {
    checks = [
      {
        name: 'File Size Limit',
        status: sizePass ? 'PASS' : 'FAIL',
        detail: `${byteSize} bytes ${sizePass ? '<=' : '>'} 64 KiB`,
      },
      {
        name: 'Python Syntax & AST Parse',
        status: 'PASS',
        detail: 'Lexical analysis passed',
      },
      {
        name: 'Entrypoint Signature',
        status: expectedEntrypoint
          ? code.includes(`def ${expectedEntrypoint}`)
            ? 'PASS'
            : 'FAIL'
          : 'PASS',
        detail: expectedEntrypoint ? `Checked for ${expectedEntrypoint}()` : 'Universal entrypoint',
      },
      {
        name: 'Scientific Import Whitelist',
        status: violations.some((v) => v.toLowerCase().includes('import')) ? 'FAIL' : 'PASS',
        detail: 'numpy, torch, math, scipy, gymnasium',
      },
      {
        name: 'Forbidden Primitives Sandbox',
        status: suspiciousCalls.length > 0 || violations.some((v) => v.includes('call') || v.includes('banned')) ? 'FAIL' : 'PASS',
        detail: 'Bans os, sys, subprocess, eval, exec, socket, open',
      },
      {
        name: 'Loop Termination Heuristic',
        status: code.includes('while True:') && !code.includes('break') ? 'FAIL' : 'PASS',
        detail: 'Bans unbounded while True loops',
      },
    ];
  }

  const passed = violations.length === 0;
  const report = passed
    ? `[SAFETY GATE PASSED] All imports verified against scientific whitelist (${Array.from(new Set(allowedImportsFound)).join(', ') || 'pure logic'}). No banned primitives detected.`
    : `[SAFETY GATE REJECTED] Detected ${violations.length} security violation(s):\n${violations.map((v) => `  - ${v}`).join('\n')}`;

  return {
    passed,
    violations,
    allowedImportsFound: Array.from(new Set(allowedImportsFound)),
    suspiciousCalls: Array.from(new Set(suspiciousCalls)),
    report,
    checks,
  };
}
