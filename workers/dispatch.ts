import { Queue } from "bullmq";
import postgres from "postgres";

// Run once a minute with the host scheduler. The database ledger is the outbox:
// a Redis outage cannot lose an accepted deletion request.
if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
  throw new Error("WORKER_CONFIG_REQUIRED");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const redis = new URL(process.env.REDIS_URL);
const queue = new Queue("jobbflow", {
  connection: {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    username: redis.username ? decodeURIComponent(redis.username) : undefined,
    password: redis.password ? decodeURIComponent(redis.password) : undefined,
    tls: redis.protocol === "rediss:" ? {} : undefined,
  },
});
try {
  const requests =
    await sql`select id,user_id from jobbflow.deletion_requests where state in ('requested','retry_required') order requested_at limit 100`;
  for (const request of requests) {
    const jobId = `delete-${request.id}`;
    const previous = await queue.getJob(jobId);
    if (previous && (await previous.getState()) === "failed")
      await previous.retry();
    else
      await queue.add(
        "delete_account",
        { userId: request.user_id },
        {
          jobId,
          attempts: 8,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: false,
        },
      );
  }
} finally {
  await queue.close();
  await sql.end();
}
