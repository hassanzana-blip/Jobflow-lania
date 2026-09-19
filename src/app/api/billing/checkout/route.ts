import { database } from "@/server/db";
import { z } from "zod";
import { stripe } from "@/server/billing";
import { requireUser } from "@/server/supabase";
import { mutationGuard, errorResponse } from "@/server/request";
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    if (process.env.ENABLE_BILLING !== "true")
      throw new Error("BILLING_NOT_CONFIGURED");
    const { user } = await requireUser();
    const { plan } = z
      .object({ plan: z.enum(["plus", "pro", "agent"]) })
      .strict()
      .parse(await req.json());
    const price = {
      plus: process.env.STRIPE_PLUS_PRICE_ID,
      pro: process.env.STRIPE_PRO_PRICE_ID,
      agent: process.env.STRIPE_AGENT_PRICE_ID,
    }[plan];
    if (!price) throw new Error("BILLING_NOT_CONFIGURED");
    const db = database();
    const [sub] = await db`select stripe_customer_id,status from jobbflow.subscriptions where user_id=${user.id}`;
    if (!sub) throw new Error("NO_SUBSCRIPTION");
    if (sub.status === "active") throw new Error("USE_BILLING_PORTAL");
    let customer = sub.stripe_customer_id;
    const api = stripe();
    if (!customer) {
      customer = (
        await api.customers.create(
          { email: user.email, metadata: { user_id: user.id } },
          { idempotencyKey: `customer-${user.id}` },
        )
      ).id;
      await db`update jobbflow.subscriptions set stripe_customer_id=${customer} where user_id=${user.id}`;
    }
    const base = process.env.APP_BASE_URL!;
    const session = await api.checkout.sessions.create({
      customer,
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: new URL("/app/installningar", base).toString(),
      cancel_url: new URL("/#priser", base).toString(),
      client_reference_id: user.id,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return errorResponse(e);
  }
}
