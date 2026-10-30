import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePythonSafety } from '../lib/safety/ast_gate';
import { generateDeterministicRewardCode } from '../lib/nebius/prompts';

test('Phase 4 Safety Gate: Valid deterministic reward code passes all checks', () => {
  const code = generateDeterministicRewardCode();
  const res = validatePythonSafety(code, 'compute_step_reward');

  assert.equal(res.passed, true, `Expected valid code to pass, violations: ${res.violations.join(', ')}`);
  assert.equal(res.violations.length, 0);
  assert.ok(res.checks.length >= 6);

  for (const check of res.checks) {
    assert.equal(check.status, 'PASS', `Check '${check.name}' expected PASS but got ${check.status}: ${check.detail}`);
  }
});

test('Phase 4 Safety Gate: Malicious import (os, subprocess, sys) blocked', () => {
  const badCode1 = `import os\nprint(os.listdir("."))`;
  const res1 = validatePythonSafety(badCode1);
  assert.equal(res1.passed, false);
  assert.ok(res1.violations.some((v) => v.includes('os')));

  const badCode2 = `import subprocess\nsubprocess.run(["ls"])`;
  const res2 = validatePythonSafety(badCode2);
  assert.equal(res2.passed, false);
  assert.ok(res2.violations.some((v) => v.includes('subprocess')));
});

test('Phase 4 Safety Gate: Dangerous primitives (eval, exec, open) blocked', () => {
  const badCode1 = `import numpy as np\ndef compute_step_reward(s, a, p):\n    eval("import os")\n    return 0.0, {}`;
  const res1 = validatePythonSafety(badCode1);
  assert.equal(res1.passed, false);
  assert.ok(res1.violations.some((v) => v.toLowerCase().includes('eval')));

  const badCode2 = `import numpy as np\ndef compute_step_reward(s, a, p):\n    f = open("key.txt")\n    return 0.0, {}`;
  const res2 = validatePythonSafety(badCode2);
  assert.equal(res2.passed, false);
  assert.ok(res2.violations.some((v) => v.toLowerCase().includes('open')));
});

test('Phase 4 Safety Gate: Infinite while True loop without break blocked', () => {
  const badCode = `import numpy as np\ndef compute_step_reward(s, a, p):\n    while True:\n        x = 1\n    return 0.0, {}`;
  const res = validatePythonSafety(badCode);
  assert.equal(res.passed, false);
  assert.ok(res.violations.some((v) => v.toLowerCase().includes('loop') || v.toLowerCase().includes('while')));
});

test('Phase 4 Safety Gate: Code exceeding 64 KiB cap is blocked', () => {
  const largeComments = '# ' + 'A'.repeat(70000) + '\n';
  const badCode = `import numpy as np\n${largeComments}\ndef compute_step_reward(s, a, p):\n    return 1.0, {}`;
  const res = validatePythonSafety(badCode);
  assert.equal(res.passed, false);
  assert.ok(res.violations.some((v) => v.toLowerCase().includes('64 kib') || v.toLowerCase().includes('size')));
});

test('Phase 4 Safety Gate: Missing entrypoint function is flagged', () => {
  const code = `import numpy as np\ndef some_other_func():\n    return 1.0`;
  const res = validatePythonSafety(code, 'compute_step_reward');
  assert.equal(res.passed, false);
  assert.ok(res.violations.some((v) => v.includes('compute_step_reward')));
  const entryCheck = res.checks.find((c) => c.name === 'Entrypoint Signature');
  assert.ok(entryCheck);
  assert.equal(entryCheck?.status, 'FAIL');
});
