# Design QA — JobbFlow mobile app

Result: implementation builds; browser visual QA blocked.

The public landing retains the approved lime/black editorial direction. The mobile product now follows the latest supplied references: cream and sage surfaces, forest navigation and lime actions. No travel photos, invented company logos, testimonials or fake live counts are used.

Editable Figma page `30:2` contains mobile home `30:11`, job detail `30:12`, tracker `30:13`, profile `30:14`, reusable job card `31:2`, navigation `32:2`, app icon `41:20` and seven mobile color variables. The home frame was rendered and inspected: legible hierarchy, no clipped text, Inter font verified. Figma is still a partial design system, not a complete specification of all states. The original component inventory remains outstanding.

Implementation: mobile-first four-destination navigation, safe-area padding, minimum 44–48px controls, 16px form inputs, drawers with Radix focus trap/Escape and explicit focus restoration, reduced motion, desktop sidebar/grid, no client rendering of untrusted job HTML, source/excerpt labels, honest empty/error/unavailable states. Home-screen manifest and a Figma-authored monogram icon are included.

Verified: native build, static export, TypeScript, 28 core/contract/database/PDF tests. Live source adapters return actual records.

The supervised local preview exists at `http://terminal.local:4173/`; browser navigation returned `ERR_BLOCKED_BY_CLIENT`. No code-rendered screenshot was obtained. No rendered overflow, screen-reader, visual parity, axe or Lighthouse pass is claimed. These are release gates, not assumed successes.

Authored browser checks cover 320/360/375/390/393/430/1440px, three-step profile, save/dismiss/undo, application review/status, keyboard dismissal, and automated WCAG AA checks. Run in a browser-capable environment after `npm ci` using `npm run test:e2e`. Authenticated service flows require additional tests with real configured test services.
