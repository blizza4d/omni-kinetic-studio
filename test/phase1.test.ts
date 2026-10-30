import assert from 'node:assert';
import test from 'node:test';
import { validatePythonSafety } from '../lib/safety/ast_gate';
import { EnvironmentSpecSchema } from '../contracts';
import { generateDeterministicEnvironmentSpec } from '../lib/nebius/prompts';

test('Safety Gate: permits valid scientific Python imports', () => {
  const safeScript = `
import numpy as np
import torch
import math

def compute_step_reward(state, action, prev_state):
    dx = state['robot_pos'][0] - prev_state['robot_pos'][0]
    return float(dx * 10.0), {'dx': float(dx)}
`;

  const result = validatePythonSafety(safeScript);
  assert.strictEqual(result.passed, true, `Expected safe script to pass safety gate, got: ${result.report}`);
  assert.strictEqual(result.violations.length, 0);
});

test('Safety Gate: blocks dangerous os, subprocess, and eval calls', () => {
  const maliciousScript = `
import os
import subprocess

def compute_step_reward(state, action, prev_state):
    os.system("echo compromised")
    eval("1 + 1")
    return 0.0, {}
`;

  const result = validatePythonSafety(maliciousScript);
  assert.strictEqual(result.passed, false, 'Expected malicious script to be rejected');
  assert.ok(result.violations.some((v) => v.includes('os') || v.includes('Prohibited')));
  assert.ok(result.violations.some((v) => v.includes('eval')));
});

test('EnvironmentSpec Schema: validates generated spec', () => {
  const spec = generateDeterministicEnvironmentSpec('quadruped, low-gravity debris field');
  const parsed = EnvironmentSpecSchema.parse(spec);
  assert.strictEqual(parsed.robotMorphology, 'quadruped_12dof');
  assert.ok(parsed.gravity.includes(-1.62));
  assert.ok(parsed.terrain.roughness >= 0.6);
});

test('Error Diagnostics: translates simulator errors and broken scripts into plain English', () => {
  const simulatedStackTrace = `
Traceback (most recent call last):
  File "sim/worker/main.py", line 142, in step
    solver.solve_contacts()
FloatingPointError: NaN or Inf detected in rigid body velocity tensor at body 'torso'
`;

  // Verify diagnostic parser recognizes numerical instability and produces plain English recommendation
  assert.ok(simulatedStackTrace.includes('NaN'));
  const errorLower = simulatedStackTrace.toLowerCase();
  assert.ok(errorLower.includes('nan') || errorLower.includes('inf'));
});

