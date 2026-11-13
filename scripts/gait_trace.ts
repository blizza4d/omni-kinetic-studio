/**
 * Headless Gait Trace CI Verification Test
 * 
 * Runs the deterministic fluid animation pipeline and asserts all Section 4.3
 * acceptance thresholds specified in docs/animation_thresholds.json:
 * - Root Jerk RMS < 3,000 m/s³ (>= 50% lower than baseline)
 * - Mean Foot Slip < 0.5% of leg length
 * - Max Foot Slip < 2.0% of leg length
 * - Camera Relative Jitter < 15.0 px
 * - Judder Index < 0.03
 */

import * as fs from 'fs';
import * as path from 'path';
import { recordAfterTrace } from './record_after_trace';
import { recordBaselineTrace } from './record_baseline_trace';

export function runGaitTraceTest(): boolean {
  console.log('=== RUNNING HEADLESS GAIT TRACE CI VERIFICATION ===');

  const thresholdsPath = path.resolve(process.cwd(), 'docs', 'animation_thresholds.json');
  if (!fs.existsSync(thresholdsPath)) {
    throw new Error(`Thresholds file not found: ${thresholdsPath}`);
  }

  const { thresholds } = JSON.parse(fs.readFileSync(thresholdsPath, 'utf-8'));

  console.log('[CI Test] Recording After Trace (15s at 60 Hz)...');
  const after = recordAfterTrace(15.0, 60);

  console.log('[CI Test] Recording Baseline Trace for Jerk Reduction Comparison...');
  const before = recordBaselineTrace(15.0, 60);

  const jerkReductionPct = ((before.smoothness.jerkRMS.root - after.smoothness.jerkRMS.root) / before.smoothness.jerkRMS.root) * 100;

  console.log('\n--- MEASURED RESULTS VS ACCEPTANCE CRITERIA ---');
  console.log(`1. Root Jerk RMS: ${after.smoothness.jerkRMS.root.toFixed(2)} m/s³ (Limit: < ${thresholds.rootJerkRMSMax})`);
  console.log(`2. Jerk Reduction: ${jerkReductionPct.toFixed(2)}% (Required: >= ${thresholds.jerkReductionMinimumPercent}%)`);
  console.log(`3. Mean Foot Slip: ${after.smoothness.footSlip.meanPercentOfLegLength.toFixed(3)}% (Limit: < ${thresholds.footSlipMeanPercentMax}%)`);
  console.log(`4. Max Foot Slip: ${after.smoothness.footSlip.maxPercentOfLegLength.toFixed(3)}% (Limit: < ${thresholds.footSlipMaxPercentMax}%)`);
  console.log(`5. Camera Relative Jitter: ${after.smoothness.cameraRelativeJitter.toFixed(3)} px (Limit: < ${thresholds.cameraRelativeJitterMax} px)`);
  console.log(`6. Judder Index: ${after.pacing.judderIndex.toFixed(4)} (Limit: < ${thresholds.judderIndexMax})`);

  let passed = true;

  if (after.smoothness.jerkRMS.root > thresholds.rootJerkRMSMax) {
    console.error(`[FAIL] Root Jerk RMS ${after.smoothness.jerkRMS.root} exceeds threshold ${thresholds.rootJerkRMSMax}`);
    passed = false;
  }
  if (jerkReductionPct < thresholds.jerkReductionMinimumPercent) {
    console.error(`[FAIL] Jerk Reduction ${jerkReductionPct}% is below required ${thresholds.jerkReductionMinimumPercent}%`);
    passed = false;
  }
  if (after.smoothness.footSlip.meanPercentOfLegLength > thresholds.footSlipMeanPercentMax) {
    console.error(`[FAIL] Mean Foot Slip ${after.smoothness.footSlip.meanPercentOfLegLength}% exceeds threshold ${thresholds.footSlipMeanPercentMax}%`);
    passed = false;
  }
  if (after.smoothness.footSlip.maxPercentOfLegLength > thresholds.footSlipMaxPercentMax) {
    console.error(`[FAIL] Max Foot Slip ${after.smoothness.footSlip.maxPercentOfLegLength}% exceeds threshold ${thresholds.footSlipMaxPercentMax}%`);
    passed = false;
  }
  if (after.smoothness.cameraRelativeJitter > thresholds.cameraRelativeJitterMax) {
    console.error(`[FAIL] Camera Relative Jitter ${after.smoothness.cameraRelativeJitter} exceeds threshold ${thresholds.cameraRelativeJitterMax}`);
    passed = false;
  }
  if (after.pacing.judderIndex > thresholds.judderIndexMax) {
    console.error(`[FAIL] Judder Index ${after.pacing.judderIndex} exceeds threshold ${thresholds.judderIndexMax}`);
    passed = false;
  }

  if (passed) {
    console.log('\n[PASS] ALL FLUID ANIMATION SMOOTHNESS & PACING GATES MET.');
  } else {
    console.error('\n[FAIL] SOME FLUID ANIMATION GATES FAILED.');
  }

  return passed;
}

if (require.main === module || !module.parent) {
  const ok = runGaitTraceTest();
  process.exit(ok ? 0 : 1);
}
