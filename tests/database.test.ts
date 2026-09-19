import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile, readdir } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
test("real migrations: private storage, user isolation, quota and cascading deletion", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;`,
    );
    await db.exec("create table public.profiles(marker text); insert into public.profiles values('legacy-preserved');");
    for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    assert.equal((await db.query<any>("select marker from public.profiles")).rows[0].marker, 'legacy-preserved');
    await db.exec("set search_path=jobbflow,pg_temp");
    await db.query<any>("insert into auth.users values($1),($2)", [a, b]);
    const profiles = await db.query<any>(
      "select count(*)::int as count from profiles",
    );
    assert.equal(profiles.rows[0].count, 2);
    assert.equal(
      (await db.query<any>("select public from storage.buckets")).rows[0]
        .public,
      false,
    );
    await db.exec(
      "grant select,insert,update,delete on all tables in schema jobbflow to authenticated;",
    );
    await db.query<any>("select set_config('request.jwt.claim.sub',$1,false)", [
      a,
    ]);
    await db.exec("set role authenticated");
    const own = await db.query<any>("select user_id from profiles");
    assert.equal(own.rows.length, 1);
    assert.equal(own.rows[0].user_id, a);
    await assert.rejects(
      db.query<any>("insert into skills(user_id,label) values($1,$2)", [
        b,
        "Secret skill",
      ]),
    );
    await assert.rejects(
      db
        .query<any>(
          "update subscriptions set plan='agent' where user_id=$1 returning *",
          [a],
        )
        .then((r) => {
          if (!r.rows.length) throw new Error("RLS denied");
        }),
    );
    await db.exec("reset role");
    const job = "33333333-3333-4333-8333-333333333333",
      application = "44444444-4444-4444-8444-444444444444";
    await db.query(
      "insert into jobs(id,source_id,external_id,title,canonical_url,source_url,published_at,description,description_completeness) values($1,'jobsearch','contract-test','Test','https://example.org/job','https://example.org/job',now(),'Test','full')",
      [job],
    );
    await db.query(
      "insert into applications(id,user_id,job_id) values($1,$2,$3)",
      [application, a, job],
    );
    await db.query(
      "insert into draft_generation_leases(user_id,application_id,owner,expires_at) values($1,$2,gen_random_uuid(),now()+interval '2 minutes')",
      [a, application],
    );
    const duplicate = await db.query(
      "insert into draft_generation_leases(user_id,application_id,owner,expires_at) values($1,$2,gen_random_uuid(),now()+interval '2 minutes') on conflict(user_id,application_id) do update set owner=excluded.owner where draft_generation_leases.expires_at<now() returning owner",
      [a, application],
    );
    assert.equal(
      duplicate.rows.length,
      0,
      "a concurrent generator must not receive a lease",
    );
    await assert.rejects(
      db.query(
        "insert into draft_generation_leases(user_id,application_id,owner,expires_at) values($1,$2,gen_random_uuid(),now())",
        [b, application],
      ),
    );

    for (let i = 0; i < 25; i++)
      await db.query<any>(
        "select reserve_usage($1,'deep_match',gen_random_uuid())",
        [a],
      );
    await assert.rejects(
      db.query<any>("select reserve_usage($1,'deep_match',gen_random_uuid())", [
        a,
      ]),
      /QUOTA_EXCEEDED/,
    );
    await db.query<any>(
      "insert into candidate_facts(user_id,profile_version,kind,fact,confirmed) values($1,1,$2,$3,true)",
      [a, "experience", "Private experience"],
    );
    await db.query<any>("delete from profiles where user_id=$1", [a]);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as count from candidate_facts where user_id=$1",
          [a],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as count from usage_events where user_id=$1",
          [a],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as count from profiles where user_id=$1",
          [b],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});
