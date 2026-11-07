# EPISODES & CONSOLE LOGGING RULES
**Contract:** `EpisodeEvent v1` (`/contracts`)

1. **Episode Lifecycle Events:**
   - At every episode reset, emit a typed `EpisodeEvent`:
     ```typescript
     export interface EpisodeEvent {
       episode: number;
       reason: 'goal_reached' | 'out_of_bounds' | 'fell_through_world' | 'stalled' | 'timeout';
       duration: number;
       distance: number;
       netProgress: number;
       reward: number;
       collisions: number;
       slipP95: number;
       seed: number;
       t: number;
     }
     ```

2. **Truthful Console Output:**
   - Every episode reset must print an explicit line in the Console, e.g.:
     `"Episode 1 ended: goal reached in 15.2 s, 17.2 m, reward: 28.4"`
   - Never allow an episode to reset silently without a logged reason.
   - Display a compact Run Summary card at episode end.

3. **Playback Scrubber:**
   - Episode boundary marks must be rendered as visible vertical ticks across the 60-second scrubber timeline.
