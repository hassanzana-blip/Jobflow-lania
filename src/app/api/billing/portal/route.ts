import { database } from "@/server/db";
import { stripe } from "@/server/billing";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { user } = await requireUser();
    const sql = database();
    const [data] = await sql`select stripe_customer_id from jobbflow.subscriptions where user_id=${user.id}`;
    if (!data?.stripe_customer_id) throw new Error("NO_SUBSCRIPTION");
    const session = await stripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: new URL(
        "/app/installningar",
        process.env.APP_BASE_URL,
      ).toString(),
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return errorResponse(e);
  }
}
