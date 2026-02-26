"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scopeEnforcer;
const ab = __importStar(require("../orchestrator/archbase"));
function scopeEnforcer(pi) {
    const role = process.env.ARCHAGENT_ROLE;
    if (role !== "act")
        return;
    const allowedPathsRaw = process.env.ARCHAGENT_ALLOWED_PATHS ?? "";
    const allowedPaths = allowedPathsRaw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    // If no allowed paths are provided, default to strict blocking.
    // This prevents the Act agent from operating without an explicit authorized scope.
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "write" && event.toolName !== "edit")
            return;
        const targetPath = String(event.input.path ?? event.input.filePath ?? "");
        if (targetPath.startsWith("archbase/"))
            return;
        if (allowedPaths.length === 0) {
            ctx.ui.notify(`🛡 scope-enforcer: No authorized scope configured (ARCHAGENT_ALLOWED_PATHS empty). Blocking write to "${targetPath}"`, "error");
            return {
                block: true,
                reason: `scope-enforcer: No authorized paths provided by DDR/orchestrator. ` +
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
            ab.write(ab.paths.workflow.modifiedFilesCurrent, `${existing}${existing ? "\n" : ""}${JSON.stringify(entry)}`);
        }
        catch {
            // ignore logging failures
        }
    });
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
