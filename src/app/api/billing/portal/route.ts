import { stripe } from "@/server/billing";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const { client, user } = await requireUser();
    const { data, error } = await client
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();
    if (error || !data?.stripe_customer_id) throw new Error("NO_SUBSCRIPTION");
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
