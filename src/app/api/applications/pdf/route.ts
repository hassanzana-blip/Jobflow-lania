import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { requireUser } from "@/server/supabase";
import { database } from "@/server/db";
import { errorResponse } from "@/server/request";
import { applicationPdf } from "@/core/pdf";
export async function GET(req: Request) {
  try {
    const { user } = await requireUser();
    const id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
    const sql = database();
    const [row] =
      await sql`select v.content,p.display_name,j.title from jobbflow.application_documents d join jobbflow.cv_versions v on v.id=d.cv_version_id and v.user_id=d.user_id join jobbflow.applications a on a.id=d.application_id and a.user_id=d.user_id join jobbflow.jobs j on j.id=a.job_id join jobbflow.profiles p on p.user_id=d.user_id where d.application_id=${id} and d.user_id=${user.id} and d.kind='tailored_cv' and v.reviewed_at is not null`;
    if (!row) throw new Error("NOT_FOUND");
    const bytes = await applicationPdf({
      name: row.display_name ?? "",
      title: row.title,
      text: row.content.text,
      font: await readFile(
        join(process.cwd(), "public/fonts/Inter-Regular.ttf"),
      ),
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="JobbFlow-CV.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
