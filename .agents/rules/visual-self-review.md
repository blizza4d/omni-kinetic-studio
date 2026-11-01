# Visual Self-Review Protocol

Mandatory protocol for all visual or motion fixes:
1. Capture six golden views on five golden seeds (`42, 101, 777, 2024, 9999`):
   - **V1:** Default Chase at $t=0\text{ s}$
   - **V2:** Default Chase at $t=12.5\text{ s}$
   - **V3:** Top view (hotkey `2`)
   - **V4:** Low-angle toward horizon
   - **V5:** Side view (hotkey `3`)
   - **V6:** Close-up of robot ($1.5\text{ m}$)
2. Production build, 1920×1080, dpr 1, with canonical Build Stamp baked in.
3. Review the 18-item checklist in writing with measured numbers:
   1. Is the horizon level (within 1°)?
   2. Does the robot body point along direction of travel (slip < 5°)?
   3. Does overall terrain look level with no global tilt?
   4. Are all 4 feet visible and touching ground with contact shadows?
   5. Are rocks distinguishable from ground and not pure black?
   6. Do rocks and robot cast attached shadows without ghost casters?
   7. Is any object floating or buried > 40%?
   8. Is there any red on rim when robot > 3m from edge?
   9. Are there any jagged/thick white polylines on terrain?
   10. Are there horizontal stripes or bands near horizon?
   11. Do any flat-shaded facets show on terrain?
   12. Is goal marker subtle, grounded, and fading with distance?
   13. Does any HUD chip overlap, truncate meaninglessly, or clip?
   14. Does every number and unit make sense (m/s², g, m, deg, s)?
   15. Do rocks show repetition reading as copy-paste?
   16. Does robot look like a plausible machine (sensors, actuators, panels)?
   17. Is anything crushed to pure black or blown to pure white?
   18. Does radar match viewport (positions, obstacles, path, goal)?
4. Any "No" blocks the fix.
