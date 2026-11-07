# EVIDENCE PACK RULES & PROOF GATES
**Contract:** `EvidencePack v1` (`/contracts`)

1. **Mandatory Artifact Requirements for Every Package:**
   Every package (P0 through P5) must deliver an Evidence Pack before advancing:
   - **Defect Cards:** Numbered defect cards with root cause, failing baseline test, passing fix test, and numerical metrics.
   - **Before & After Viewport Crops:** Crops at identical view, preset, seed, camera, and timestamp at **1917×881** and **1920×1080** with build stamp clearly visible.
   - **Numeric Metrics:** Side-by-side metric table showing baseline vs post-fix values.
   - **Section 5 Visual Self-Review Checklist:** All 18 questions answered with Yes/No and exact measured values.
   - **Production Recording:** 15-second recording for motion/lighting changes (60s for P4, 3-minute for P5).
   - **User-Facing Plain English Sentence:** Exactly one clear sentence per defect describing "what you will now see."

2. **Stop-The-Line Enforcement:**
   - No later package may begin implementation until the earlier package's review gate is formally approved.
