import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function scopeEnforcer(pi: ExtensionAPI): void {
  const role = process.env.ARCHAGENT_ROLE;
  if (role !== "act") return;

  const allowedPathsRaw = process.env.ARCHAGENT_ALLOWED_PATHS ?? "";
  const allowedPaths = allowedPathsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (allowedPaths.length === 0) return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const targetPath = String((event.input as { path?: string; filePath?: string }).path ?? (event.input as { path?: string; filePath?: string }).filePath ?? "");

    if (targetPath.startsWith("archbase/")) return;

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
  });
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
