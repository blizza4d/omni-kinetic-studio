# Release Process & Freeze Rules

- **Semantic Tags:** Release candidate progression follows `rc1` (stable base) $\rightarrow$ `rc2` (+cloud) $\rightarrow$ `rc3` (+teleop) $\rightarrow$ `rc4` (+learning) $\rightarrow$ `rc-final`.
- **Absolute Code Freeze:** Once `rc-final` is cut, no new features, refactors, or unverified changes are permitted. Only test-backed bugfixes addressing critical issues with prior sign-off may merge.
- **Fresh-Clone Test:** A clean `git clone` on an isolated environment must build and run Demo Local in under 10 minutes strictly following `README.md`.
