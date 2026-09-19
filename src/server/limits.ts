import "server-only";
import { createHash } from "node:crypto";
import { database } from "./db";
export async function rateLimit(
  uid: string,
  operation: string,
  max = 30,
  seconds = 60,
) {
  const sql = database(),
    bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = createHash("sha256")
    .update(`${uid}:${operation}:${bucket}`)
    .digest("hex");
  const [row] =
    await sql`insert into jobbflow.api_rate_limits(key,count,expires_at) values(${key},1,to_timestamp(${(bucket + 1) * seconds})) on conflict(key) do update set count=api_rate_limits.count+1 returning count`;
  if (row.count > max) throw new Error("RATE_LIMITED");
}
