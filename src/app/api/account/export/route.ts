import { requireUser } from "@/server/supabase";
import { errorResponse } from "@/server/request";
const tables = [
  "profiles",
  "candidate_preferences",
  "work_experience",
  "education",
  "skills",
  "languages",
  "candidate_facts",
  "documents",
  "cv_versions",
  "job_matches",
  "match_factors",
  "saved_jobs",
  "dismissed_jobs",
  "applications",
  "application_answers",
  "application_documents",
  "application_events",
  "agent_runs",
  "agent_steps",
  "approval_requests",
  "subscriptions",
  "usage_events",
  "notification_settings",
  "notifications",
  "search_runs",
];
export async function GET() {
  try {
    const { client, user } = await requireUser();
    const data: Record<string, unknown> = {
      identity: { id: user.id, email: user.email },
    };
    for (const table of tables) {
      const rows: unknown[] = [];
      let offset = 0;
      while (true) {
        const result = await client
          .from(table)
          .select("*")
          .eq("user_id", user.id)
          .order(
            table === "saved_jobs" || table === "dismissed_jobs"
              ? "job_id"
              : [
                    "profiles",
                    "candidate_preferences",
                    "subscriptions",
                    "notification_settings",
                  ].includes(table)
                ? "user_id"
                : "id",
          )
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 500) break;
        offset += 500;
        if (offset > 100000) throw new Error("EXPORT_REQUIRES_BACKGROUND_JOB");
      }
      data[table] = rows;
    }
    return new Response(
      JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2),
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="jobbflow-data.json"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
