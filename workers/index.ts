import { Worker } from "bullmq";
import postgres from "postgres";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { deleteCandidateData } from "../src/core/deletion.ts";
import { sources } from "../src/core/sources.ts";

for (const key of [
  "DATABASE_URL",
  "REDIS_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  if (!process.env[key]) throw new Error(`Missing ${key}`);
const sql = postgres(process.env.DATABASE_URL!, { max: 4, prepare: false });
const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const redis = new URL(process.env.REDIS_URL!);
const worker = new Worker(
  "jobbflow",
  async (task) => {
    const userId = task.data.userId;
    if (typeof userId !== "string" || !/^[a-f0-9-]{36}$/i.test(userId))
      throw new Error("INVALID_TASK");
    if (task.name === "delete_account") {
      const [request] =
        await sql`select id,state from jobbflow.deletion_requests where user_id=${userId}`;
      if (!request || request.state === "completed") return;
      await deleteCandidateData(userId, {
        async stopWork(id) {
          const [sub] =
            await sql`select stripe_subscription_id from jobbflow.subscriptions where user_id=${id}`;
          if (sub?.stripe_subscription_id) {
            if (!process.env.STRIPE_SECRET_KEY)
              throw new Error("BILLING_CANCELLATION_UNAVAILABLE");
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
              timeout: 15000,
              maxNetworkRetries: 2,
            });
            const current = await stripe.subscriptions.retrieve(
              sub.stripe_subscription_id,
            );
            if (current.status !== "canceled")
              await stripe.subscriptions.cancel(current.id);
          }
          await sql`update jobbflow.profiles set state='deleting' where user_id=${id}`;
          await sql`update jobbflow.agent_runs set status='canceled' where user_id=${id} and status in ('queued','running')`;
          await sql`update jobbflow.notifications set status='canceled' where user_id=${id} and status='pending'`;
        },
        async listObjects(id) {
          return (
            await sql`select bucket,object_key from jobbflow.documents where user_id=${id}`
          ).map((r) => ({ bucket: r.bucket, key: r.object_key }));
        },
        async removeObject(bucket, key) {
          const { error } = await storage.storage.from(bucket).remove([key]);
          if (error) throw new Error("STORAGE_DELETE_FAILED");
        },
        async deleteRows(id) {
          await sql`delete from jobbflow.profiles where user_id=${id}`;
        },
        async deleteIdentity(id) {
          const { error } = await storage.auth.admin.deleteUser(id);
          if (error && error.status !== 404)
            throw new Error("IDENTITY_DELETE_FAILED");
        },
        async complete(id) {
          await sql`update jobbflow.deletion_requests set state='completed',completed_at=now(),error_code=null where user_id=${id}`;
        },
      });
      return;
    }
    const [profile] =
      await sql`select state from jobbflow.profiles where user_id=${userId}`;
    if (profile?.state !== "active") return;
    if (task.name === "daily_search") {
      // Source contracts are a hard launch gate; no mock activity is generated.
      const [p] =
        await sql`select roles,occupation_ids,locations from jobbflow.candidate_preferences where user_id=${userId}`;
      await Promise.all(
        sources.map((s) =>
          s.search({
            query: p.roles.join(" "),
            occupationIds: p.occupation_ids,
            municipalityIds: [],
          }),
        ),
      );
      throw new Error("INGEST_PERSISTENCE_NOT_IMPLEMENTED");
    }
    throw new Error("UNSUPPORTED_TASK");
  },
  {
    connection: {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      username: redis.username ? decodeURIComponent(redis.username) : undefined,
      password: redis.password ? decodeURIComponent(redis.password) : undefined,
      tls: redis.protocol === "rediss:" ? {} : undefined,
    },
    concurrency: 2,
  },
);
worker.on("failed", async (task) => {
  if (task?.name === "delete_account")
    await sql`update jobbflow.deletion_requests set state='retry_required',error_code='DELETE_FAILED' where user_id=${task.data.userId}`;
});
process.on("SIGTERM", async () => {
  await worker.close();
  await sql.end();
  process.exit(0);
});
