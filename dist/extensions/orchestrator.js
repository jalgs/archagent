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
exports.default = archagentOrchestrator;
const agent_runner_1 = require("../orchestrator/agent-runner");
const ab = __importStar(require("../orchestrator/archbase"));
const pipeline_1 = require("../orchestrator/pipeline");
const post_cycle_1 = require("../orchestrator/post-cycle");
function archagentOrchestrator(pi) {
    let pendingCheckpointResolve = null;
    function resolveCheckpoint(decision) {
        if (!pendingCheckpointResolve)
            return;
        pendingCheckpointResolve(decision);
        pendingCheckpointResolve = null;
    }
    function makeCheckpointHandler(ctx) {
        return async (label, artifactPath) => {
            const content = ab.readIfExists(artifactPath);
            ctx.ui.notify(`⏸ CHECKPOINT: ${label}`, "info");
            pi.sendUserMessage(`## ⏸ Checkpoint: ${label}\n\nArtifact: \`${artifactPath}\`\n\n---\n\n${content}\n\n---\n\nUse **/arch:approve** to continue or **/arch:reject <feedback>** to revise.`, { deliverAs: "followUp" });
            ab.writeWorkflowState({
                ...ab.readWorkflowState(),
                status: "waiting-checkpoint",
                pendingCheckpoint: { label, artifactPath },
            });
            return new Promise((resolve) => {
                pendingCheckpointResolve = resolve;
            });
        };
    }
    pi.registerCommand("arch:init", {
        description: "Initialize archbase/ in the current repository",
        handler: async (_args, ctx) => {
            if (ab.isInitialized()) {
                ctx.ui.notify("archbase/ already initialized", "info");
                return;
            }
            const repoName = process.cwd().split("/").pop() ?? "unknown";
            ab.init(repoName);
            ctx.ui.notify("✓ archbase/ initialized. Edit CONSTRAINTS.md and CONVENTIONS.md.", "info");
            ctx.ui.setStatus("archagent", "ready");
        },
    });
    pi.registerCommand("arch:task", {
        description: "Launch full agent pipeline. Usage: /arch:task <zone> | <objective>",
        handler: async (args, ctx) => {
            if (!ab.isInitialized()) {
                ctx.ui.notify("Run /arch:init first", "error");
                return;
            }
            const [zone, ...objectiveParts] = args.split("|");
            const objective = objectiveParts.join("|").trim();
            if (!zone?.trim() || !objective) {
                ctx.ui.notify("Usage: /arch:task <zone> | <objective>", "error");
                return;
            }
            await runPipeline(zone.trim(), objective, pi, ctx, makeCheckpointHandler(ctx));
        },
    });
    pi.registerCommand("arch:review", {
        description: "Run standalone Verify audit on a zone",
        handler: async (args, ctx) => {
            if (!ab.isInitialized()) {
                ctx.ui.notify("Run /arch:init first", "error");
                return;
            }
            const zone = args.trim() || ".";
            ctx.ui.setStatus("archagent", `reviewing ${zone}...`);
            await (0, agent_runner_1.runStep)({
                step: {
                    role: "verify",
                    mode: "standard",
                    zone,
                    objective: `Standalone architecture review of zone "${zone}"`,
                    requiresCheckpoint: true,
                    checkpointLabel: "Review Audit Report",
                },
                onCheckpoint: makeCheckpointHandler(ctx),
                onProgress: (msg) => ctx.ui.setStatus("archagent", msg),
            });
            ctx.ui.setStatus("archagent", "review complete");
        },
    });
    pi.registerCommand("arch:status", {
        description: "Show workflow state and Health Map summary",
        handler: async (_args, _ctx) => {
            const state = ab.readWorkflowState();
            const map = ab.readHealthMap();
            const lines = [
                `**Status:** ${state.status}`,
                state.currentObjective ? `**Objective:** ${state.currentObjective}` : "",
                state.currentRole ? `**Current agent:** ${state.currentRole}` : "",
                state.activeDDRPath ? `**Active DDR:** ${state.activeDDRPath}` : "",
                "",
                "**Health Map:**",
            ];
            if (map) {
                for (const [zone, health] of Object.entries(map.zones)) {
                    const worst = worstDimension(health.dimensions);
                    lines.push(`- ${zone}: ${worst} (trend: ${health.trend})`);
                }
            }
            else {
                lines.push("- No Health Map yet. Run /arch:task.");
            }
            pi.sendUserMessage(lines.filter(Boolean).join("\n"), { deliverAs: "followUp" });
        },
    });
    pi.registerCommand("arch:approve", {
        description: "Approve the pending checkpoint",
        handler: async (_args, ctx) => {
            resolveCheckpoint({ type: "approved" });
            ctx.ui.notify("✓ Checkpoint approved — pipeline continuing", "info");
        },
    });
    pi.registerCommand("arch:reject", {
        description: "Reject pending checkpoint. Usage: /arch:reject <comment>",
        handler: async (args, ctx) => {
            const comment = args.trim();
            if (!comment) {
                ctx.ui.notify("Provide feedback: /arch:reject <comment>", "error");
                return;
            }
            resolveCheckpoint({ type: "rejected", comment });
            const add = await ctx.ui.confirm("Add to CONSTRAINTS.md?", `"${comment}"\n\nThis feedback seems like a project constraint. Add it permanently?`);
            if (add) {
                const existing = ab.readIfExists(ab.paths.knowledge.constraints);
                const date = new Date().toISOString().split("T")[0];
                ab.write(ab.paths.knowledge.constraints, `${existing}\n\n## [${date}] Inferred from DDR rejection\n${comment}\n`);
                ab.refreshAgentsMd();
                ctx.ui.notify("✓ Added to CONSTRAINTS.md", "info");
            }
            ctx.ui.notify("✗ Checkpoint rejected — agent will revise", "info");
        },
    });
    pi.on("session_start", async (_event, ctx) => {
        const s = ab.readWorkflowState();
        if (s.status !== "idle") {
            ctx.ui.setStatus("archagent", `[${s.status}] ${s.currentRole ?? ""}`.trim());
        }
    });
}
async function runPipeline(zone, objective, _pi, ctx, onCheckpoint) {
    const pipeline = (0, pipeline_1.configurePipeline)(zone, objective);
    ab.writeWorkflowState({
        status: "running",
        currentObjective: objective,
        currentStep: 0,
        totalSteps: pipeline.steps.length,
        zone,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    ctx.ui.setStatus("archagent", `Pipeline: 0/${pipeline.steps.length}`);
    ctx.ui.notify(`🚀 Starting pipeline — ${pipeline.steps.length} steps for zone "${zone}"`, "info");
    let activeDDRPath;
    for (let i = 0; i < pipeline.steps.length; i += 1) {
        const step = pipeline.steps[i];
        ab.writeWorkflowState({
            ...ab.readWorkflowState(),
            currentStep: i + 1,
            currentRole: step.role,
        });
        ctx.ui.setStatus("archagent", `Step ${i + 1}/${pipeline.steps.length}: ${step.role}`);
        if (step.role === "act" && step.mode !== "characterization") {
            const n = ab.nextDDRNumber() - 1;
            activeDDRPath = ab.paths.decisions.ddr(n);
            step.allowedPaths = extractAuthorizedPathsFromDDR(activeDDRPath);
        }
        try {
            await (0, agent_runner_1.runStep)({
                step,
                activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
                onCheckpoint,
                onProgress: (msg) => ctx.ui.setStatus("archagent", msg),
            });
        }
        catch (err) {
            ctx.ui.notify(`❌ Step ${step.role} failed: ${String(err)}`, "error");
            ab.writeWorkflowState({
                ...ab.readWorkflowState(),
                status: "failed",
            });
            return;
        }
    }
    if (activeDDRPath) {
        (0, post_cycle_1.postCycleUpdate)(zone, activeDDRPath);
    }
    ab.writeWorkflowState({
        status: "idle",
        updatedAt: new Date().toISOString(),
    });
    ctx.ui.setStatus("archagent", "✓ complete");
    ctx.ui.notify(`✅ Pipeline complete for "${objective}"`, "info");
}
function worstDimension(dims) {
    const statuses = Object.values(dims).map((d) => d.status);
    if (statuses.includes("compromised"))
        return "⚠ compromised";
    if (statuses.includes("attention"))
        return "~ attention";
    return "✓ healthy";
}
function extractAuthorizedPathsFromDDR(ddrPath) {
    const content = ab.readIfExists(ddrPath);
    const match = content.match(/#{2,3}\s*Authorized Files\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/);
    if (!match)
        return [];
    return match[1]
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
}
