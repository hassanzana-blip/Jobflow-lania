import "server-only";
import Stripe from "stripe";
import { database } from "./db";
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("BILLING_NOT_CONFIGURED");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 10000,
    maxNetworkRetries: 1,
  });
}
export function priceMap() {
  return new Map(
    [
      [process.env.STRIPE_PLUS_PRICE_ID, "plus"],
      [process.env.STRIPE_PRO_PRICE_ID, "pro"],
      [process.env.STRIPE_AGENT_PRICE_ID, "agent"],
    ].filter(([p]) => Boolean(p)) as [string, string][],
  );
}
export async function reconcileSubscription(event: Stripe.Event) {
  const sql = database();
  const object = event.data.object as unknown as {
    customer?: string | { id: string } | null;
  };
  const customer =
    typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customer) return;
  await sql.begin(async (tx) => {
    await tx`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict(id) do nothing`;
    const [record] =
      await tx`select state from stripe_events where id=${event.id} for update`;
    if (record?.state === "processed") return;
    const [account] =
      await tx`select user_id from subscriptions where stripe_customer_id=${customer} for update`;
    if (!account) {
      await tx`update stripe_events set state='unmapped',error_code='CUSTOMER_NOT_MAPPED' where id=${event.id}`;
      return;
    }
    // Fetch within the account lock. Old webhook delivery cannot overwrite a newer
    // snapshot with stale event-body state.
    const current = await stripe().subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (current.has_more)
      throw new Error("SUBSCRIPTION_RECONCILIATION_REQUIRES_PAGINATION");
    const recognized = current.data.filter((s) =>
      s.items.data.some((i) => priceMap().has(i.price.id)),
    );
    const active = recognized.filter((s) => s.status === "active");
    if (active.length > 1) throw new Error("MULTIPLE_ACTIVE_SUBSCRIPTIONS");
    const sub =
      active[0] ?? recognized.sort((a, b) => b.created - a.created)[0];
    const item = sub?.items.data.find((i) => priceMap().has(i.price.id));
    const plan =
      sub?.status === "active" && item
        ? priceMap().get(item.price.id)!
        : "free";
    await tx`update subscriptions set plan=${plan},stripe_subscription_id=${sub?.id ?? null},status=${sub?.status ?? "free"},period_start=${item ? new Date(item.current_period_start * 1000) : null},period_end=${item ? new Date(item.current_period_end * 1000) : null},cancel_at_period_end=${sub?.cancel_at_period_end ?? false},updated_at=now() where user_id=${account.user_id}`;
    await tx`update stripe_events set state='processed',processed_at=now(),error_code=null where id=${event.id}`;
  });
}
