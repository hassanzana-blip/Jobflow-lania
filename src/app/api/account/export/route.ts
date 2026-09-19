import { database } from "@/server/db";
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
    const { user } = await requireUser();
    const data: Record<string, unknown> = {
      identity: { id: user.id, email: user.email },
    };
    const sql = database();
    await sql.begin("isolation level repeatable read read only", async tx => {
      for (const table of tables) {
        const rows = await tx`select * from ${tx(`jobbflow.${table}`)} where user_id=${user.id} limit 100001`;
        if (rows.length > 100000) throw new Error("EXPORT_REQUIRES_BACKGROUND_JOB");
        data[table] = rows;
      }
    });
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
