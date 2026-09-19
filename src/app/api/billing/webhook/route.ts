import { stripe, reconcileSubscription } from "@/server/billing";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    return Response.json({ error: "BILLING_NOT_CONFIGURED" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(
      raw,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
        "checkout.session.completed",
      ].includes(event.type)
    )
      await reconcileSubscription(event);
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: "RETRY_REQUIRED" }, { status: 500 });
  }
}
