---
name: deploy-nebius-job
description: Standard operational procedure for packaging simulation code, uploading specs to S3 Object Storage, and submitting containerized Serverless AI jobs to Nebius.
---

# Deploy Nebius Job Skill

This skill documents how to deploy headless robotics simulation jobs to Nebius Serverless AI Jobs.

## Prerequisites
- Valid `NEBIUS_API_KEY` set in server environment.
- S3-compatible Object Storage credentials configured.
- Container image tagged and available on registry (e.g. `cr.nebius.ai/omni-kinetic/sim-worker:latest`).

## Step-by-Step Procedure
1. **Validate Artifacts:**
   Run the generated `EnvironmentSpec`, `reward.py`, and `datagen.py` through the AST safety gate (`/lib/safety/ast_gate.ts`).
2. **Bundle & Upload Payload:**
   Serialize job manifest to JSON and push artifacts to S3 bucket:
   ```bash
   s3://omni-kinetic-jobs/{jobId}/spec.json
   s3://omni-kinetic-jobs/{jobId}/reward.py
   s3://omni-kinetic-jobs/{jobId}/datagen.py
   ```
3. **Dispatch Serverless Job:**
   Invoke the Nebius CLI or REST API:
   ```bash
   nebius ai job create \
     --name "omni-run-${JOB_ID}" \
     --image cr.nebius.ai/omni-kinetic/sim-worker:latest \
     --platform gpu-l40s-a \
     --preset 1gpu-8vcpu-32gb \
     --container-command python \
     --args "-m worker.main --job-id ${JOB_ID} --bucket omni-kinetic-jobs" \
     --timeout 15m
   ```
4. **Relay Telemetry:**
   Worker streams chunked frames to `s3://omni-kinetic-jobs/{jobId}/telemetry_*.jsonl`. The Next.js `/app/api/jobs/stream/route.ts` monitors and relays chunks via SSE.
