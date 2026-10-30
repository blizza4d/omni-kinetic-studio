# Spec Compiler: "LLM Proposes, Compiler Disposes"

## 1. CORE MANDATE
The LLM's raw output NEVER reaches the simulation runner directly. Every proposed parameter is validated and clamped by the deterministic `SpecCompiler` into a `CompiledSpec`.

## 2. CLAMP TABLE LIMITS
- **Gravity**: $[0.10, 9.81]\text{ m/s}^2$.
- **Arena Half-Extent**: $[12.0, 24.0]\text{m}$ (default $18.0\text{m}$).
- **Terrain Relief**: $[0.50, 2.50]\text{m}$.
- **Crater Count**: $[0, 24]$.
- **P95 Slope Target**: $[8^\circ, 28^\circ]$.
- **Debris Count**: $[100, 1500]$.
- **Rock Size**: $[0.08, 0.80]\text{m}$ (robot-relative).
- **Cruise Speed**: $[0.30, 1.50]\text{ m/s}$.
- **Stride Length**: $[0.15, 0.40]\text{m}$.
- **Duty Factor**: $[0.50, 0.75]$.
- **Episode Length**: $[30, 300]\text{s}$.
- **Goal Distance**: $[8.0, 30.0]\text{m}$.

## 3. COMPILER REPORT & ADJUSTMENT TRANSPARENCY
Every modification triggers an explicit entry in `SpecCompileReport`:
`Compiler adjusted <field> from <orig> to <clamped> (<reason>)`
The user can inspect adjustments in the Compile artifact tab, accept them, edit them, or reject the spec.
