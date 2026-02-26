"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scopeEnforcer;
function scopeEnforcer(pi) {
    const role = process.env.ARCHAGENT_ROLE;
    if (role !== "act")
        return;
    const allowedPathsRaw = process.env.ARCHAGENT_ALLOWED_PATHS ?? "";
    const allowedPaths = allowedPathsRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    if (allowedPaths.length === 0)
        return;
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "write" && event.toolName !== "edit")
            return;
        const targetPath = String(event.input.path ?? event.input.filePath ?? "");
        if (targetPath.startsWith("archbase/"))
            return;
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
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
