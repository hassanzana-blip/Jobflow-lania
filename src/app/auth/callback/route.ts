import { NextResponse } from "next/server";
import { userClient } from "@/server/supabase";
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (code) {
    const c = await userClient();
    const { error } = await c.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/app", process.env.APP_BASE_URL));
  }
  return NextResponse.redirect(new URL("/logga-in", process.env.APP_BASE_URL));
}
