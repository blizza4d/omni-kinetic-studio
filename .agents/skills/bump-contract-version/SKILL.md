---
name: bump-contract-version
description: Standard operational procedure for bumping versioned Zod schemas and TypeScript contracts in /contracts with cross-agent coordination.
---

# Bump Contract Version Skill

This skill documents how to safely bump contract versions (e.g. `EnvironmentSpec v2`, `TelemetryFrame v2`) without breaking downstream consumers.

## Step-by-Step Procedure
1. **Announce Contract Change:**
   Post an entry in the Task List and notify dependent agents (Agents A, B, C, D).
2. **Author Versioned Schema (`/contracts/index.ts`):**
   - Add `schemaVersion: z.string().default('2.0')`.
   - Maintain backward compatibility where possible by keeping newly introduced fields optional or defaulted.
3. **Update Golden Fixtures:**
   - Update `sim/fixtures/low_gravity_quadruped.jsonl` to conform to the updated schema version.
4. **Run Contract Tests:**
   Execute `npx tsx --test test/*.test.ts` to verify that all consumers parse the golden fixtures with 0 schema errors.
