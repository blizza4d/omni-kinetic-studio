# BUILD IDENTITY & BUNDLE VERIFICATION RULES
**Contract:** `BuildStamp v2` (`/contracts/build_stamp.ts`)

1. **Dynamic Git & Tree State:**
   - Every build must bake git SHA (`git rev-parse --short HEAD`), full commit hash, branch name, and UTC build timestamp.
   - The working tree must be inspected: `dirty: boolean` set to `true` if uncommitted changes exist, along with `dirtyFiles: string[]`.
   - Never hardcode SHA constants like `'21842619'` in production code.

2. **Bundle Hashing & Cache Invalidation:**
   - Prebuild hook computes the SHA-256 hash of compiled assets.
   - HTML documents served by Next.js must include `Cache-Control: no-cache, no-store, must-revalidate`.
   - The `/api/stamp` route returns live build identity.

3. **Visible Viewport Stamp:**
   - A subtle cream-dim watermark is rendered in the bottom-left corner of the canvas overlay, ensuring every user and QA screenshot unambiguously identifies the build.
