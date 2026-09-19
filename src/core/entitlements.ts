export const PLANS = {
  free: {
    priceSek: 0,
    deepMatches: 25,
    tailoredApplications: 2,
    browserApplications: 0,
  },
  plus: {
    priceSek: 149,
    deepMatches: 250,
    tailoredApplications: 20,
    browserApplications: 0,
  },
  pro: {
    priceSek: 299,
    deepMatches: 1000,
    tailoredApplications: 60,
    browserApplications: 30,
  },
  agent: {
    priceSek: 499,
    deepMatches: 2500,
    tailoredApplications: 150,
    browserApplications: 100,
  },
} as const;
export type Plan = keyof typeof PLANS;
export type UsageKind =
  "deep_match" | "tailored_application" | "browser_application";
// Display values only. Actual authorization uses the database entitlements rows
// inside an atomic reserve_usage transaction; never use browser plan claims.
export function displayLimit(plan: Plan, kind: UsageKind) {
  const key = {
    deep_match: "deepMatches",
    tailored_application: "tailoredApplications",
    browser_application: "browserApplications",
  } as const;
  return PLANS[plan][key[kind]];
}
