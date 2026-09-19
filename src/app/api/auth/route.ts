import { z } from "zod";
import { userClient } from "@/server/supabase";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
const schema = z.object({
  mode: z.enum(["signup", "login", "magic"]),
  email: z.email().max(254),
  password: z.string().min(1).max(128).optional(),
  acceptedPrivacy: z.boolean().optional(),
});
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const data = schema.parse(await readJson(req, 4096));
    const client = await userClient();
    const callback = new URL(
      "/auth/callback",
      process.env.APP_BASE_URL,
    ).toString();
    if (data.mode === "signup") {
      if (!data.password || data.password.length < 12 || !data.acceptedPrivacy)
        throw new Error("CONSENT_REQUIRED");
      const { data: auth, error } = await client.auth.signUp({
        email: data.email,
        password: data.password,
        options: { emailRedirectTo: callback },
      });
      if (error) throw error;
      return Response.json(
        auth.session ? { redirect: "/app/profil" } : { checkEmail: true },
      );
    }
    if (data.mode === "magic") {
      const { error } = await client.auth.signInWithOtp({
        email: data.email,
        options: { shouldCreateUser: false, emailRedirectTo: callback },
      });
      if (error) throw error;
      return Response.json({ checkEmail: true });
    }
    if (!data.password) throw new Error("PASSWORD_REQUIRED");
    const { error } = await client.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw error;
    return Response.json({ redirect: "/app" });
  } catch (e) {
    return errorResponse(e);
  }
}
