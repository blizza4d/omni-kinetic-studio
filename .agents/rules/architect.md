# Architect Pipeline & Token Factory Rules

## 1. PIPELINE STRUCTURE
The Architect pipeline consists of 11 sequential, Zod-validated stages:
1. `interpret`: Task extraction, gravity regime, terrain and obstacle style.
2. `environment`: Generates EnvironmentSpec v4 JSON (gravity, terrain, debris, robot).
3. `terrain`: Rationale and recipe tuning previewed in the Compile report.
4. `gait`: Locomotion parameters (cruise speed, stride, duty factor).
5. `reward`: `reward.py` script generating named reward components.
6. `datagen`: `datagen.py` synthetic data generation script.
7. `critique`: Physical reasoning audit identifying flaws and severities.
8. `repair`: Correction pass resolving critique findings (up to 2 passes).
9. `compile`: Deterministic SpecCompiler clamping parameters to safe limits.
10. `safety`: Static AST safety gate checks.
11. `deploy`: Hand-off to simulation runner.

## 2. CLIENT & TIER RESOLUTION
- **Endpoint**: OpenAI-compatible `https://api.tokenfactory.nebius.com/v1`.
- **Model Tiers**:
  - Ultra: Deep reasoning (`nvidia/Nemotron-3-Ultra-550b-a55b` or newest available).
  - Super: Mid-tier tuning (`nvidia/nemotron-3-super-120b-a12b`).
  - Nano: Fast utility & summaries (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`).
- **Graceful Fallback**: If Ultra returns 404/deprecation/5xx, automatically cascade Ultra -> Super -> Nano with a plain-English notice.
- **Offline Fixture Mode**: When `NEBIUS_API_KEY` is unconfigured, run deterministic preset fixtures labeled `[RECORDED FIXTURE]`.
