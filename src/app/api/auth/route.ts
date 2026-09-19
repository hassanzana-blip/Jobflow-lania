import { z } from "zod";
import { userClient } from "@/server/supabase";
import { mutationGuard, errorResponse, readJson } from "@/server/request";
import { classifyAuthError, isSilentAuthError, type AuthFlow } from "@/core/auth-errors";
const schema = z.object({
  mode: z.enum(["signup", "login", "magic", "recovery", "update-password"]),
  email: z.email().max(254),
  password: z.string().min(1).max(128).optional(),
  acceptedPrivacy: z.boolean().optional(),
});
/**
 * Turns a Supabase failure into one of our codes. Failures that would reveal
 * whether an address is registered are swallowed so the caller can answer
 * exactly as it does on success.
 */
function failUnlessSilent(flow: AuthFlow, error: unknown): void {
  if (isSilentAuthError(flow, error)) return;
  throw new Error(classifyAuthError(error));
}
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const data = schema.parse(await readJson(req, 4096));
    const client = await userClient();
    const callback = new URL(
      "/auth/callback",
      process.env.APP_BASE_URL,
    ).toString();
    if (data.mode === "recovery") {
      const { error } = await client.auth.resetPasswordForEmail(data.email, {
        redirectTo: callback + "?next=reset-password",
      });
      if (error) failUnlessSilent("recovery", error);
      return Response.json({ checkEmail: true });
    }
    if (data.mode === "update-password") {
      if (!data.password || data.password.length < 12) throw new Error("PASSWORD_REQUIRED");
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || !identity.user) throw new Error("UNAUTHENTICATED");
      const { error } = await client.auth.updateUser({ password: data.password });
      if (error) failUnlessSilent("update-password", error);
      await client.auth.signOut({ scope: "global" });
      return Response.json({ redirect: "/logga-in?password=updated" });
    }
    if (data.mode === "signup") {
      if (!data.password || data.password.length < 12 || !data.acceptedPrivacy)
        throw new Error("CONSENT_REQUIRED");
      const { data: auth, error } = await client.auth.signUp({
        email: data.email,
        password: data.password,
        options: { emailRedirectTo: callback },
      });
      if (error) {
        failUnlessSilent("signup", error);
        return Response.json({ checkEmail: true });
      }
      return Response.json(
        auth.session ? { redirect: "/app/profil" } : { checkEmail: true },
      );
    }
    if (data.mode === "magic") {
      const { error } = await client.auth.signInWithOtp({
        email: data.email,
        options: { shouldCreateUser: false, emailRedirectTo: callback },
      });
      if (error) failUnlessSilent("magic", error);
      return Response.json({ checkEmail: true });
    }
    if (!data.password) throw new Error("PASSWORD_REQUIRED");
    const { error } = await client.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) failUnlessSilent("login", error);
    return Response.json({ redirect: "/app" });
  } catch (e) {
    return errorResponse(e);
  }
}
