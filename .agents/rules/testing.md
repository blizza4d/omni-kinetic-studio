# Testing Rules (Agent F & All Agents)

1. **Regression Guard:**
   - Record baseline status (screenshots, FPS, console errors, test results) before touching code.
   - Run the complete test suite (`npx tsx --test test/*.test.ts`) before and after every phase.
   - If any previously working feature breaks (hotkeys, log streaming, token meter, FPS counter), fix it immediately before starting new work.

2. **Contract Testing:**
   - Replay golden test fixtures through every consumer (viewer, radar, metrics, dataset parser) without schema validation errors.
   - Backward-compatible contract changes must bump minor versions; breaking changes require announcement and migration tests.

3. **E2E & Browser Automation:**
   - Use headless Chromium with `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` so camera teleop tests run reliably without physical hardware.
   - Zero console errors (`console.error`) and zero unhandled rejections allowed during user flows.

4. **Honesty Verification:**
   - Automated tests must verify that simulated improvements are explicitly badged in the UI (`[SIMULATED IMPROVEMENT (DEMO)]`).
