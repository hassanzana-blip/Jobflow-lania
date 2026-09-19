# Design QA — JobbFlow mobile app

Result: implementation builds; automated browser checks pass; visual parity QA still outstanding.

The public landing retains the approved lime/black editorial direction. The mobile product now follows the latest supplied references: cream and sage surfaces, forest navigation and lime actions. No travel photos, invented company logos, testimonials or fake live counts are used.

Editable Figma page `30:2` contains mobile home `30:11`, job detail `30:12`, tracker `30:13`, profile `30:14`, reusable job card `31:2`, navigation `32:2`, app icon `41:20` and seven mobile color variables. The home frame was rendered and inspected: legible hierarchy, no clipped text, Inter font verified. Figma is still a partial design system, not a complete specification of all states. The original component inventory remains outstanding.

Implementation: mobile-first four-destination navigation, safe-area padding, minimum 44–48px controls, 16px form inputs, drawers with Radix focus trap/Escape and explicit focus restoration, reduced motion, desktop sidebar/grid, no client rendering of untrusted job HTML, source/excerpt labels, honest empty/error/unavailable states. Home-screen manifest and a Figma-authored monogram icon are included.

Verified: native build, static export, TypeScript, 36 core/contract/database/PDF/auth tests. Live source adapters return actual records.

The browser checks have now run. `npm run test:e2e` passes 13 of 13 in Chromium: 320/360/375/390/393/430/1440px with no horizontal overflow, the three-step profile, save/dismiss/undo, application review and status editing, keyboard dismissal of the sheet, and axe WCAG 2.2 AA on `/`, `/produktvisning`, `/kom-igang` and `/lankfel`. Run them against a production server — `next dev` does not hydrate in a sandboxed runner, so every interaction appears to do nothing; the Playwright config builds and starts one for this reason.

The run found what axe did not: help text inside a wrapping `<label>` was part of the control's accessible name. Fixed with `aria-describedby` for the tracker status, CV facts and roles fields.

Still not claimed: visual parity with Figma, a Lighthouse score, a physical phone pass, or a screen-reader review. These are release gates, not assumed successes. Authenticated service flows need additional tests against real configured test services.
