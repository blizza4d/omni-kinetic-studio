---
name: add-telemetry-field
description: Standard operational procedure for safely adding or extending fields in the shared TelemetryFrame contract across workers, adapters, API routes, and the 3D viewer.
---

# Add Telemetry Field Skill

This skill documents how to safely extend `TelemetryFrame` without breaking contract validation or degrading streaming throughput.

## Step-by-Step Procedure
1. **Announce Contract Update:**
   Post an entry in the Task List indicating the schema extension.
2. **Update Zod Schema (`/contracts/index.ts`):**
   Add the field with strict Zod validation (prefer optional `.optional()` initially to maintain backwards compatibility with existing cached logs/fixtures).
   ```typescript
   export const TelemetryFrameSchema = z.object({
     // ... existing fields
     footContacts: z.array(z.boolean()).optional(),
   });
   ```
3. **Update Simulator Emitter (`/sim/adapters/base.py` & `/sim/local_runner/runner.py`):**
   Ensure physics simulation steps populate the new field in serialized JSONL chunks.
4. **Update Viewer Ingestion (`/components/viewer/ThreeViewer.tsx`):**
   Add corresponding graphics or HUD hooks (e.g. contact circle indicators under feet).
5. **Update Test Fixtures (`/sim/fixtures/low_gravity_quadruped.jsonl`):**
   Re-validate test fixtures against the updated schema using the unit test suite.
