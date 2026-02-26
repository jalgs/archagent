import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function planGuard(pi: ExtensionAPI): void {
  const role = process.env.ARCHAGENT_ROLE;
  if (role !== "understand" && role !== "decide") return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const targetPath = String((event.input as { path?: string; filePath?: string }).path ?? (event.input as { path?: string; filePath?: string }).filePath ?? "");

    if (!targetPath.startsWith("archbase/")) {
      ctx.ui.notify(
        `🛡 plan-guard: Blocked write to "${targetPath}" — ${role} agent can only write to archbase/`,
        "error",
      );
      return {
        block: true,
        reason: `plan-guard: ${role} agents can only write to archbase/. Attempted: ${targetPath}`,
      };
    }
  });
}
