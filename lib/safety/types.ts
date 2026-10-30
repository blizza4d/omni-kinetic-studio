export interface SafetyCheckRow {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

export interface SafetyGateResult {
  passed: boolean;
  violations: string[];
  allowedImportsFound: string[];
  suspiciousCalls: string[];
  report: string;
  checks: SafetyCheckRow[];
}
