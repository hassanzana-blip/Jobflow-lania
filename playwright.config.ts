import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // The workspace flow walks a full save/dismiss/undo/prepare/review journey
  // through animated sheets; 30s is not enough for it on a shared runner.
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    // CI images often ship one Chromium build that does not match the revision
    // this Playwright version downloads. Point at the installed binary instead
    // of re-downloading one; unset, Playwright resolves its own.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // A production build, not `next dev`: it is what Netlify serves, and
        // the dev server's HMR socket is unreachable in sandboxed CI, which
        // leaves the page server-rendered but never hydrated — every
        // interaction then silently does nothing.
        command: "npm run build && npm run start -- --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          // Placeholders, never real credentials: they only make the auth
          // forms render so their error handling can be exercised. Every
          // request to this host fails, which is the case under test.
          APP_BASE_URL: "http://127.0.0.1:3100",
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "e2e-placeholder-anon-key",
        },
      },
});
