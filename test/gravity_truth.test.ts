import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSpec } from '../lib/spec/compiler';
import { formatGravityDisplay, parseGravityInput } from '../lib/spec/gravity';

test('Gravity Truth: parseGravityInput accurately parses strings, numbers, presets, and clamps', () => {
  // Named presets
  assert.deepStrictEqual(parseGravityInput('moon'), [0, -1.62, 0]);
  assert.deepStrictEqual(parseGravityInput('lunar'), [0, -1.62, 0]);
  assert.deepStrictEqual(parseGravityInput('mars'), [0, -3.72, 0]);
  assert.deepStrictEqual(parseGravityInput('earth'), [0, -9.81, 0]);

  // Unit strings
  const lunarG = parseGravityInput('0.165 g');
  assert.ok(Math.abs(lunarG[1] - -1.618) < 0.05, `Expected ~ -1.62, got ${lunarG[1]}`);

  const lunarMs2 = parseGravityInput('1.62 m/s2');
  assert.deepStrictEqual(lunarMs2, [0, -1.62, 0]);

  const earthMs2 = parseGravityInput('9.81 m/s²');
  assert.deepStrictEqual(earthMs2, [0, -9.81, 0]);

  // Clamping: zero gravity is clamped to minimum -0.1 m/s² downward
  const zeroG = parseGravityInput([0, 0, 0]);
  assert.ok(zeroG[1] <= -0.1, `Zero gravity must be clamped to at least -0.1 m/s², got ${zeroG[1]}`);

  const zeroStr = parseGravityInput('0 m/s2');
  assert.ok(zeroStr[1] <= -0.1, `Zero gravity string must be clamped to at least -0.1 m/s², got ${zeroStr[1]}`);
});

test('Gravity Truth: formatGravityDisplay truthful formatting with units and celestial body', () => {
  // Lunar gravity
  const moonStr = formatGravityDisplay([0, -1.62, 0]);
  assert.equal(moonStr, '1.62 m/s² (0.165 g, Moon)');

  // Earth gravity
  const earthStr = formatGravityDisplay([0, -9.81, 0]);
  assert.equal(earthStr, '9.81 m/s² (1.00 g, Earth)');

  // Mars gravity
  const marsStr = formatGravityDisplay([0, -3.72, 0]);
  assert.equal(marsStr, '3.72 m/s² (0.38 g, Mars)');

  // Custom gravity
  const customStr = formatGravityDisplay([0, -5.0, 0]);
  assert.equal(customStr, '5.00 m/s² (0.51 g)');

  // Invariant: Never display "0 m/s²" when vertical gravity is non-zero
  assert.notEqual(moonStr, '0 m/s²');
  assert.notEqual(earthStr, '0 m/s²');
});

test('Gravity Truth: compileSpec handles gravity inputs and never outputs zero vertical gravity', () => {
  // 1. Lunar prompt default
  const resMoon = compileSpec({ gravity: 'moon' });
  assert.equal(resMoon.spec.gravity[1], -1.62);
  assert.notEqual(resMoon.spec.gravity[1], 0);

  // 2. Earth spec
  const resEarth = compileSpec({ gravity: 'earth' });
  assert.equal(resEarth.spec.gravity[1], -9.81);

  // 3. String units spec
  const resG = compileSpec({ gravity: '0.16 g' });
  assert.ok(resG.spec.gravity[1] < -1.5 && resG.spec.gravity[1] > -1.7);

  // 4. Zero gravity clamp
  const resZero = compileSpec({ gravity: [0, 0, 0] });
  assert.ok(resZero.spec.gravity[1] <= -0.1, 'Vertical gravity must never be zero');
});
