# Backend & Agentic Pipeline Rules

1. **Authentication & Credentials:**
   - Never expose `NEBIUS_API_KEY` or any cloud credentials to client code or client bundles.
   - All external calls to `https://api.tokenfactory.nebius.com/v1` must originate from server-side Next.js route handlers or background jobs.

2. **Dynamic Model Resolution:**
   - Query `GET /models` at startup to verify available Nemotron reasoning and fast tiers.
   - Never hardcode decommissioned model strings without automated fallback cascades.

3. **AST Safety Gate:**
   - Every generated Python script (`reward.py`, `datagen.py`) MUST pass through `/lib/safety/ast_gate.ts` before execution or job packaging.
   - Permitted module imports: `math`, `numpy`, `torch`, `scipy`, `gymnasium`, `bullet`, `mujoco`.
   - Explicitly banned: `os`, `sys`, `subprocess`, `socket`, `eval`, `exec`, `open`, `__import__`, and any network or file access primitives.

4. **Streaming Protocol:**
   - Use Server-Sent Events (SSE) with `text/event-stream` and `Cache-Control: no-cache`.
   - Batch telemetry frames (20–60 frames per SSE event) to prevent event loop saturation.
