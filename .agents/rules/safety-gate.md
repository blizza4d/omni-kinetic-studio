# Safety Gate v2 Rules & Static AST Checks

## 1. STATIC AST SECURITY CHECKS
All generated Python code must pass 6 static AST checks before deployment:
1. **Import Allowlist**: Permitted: `numpy`, `math`, `typing`. Forbidden: `os`, `sys`, `subprocess`, `socket`, `urllib`, `requests`.
2. **Forbidden Primitives**: Zero calls to `eval()`, `exec()`, `open()`, `compile()`, `getattr()`, `__import__`.
3. **Loop Bounds**: Infinite loops (`while True`) without static `break` or iteration counters are blocked.
4. **File Size Cap**: Maximum script size is $64\text{ KiB}$.
5. **Entrypoint Signature**: Must define `compute_step_reward(state, action, prev_state) -> tuple[float, dict]`.
6. **No File/Network I/O**: Zero file writing or network socket initialization.

## 2. MALICIOUS FIXTURE SUITE
The test harness runs 5 standard malicious attack fixtures (`os_import`, `eval_call`, `infinite_while`, `file_escape`, `obfuscated_dunder`). All 5 must be blocked with explicit error reasons.
