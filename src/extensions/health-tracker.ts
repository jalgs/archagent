import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as ab from "../orchestrator/archbase";

/**
 * NOTE: Health Map updates are handled deterministically by the Orchestrator
 * in postCycleUpdate().
 *
 * This extension is kept as a lightweight signal only.
 */
export default function healthTracker(pi: ExtensionAPI): void {
  const role = process.env.ARCHAGENT_ROLE;
  if (role !== "verify") return;

  pi.on("agent_end", async (_event, ctx) => {
    const state = ab.readWorkflowState();
    if (!state.zone) return;

    const auditReport = ab.readAuditReport();
    if (!auditReport.trim()) return;

    ctx.ui.notify("✓ Verify completed (audit report ready)", "info");
  });
}
