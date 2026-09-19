import {
  verifyApproval,
  type Approval,
  type ApplicationPayload,
} from "./approval.ts";
export interface AssistedBrowser {
  prepare(payload: ApplicationPayload): Promise<{
    state: "ready" | "needs_input" | "manual_required";
    missingFields: string[];
  }>;
  submit(
    payload: ApplicationPayload,
    approval: Approval,
  ): Promise<{ state: "submitted" | "unknown"; receiptUrl?: string }>;
}
export class DisabledBrowserAssistant implements AssistedBrowser {
  async prepare() {
    return { state: "manual_required" as const, missingFields: [] };
  }
  async submit(
    payload: ApplicationPayload,
    approval: Approval,
  ): Promise<never> {
    if (!verifyApproval(approval, payload))
      throw new Error("APPROVAL_REQUIRED");
    throw new Error("BROWSER_ASSISTANCE_DISABLED");
  }
}
// Real Browser Use/Playwright implementations must additionally enforce a host
// allowlist, per-destination permission records, network egress restrictions,
// one-time approval consumption in a DB transaction, and uncertain-outcome
// handling. An LLM reasoning response is never authorization to submit.
