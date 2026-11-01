# Header & UI Layout Rules

1. **Zero Overlaps Invariant:**
   - Single flex row with `gap` of at least $6\text{ px}$, `min-width: 0`, and no negative margins.
   - Layout test asserts no two chip bounding boxes intersect and horizontal separation is $\ge 4\text{ px}$ at $1280\text{ px}$, $1440\text{ px}$, and $1920\text{ px}$ widths.

2. **Responsive Collapse Order:**
   - When viewport is narrow:
     1. Task title truncates with full text displayed on tooltip (`title="..."`).
     2. Button labels collapse to icons with tooltips.
     3. Mode switcher collapses to acronym (`[DEMO]`).

3. **Steady-State Long Tasks Badge:**
   - `FpsBadge` counts only steady-state long tasks ($> 50\text{ ms}$) within a 60-second rolling window after the first $5\text{ s}$ of interactive load.
   - Startup hydration/terrain generation tasks are tagged as `"startup"` in the Perf panel (`P`).
   - Brick red color appears ONLY when steady-state long tasks exceed the budget (zero).

4. **Tab Empty States:**
   - Every idle tab (Spec, Reward, Datagen, Critique) MUST display an icon, a descriptive single sentence, and an action button (e.g. "Run Task Prompt").
