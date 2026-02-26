import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as ab from "../orchestrator/archbase";

export default function scopeEnforcer(pi: ExtensionAPI): void {
  const role = process.env.ARCHAGENT_ROLE;
  if (role !== "act") return;

  const allowedPathsRaw = process.env.ARCHAGENT_ALLOWED_PATHS ?? "";
  const allowedPaths = allowedPathsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // If no allowed paths are provided, default to strict blocking.
  // This prevents the Act agent from operating without an explicit authorized scope.

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const targetPath = String((event.input as { path?: string; filePath?: string }).path ?? (event.input as { path?: string; filePath?: string }).filePath ?? "");

    if (targetPath.startsWith("archbase/")) return;

    if (allowedPaths.length === 0) {
      ctx.ui.notify(
        `🛡 scope-enforcer: No authorized scope configured (ARCHAGENT_ALLOWED_PATHS empty). Blocking write to "${targetPath}"`,
        "error",
      );
      return {
        block: true,
        reason:
          `scope-enforcer: No authorized paths provided by DDR/orchestrator. ` +
          `Blocking write to "${targetPath}" until scope is explicitly defined.`,
      };
    }

    const isAllowed = allowedPaths.some((allowed) => {
      const escaped = escapeRegex(allowed);
      const pattern = escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*");
      return new RegExp(`^${pattern}$`).test(targetPath);
    });

    if (!isAllowed) {
      ctx.ui.notify(`🛡 scope-enforcer: "${targetPath}" is NOT in the authorized DDR scope`, "error");
      return {
        block: true,
        reason: `scope-enforcer: File "${targetPath}" is not authorized by the active DDR. Authorized paths: ${allowedPaths.join(", ")}`,
      };
    }

    // Record allowed modification for recovery/forensics.
    try {
      const state = ab.readWorkflowState();
      const entry = {
        ts: new Date().toISOString(),
        role: "act",
        zone: state.zone ?? null,
        tool: event.toolName,
        path: targetPath,
      };
      const existing = ab.readIfExists(ab.paths.workflow.modifiedFilesCurrent);
      ab.write(
        ab.paths.workflow.modifiedFilesCurrent,
        `${existing}${existing ? "\n" : ""}${JSON.stringify(entry)}`,
      );
    } catch {
      // ignore logging failures
    }
  });
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
