import { mobileSv as t } from "../i18n/mobile-sv.ts";
import {
  emptyPreferences,
  type WorkspaceData,
  type WorkspaceJob,
} from "./workspace.ts";
// Public, explicitly labelled product illustration. Never imported by a live
// user data loader, worker, or job ingestion route. No real employer impersonation.
export function demoWorkspace(): WorkspaceData {
  const jobs: WorkspaceJob[] = t.exampleRoles.map((title, i) => ({
    id: `example-${i}`,
    source: "jobsearch",
    externalId: `example-${i}`,
    canonicalUrl: "https://arbetsformedlingen.se/platsbanken/",
    sourceUrl: "https://arbetsformedlingen.se/platsbanken/",
    title,
    employer: t.exampleCompany,
    location: i === 1 ? t.exampleOtherLocation : "Stockholm",
    municipalityId: null,
    occupationIds: [],
    publishedAt: "2026-09-01T12:00:00.000Z",
    deadline: null,
    removed: false,
    description: t.exampleDescription,
    descriptionCompleteness: "full",
    workStyle: i === 1 ? "remote" : i === 2 ? "onsite" : "hybrid",
    employment: "Heltid",
    salaryMaximumSek: null,
    score: null,
    coverage: 0,
    matchKind: "example",
    reasons: [...t.exampleReasons].slice(0, i === 0 ? 3 : 2),
    gaps: i === 0 ? [t.exampleGap] : [],
  }));
  return {
    profile: {
      displayName: t.exampleName,
      location: "Stockholm",
      version: 1,
      confirmed: true,
      facts: t.exampleFacts.map((text, i) => ({
        id: `example-fact-${i}`,
        kind: i === 2 ? "language" : "experience",
        text,
        sourceQuote: text,
        confirmed: true,
      })),
      preferences: {
        ...emptyPreferences,
        roles: [t.exampleRoles[0]],
        locations: ["Stockholm"],
        languages: ["Svenska", "Engelska"],
      },
    },
    jobs,
    saved: [],
    dismissed: [],
    applications: [],
    sources: [],
    lastSearchAt: null,
    notifications: false,
    capabilities: {
      ai: false,
      cvUpload: false,
      billing: false,
      deletion: false,
    },
  };
}
