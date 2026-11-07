# BUILD IDENTITY REPORT — FIX PASS 3: "RECONCILE, PROVE, THEN FIX"
**Project:** Omni-Kinetic Browser-Native Sim-to-Real Embodied AI Studio  
**Gate:** Gate 1 (Planning Gate / Baseline Reconciliation)  
**Date:** 2026-11-02  
**Baseline Git Tag:** `fix3-baseline` (`aa9ea1d`)  

---

## 1. Executive Summary & Core Diagnosis
The user correctly observed that despite functional updates in the application (such as the gravity readout changing to `"1.62 m/s² (0.165 g, Moon)"`), the log banner persistently displayed:
```text
iteration-5-dev (baseline: iteration-4-baseline) • sha:21842619 (main) • production
```

### Direct Root Cause
Inspection of [`lib/build_stamp.ts`](file:///d:/project%20all/nvidia/lib/build_stamp.ts#L22-L26) and [`contracts/build_stamp.ts`](file:///d:/project%20all/nvidia/contracts/build_stamp.ts#L8) revealed that the build stamp was **statically hardcoded**:
```typescript
// lib/build_stamp.ts:20-26
export function getBuildStamp(): BuildStamp {
  const isProd = process.env.NODE_ENV === 'production';
  return BuildStampSchema.parse({
    sha: '21842619', // <-- HARDCODED STRING from Iteration 5
    branch: 'main',
    iterationTag: 'iteration-5-dev (baseline: iteration-4-baseline)', // <-- HARDCODED STRING
    buildType: isProd ? 'production' : 'development',
...
```
Furthermore, the test and verification scripts (`scripts/capture_bugfix_baseline.ts`, `scripts/verify_iteration5_postfix.ts`) also contained hardcoded watermark string constants matching `'21842619'`. As a result:
1. When new commits were made (e.g. `6e8727a`, `aa9ea1d`), the running binary continued to report the hardcoded SHA `'21842619'`.
2. There was zero dynamic reflection of `git rev-parse HEAD`, zero `dirty` tree detection, zero build timestamp, and zero bundle content hash.

---

## 2. What Code is the User Actually Running?
- **Actual Git Commit on Server:** `aa9ea1d` (tagged `fix3-baseline`), which sits directly on top of `6e8727a` (`feat(iter6): implement Part I close-out and Part II cloud & relay architecture`).
- **Working Tree State:** Clean (`nothing to commit, working tree clean`).
- **Actual Binary:** Next.js optimized production build generated via `next build` on Node.js v22.18.0.
- **Hardware Acceleration:** Hardware GPU verified via `WEBGL_debug_renderer_info`: `NVIDIA GeForce RTX 3050 Laptop GPU (Direct3D11 / ANGLE)`.

---

## 3. Cache & Bundle Safety Audit
We audited Next.js asset delivery and client-side caching:
1. **Asset Hashing:** Next.js emits chunked assets with content hashes (e.g., `117-37743225d74b84a7.js`, `fd9d1056-f564a2ec58e58506.js`). When `next build` runs, updated client code receives fresh content hashes.
2. **HTML Caching:** In `next start`, the root HTML route `/` is served dynamically or statically revalidated. However, without explicit `Cache-Control: no-cache, no-store, must-revalidate` headers on the HTML payload, aggressive browser caches (or Chrome DevTools cache) can serve stale HTML referencing old JS chunk hashes.
3. **Service Workers:** No active service worker was found registered in `public/`.
4. **Remediation for Pass 3:**
   - Add explicit `Cache-Control: no-cache, no-store, must-revalidate` to `next.config.mjs` for all HTML documents.
   - Implement an automated `/api/stamp` endpoint returning live build stamp metadata.
   - Inject a client-side polling or SSE check in `ThreeViewer` that detects build mismatches and presents a subtle "New Build Available — Refresh" badge.

---

## 4. BuildStamp v2 Architecture Specification

To prevent any future desynchronization between user screenshots and running code, we specify **BuildStamp v2**:

### Data Contract (`contracts/build_stamp.ts`)
```typescript
export interface BuildStampV2 {
  sha: string;               // Exact 7-12 character git short SHA from git rev-parse --short HEAD
  fullSha: string;           // 40-character full git commit SHA
  branch: string;            // Active git branch (e.g. 'main')
  dirty: boolean;            // Boolean: true if working tree has unstaged or uncommitted changes
  dirtyFiles: string[];      // Array of filenames modified in working tree (empty if clean)
  builtAt: string;           // ISO 8601 UTC timestamp of the build (e.g. '2026-11-02T16:00:00Z')
  bundleHash: string;        // SHA-256 content hash of the compiled production client bundle
  iterationTag: string;      // From RELEASE_TAG env var, defaults to 'fix3-baseline'
  buildType: 'production' | 'development';
  gpuRenderer: string;       // Real unmasked WebGL GPU string
  modelIds: {
    ultra: string;
    super: string;
    nano: string;
  };
}
```

### Build-Time Baking Mechanism
- Create `scripts/generate_build_stamp.ts` executed as a `prebuild` npm hook before `next build`.
- It executes `git rev-parse HEAD`, `git status --porcelain`, and computes the bundle content hash, writing a static JSON manifest to `lib/build_stamp_generated.json`.
- `lib/build_stamp.ts` imports this manifest at runtime, ensuring the running build always truthfully identifies itself.
- A permanent, subtle footer watermark is injected in the lower viewport corner displaying:
  ```text
  OMNI-KINETIC • [RELEASE_TAG] • sha:[SHA] [dirty?] • [builtAt] • [GPU]
  ```
