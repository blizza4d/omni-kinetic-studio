---
name: build-stamp
description: Operational procedure for baking the canonical BuildStamp (git SHA, branch, iteration tag, build type, GPU renderer, model IDs) into logs, status, reports, and UI screenshots.
---

# Build Stamp Operational Procedure

## Purpose
Embeds the immutable `BuildStamp` across all client and server artifacts to eliminate ambiguity about which code and model versions produced a given run or render.

## Integration Points
- **UI Header / Footer**: Displayed in small cream-dim text at the bottom edge.
- **Log Banner**: Formatted via `formatBuildStamp(stamp)` replacing hardcoded milestone strings.
- **System Status**: Exposed via `GET /status`.
- **Render Screenshots**: Stamped with watermark footer.
