import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as ab from "../orchestrator/archbase";
import { updateZoneFromAuditReport } from "../orchestrator/health-map";

export default function healthTracker(pi: ExtensionAPI): void {
  const role = process.env.ARCHAGENT_ROLE;
  if (role !== "verify") return;

  pi.on("agent_end", async (_event, ctx) => {
    const state = ab.readWorkflowState();
    const zone = state.zone;
    if (!zone) return;

    const auditReport = ab.readAuditReport();
    if (!auditReport.trim()) return;

    updateZoneFromAuditReport(zone, auditReport);
    ctx.ui.notify("✓ Health Map updated", "info");
  });
}
