import { NextResponse } from "next/server";
import { userClient } from "@/server/supabase";
import {
  classifyAuthError,
  type AuthErrorCode,
} from "@/core/auth-errors";
import {
  failureRedirect,
  parseCallback,
  type CallbackFailure,
} from "@/core/auth-callback";

function base(req: Request) {
  return process.env.APP_BASE_URL || new URL(req.url).origin;
}

function reasonFor(code: AuthErrorCode): CallbackFailure {
  return code === "AUTH_LINK_EXPIRED" ? "expired" : "invalid";
}

export async function GET(req: Request) {
  const plan = parseCallback(req.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, base(req)));
  if (plan.kind === "failed") return to(failureRedirect(plan.reason));
  try {
    const client = await userClient();
    if (plan.kind === "verify") {
      const { error } = await client.auth.verifyOtp({
        token_hash: plan.tokenHash,
        type: plan.type,
      });
      if (error) return to(failureRedirect(reasonFor(classifyAuthError(error))));
    } else {
      const { error } = await client.auth.exchangeCodeForSession(plan.code);
      // A PKCE link opened on another device has no `code_verifier` cookie and
      // can only fail. The error page explains that and offers a fresh link.
      if (error) return to(failureRedirect(reasonFor(classifyAuthError(error))));
    }
    return to(plan.destination);
  } catch {
    return to(failureRedirect("invalid"));
  }
}
