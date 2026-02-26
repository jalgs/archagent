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
const fs = __importStar(require("node:fs"));
const pi_tui_1 = require("@mariozechner/pi-tui");
const agent_runner_1 = require("../orchestrator/agent-runner");
const ab = __importStar(require("../orchestrator/archbase"));
const pipeline_1 = require("../orchestrator/pipeline");
const post_cycle_1 = require("../orchestrator/post-cycle");
const runtime = {
    verbose: false,
    viewMode: "compact",
    logsExpanded: false,
    recentEvents: [],
    checkpointView: undefined,
    subagent: {
        active: false,
        turns: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
    },
};
const MAX_RECENT_EVENTS = 20;
const SUMMARY_LOG_LINES = 2;
function archagentOrchestrator(pi) {
    let pendingCheckpointResolve = null;
    function recordEvent(message, ctx) {
        runtime.lastEvent = message;
        runtime.recentEvents.push(message);
        if (runtime.recentEvents.length > MAX_RECENT_EVENTS) {
            runtime.recentEvents.splice(0, runtime.recentEvents.length - MAX_RECENT_EVENTS);
        }
        // Ya NO escribimos eventos de usuario en el log del subagente
        if (ctx) {
            refreshRuntimeUi(ctx);
        }
    }
    function recordSubagentLog(message, ctx) {
        const line = `[${new Date().toISOString()}] ${message}`;
        const existing = ab.readIfExists(ab.paths.workflow.runLogCurrent);
        ab.write(ab.paths.workflow.runLogCurrent, `${existing}${existing ? "\n" : ""}${line}`);
        if (ctx) {
            refreshRuntimeUi(ctx);
        }
    }
    function formatTokens(n) {
        if (n < 1000)
            return `${n}`;
        if (n < 10000)
            return `${(n / 1000).toFixed(1)}k`;
        if (n < 1000000)
            return `${Math.round(n / 1000)}k`;
        return `${(n / 1000000).toFixed(1)}M`;
    }
    function resetSubagent() {
        runtime.subagent.active = false;
        runtime.subagent.role = undefined;
        runtime.subagent.turns = 0;
        runtime.subagent.input = 0;
        runtime.subagent.output = 0;
        runtime.subagent.cacheRead = 0;
        runtime.subagent.cacheWrite = 0;
        runtime.subagent.cost = 0;
        runtime.subagent.contextTokens = 0;
    }
    function applyTelemetry(data) {
        runtime.subagent.active = data.phase !== "end";
        runtime.subagent.role = data.role;
        runtime.subagent.model = data.model ?? runtime.subagent.model;
        runtime.subagent.turns = data.turns;
        runtime.subagent.input = data.input;
        runtime.subagent.output = data.output;
        runtime.subagent.cacheRead = data.cacheRead;
        runtime.subagent.cacheWrite = data.cacheWrite;
        runtime.subagent.cost = data.cost;
        runtime.subagent.contextTokens = data.contextTokens;
        if (data.phase === "end")
            runtime.subagent.active = false;
    }
    function installCustomFooter(ctx) {
        if (!ctx.hasUI)
            return;
        ctx.ui.setFooter((tui, theme, footerData) => {
            const unsub = footerData.onBranchChange(() => tui.requestRender());
            return {
                dispose: unsub,
                invalidate() { },
                render(width) {
                    const statuses = footerData.getExtensionStatuses();
                    const stateSummary = statuses.get("archagent") ?? "○ [idle] -";
                    const s = runtime.subagent;
                    const subPart = s.active
                        ? `sub:${s.role ?? "-"} ${s.model ?? "model?"} t:${s.turns} ↑${formatTokens(s.input)} ↓${formatTokens(s.output)} ctx:${formatTokens(s.contextTokens)} $${s.cost.toFixed(3)}`
                        : "sub:idle";
                    const mainUsage = ctx.getContextUsage();
                    const mainCtx = mainUsage?.tokens != null && mainUsage.percent != null
                        ? `main:${formatTokens(mainUsage.tokens)}/${formatTokens(mainUsage.contextWindow)} (${mainUsage.percent.toFixed(1)}%)`
                        : "main:—";
                    const branch = footerData.getGitBranch();
                    const right = `${ctx.model?.id ?? "no-model"}${branch ? ` • ${branch}` : ""}`;
                    const left = theme.fg("dim", `${stateSummary} | ${subPart} | ${mainCtx}`);
                    const rightStyled = theme.fg("dim", right);
                    const pad = " ".repeat(Math.max(1, width - (0, pi_tui_1.visibleWidth)(left) - (0, pi_tui_1.visibleWidth)(rightStyled)));
                    return [(0, pi_tui_1.truncateToWidth)(left + pad + rightStyled, width)];
                },
            };
        });
    }
    function runDetached(ctx, label, fn) {
        recordEvent(`${label} queued`, ctx);
        ctx.ui.notify(`${label} started in background. Use /arch:status to monitor.`, "info");
        void (async () => {
            try {
                await fn();
            }
            catch (err) {
                recordEvent(`${label} crashed: ${String(err)}`, ctx);
                ctx.ui.notify(`${label} crashed: ${String(err)}`, "error");
            }
        })();
    }
    function getLogLines(full) {
        const log = ab.readIfExists(ab.paths.workflow.runLogCurrent);
        const logLines = log.trim() ? log.split("\n") : ["(no log entries yet)"];
        if (full) {
            // Limit to last 500 lines even in "full" mode to keep UI responsive
            return logLines.slice(-500);
        }
        return logLines.slice(-SUMMARY_LOG_LINES);
    }
    function renderOverviewWidget(ctx, state) {
        if (!ctx.hasUI)
            return;
        const statusIcon = iconForStatus(state.status);
        const role = state.currentRole ?? "-";
        const progress = state.currentStep && state.totalSteps
            ? `${state.currentStep}/${state.totalSteps} (done: ${state.lastCompletedStep ?? 0})`
            : "-";
        ctx.ui.setWidget("archagent-overview", (_tui, theme) => {
            const box = new pi_tui_1.Box(1, 1, (t) => theme.bg("customMessageBg", t));
            const leftTitle = theme.fg("accent", theme.bold("STATUS"));
            const rightTitle = theme.fg("accent", theme.bold("CONTEXT"));
            const left = [
                theme.fg(state.status === "failed" ? "error" : state.status === "waiting-checkpoint" ? "warning" : "accent", theme.bold(`${statusIcon} ArchAgent | ${state.status} | ${role} | ${progress}`)),
                `Lock: ${readLockSummary()}`,
                `Verbose: ${runtime.verbose ? theme.fg("success", "ON") : theme.fg("dim", "OFF")}`,
                `View: ${runtime.viewMode}`,
                `Flow logs: ${runtime.logsExpanded ? theme.fg("warning", "FULL") : theme.fg("accent", "SUMMARY")}`,
                state.pendingCheckpoint ? `Checkpoint: ${theme.fg("warning", state.pendingCheckpoint.label)}` : "Checkpoint: -",
            ];
            const right = [
                `Zone: ${theme.fg("accent", state.zone ?? "-")}`,
                `Objective: ${truncate(state.currentObjective ?? "-", runtime.viewMode === "compact" ? 70 : 130)}`,
                `Last event: ${theme.fg("accent", truncate(runtime.lastEvent ?? "-", runtime.viewMode === "compact" ? 70 : 130))}`,
                `Role skill: ${runtime.subagent.role ?? role}`,
                `Sub-model: ${runtime.subagent.model ?? "-"}`,
                `Sub-usage: t:${runtime.subagent.turns} ↑${formatTokens(runtime.subagent.input)} ↓${formatTokens(runtime.subagent.output)} ctx:${formatTokens(runtime.subagent.contextTokens)} $${runtime.subagent.cost.toFixed(3)}`,
            ];
            if (runtime.viewMode === "expanded") {
                right.push("");
                const events = runtime.recentEvents.slice(-3);
                if (events.length > 0) {
                    right.push(theme.fg("accent", "Recent director events:"));
                    right.push(...events.map((e) => theme.fg("dim", `• ${truncate(e, 120)}`)));
                }
            }
            const leftWidth = runtime.viewMode === "compact" ? 64 : 78;
            const rows = Math.max(left.length, right.length);
            const lineRows = [];
            for (let i = 0; i < rows; i += 1) {
                const l = left[i] ?? "";
                const r = right[i] ?? "";
                const pad = " ".repeat(Math.max(0, leftWidth - (0, pi_tui_1.visibleWidth)(l)));
                lineRows.push(`${l}${pad} ${theme.fg("dim", "│")} ${r}`);
            }
            const headerPad = " ".repeat(Math.max(0, leftWidth - (0, pi_tui_1.visibleWidth)(leftTitle)));
            const header = `${leftTitle}${headerPad} ${theme.fg("dim", "│")} ${rightTitle}`;
            const sep = `${theme.fg("dim", "─".repeat(Math.max(24, leftWidth)))}${theme.fg("dim", "┼")}${theme.fg("dim", "─".repeat(runtime.viewMode === "compact" ? 30 : 66))}`;
            box.addChild(new pi_tui_1.Text(`${header}\n${sep}\n${lineRows.join("\n")}`, 0, 0));
            return box;
        }, { placement: "aboveEditor" });
    }
    function renderFlowWidget(ctx, state) {
        if (!ctx.hasUI)
            return;
        ctx.ui.setWidget("archagent-flow", (_tui, theme) => {
            const box = new pi_tui_1.Box(1, 1, (t) => theme.bg("customMessageBg", t));
            const colorizeLog = (line) => {
                const m = line.match(/^\[(.*?)\]\s*(.*)$/);
                const ts = m ? m[1] : "";
                const msg = m ? m[2] : line;
                let tone = "accent";
                let marker = "●";
                const low = msg.toLowerCase();
                if (low.includes("failed") || low.includes("error") || low.includes("crashed")) {
                    tone = "error";
                    marker = "✖";
                }
                else if (low.includes("checkpoint") || low.includes("waiting")) {
                    tone = "warning";
                    marker = "⏸";
                }
                else if (low.includes("completed") || low.includes("approved") || low.includes("released") || low.includes("success")) {
                    tone = "success";
                    marker = "✓";
                }
                else if (low.includes("queued") || low.includes("starting") || low.includes("step")) {
                    tone = "accent";
                    marker = "▶";
                }
                else if (low.includes("→")) {
                    tone = "accent";
                    marker = "  →";
                }
                else {
                    tone = "dim";
                    marker = "○";
                }
                const content = `${theme.fg(tone, marker)} ${theme.fg(tone, msg)}`;
                if (!m)
                    return content;
                // Shorten timestamp to just time
                const time = ts.includes("T") ? ts.split("T")[1].split(".")[0] : ts;
                return `${theme.fg("dim", `[${time}]`)} ${content}`;
            };
            if (state.status === "waiting-checkpoint" && runtime.checkpointView) {
                const cp = runtime.checkpointView;
                const title = theme.fg("warning", theme.bold(`⏸ SUB-AGENT CHECKPOINT | ${cp.label}`));
                const summaryHead = theme.fg("accent", theme.bold("Summary"));
                const actionsHead = theme.fg("accent", theme.bold("Director actions"));
                const previewHead = theme.fg("accent", theme.bold("Artifact preview"));
                const body = [
                    `${theme.fg("dim", "Artifact:")} ${theme.fg("warning", cp.artifactPath)}`,
                    "",
                    summaryHead,
                    ...cp.summary.split("\n").map((l) => theme.fg("dim", l)),
                    "",
                    actionsHead,
                    `${theme.fg("success", "•")} /arch:approve`,
                    `${theme.fg("error", "•")} /arch:reject <feedback>`,
                    `${theme.fg("warning", "•")} /arch:more-analysis <request>`,
                    "",
                    previewHead,
                    ...cp.artifactPreview.map((l) => theme.fg("dim", truncate(l, runtime.viewMode === "compact" ? 160 : 220))),
                ];
                box.addChild(new pi_tui_1.Text(`${title}\n${theme.fg("dim", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}` + `\n${body.join("\n")}`, 0, 0));
                return box;
            }
            const s = runtime.subagent;
            const title = theme.fg(runtime.logsExpanded ? "warning" : "accent", theme.bold("SUB-AGENT FLOW"));
            const status = s.active ? theme.fg("warning", "RUNNING") : theme.fg("dim", "IDLE");
            const role = theme.fg("accent", s.role ?? state.currentRole ?? "-");
            const model = theme.fg("dim", s.model ?? "-");
            const telemetry = [
                `${theme.fg("dim", "Status:")} ${status}    ${theme.fg("dim", "Role:")} ${role}    ${theme.fg("dim", "Model:")} ${model}`,
                `${theme.fg("dim", "Turns:")} ${theme.fg("accent", `${s.turns}`)}    ${theme.fg("dim", "Input:")} ${theme.fg("accent", formatTokens(s.input))}    ${theme.fg("dim", "Output:")} ${theme.fg("accent", formatTokens(s.output))}`,
                `${theme.fg("dim", "Cache R/W:")} ${theme.fg("accent", `${formatTokens(s.cacheRead)}/${formatTokens(s.cacheWrite)}`)}    ${theme.fg("dim", "Ctx:")} ${theme.fg("warning", formatTokens(s.contextTokens))}    ${theme.fg("dim", "Cost:")} ${theme.fg("success", `$${s.cost.toFixed(3)}`)}`,
            ];
            const logLines = getLogLines(runtime.logsExpanded);
            const logsHead = theme.fg("accent", theme.bold(runtime.logsExpanded ? "Live log stream (FULL)" : "Recent sub-agent activity"));
            const renderedLogs = logLines.length > 0
                ? logLines.map((l) => colorizeLog(truncate(l, runtime.viewMode === "compact" ? 180 : 260)))
                : [theme.fg("dim", "(no sub-agent activity yet)")];
            const body = [...telemetry];
            if (runtime.logsExpanded || s.active) {
                body.push("");
                body.push(logsHead);
                body.push(theme.fg("dim", "────────────────────────────────────────────────────────"));
                body.push(...renderedLogs);
            }
            box.addChild(new pi_tui_1.Text(`${title}\n${theme.fg("dim", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}\n${body.join("\n")}`, 0, 0));
            return box;
        }, { placement: "aboveEditor" });
    }
    function refreshRuntimeUi(ctx) {
        const state = ab.readWorkflowState();
        const statusIcon = iconForStatus(state.status);
        const role = state.currentRole ?? "-";
        const footer = `${statusIcon} [${state.status}] ${role}`.trim();
        ctx.ui.setStatus("archagent", footer || "idle");
        if (!ctx.hasUI)
            return;
        installCustomFooter(ctx);
        // Ensure legacy/old widgets are always cleared.
        ctx.ui.setWidget("archagent-output", undefined);
        ctx.ui.setWidget("archagent-checkpoint", undefined);
        ctx.ui.setWidget("archagent-state", undefined);
        ctx.ui.setWidget("archagent-context", undefined);
        renderOverviewWidget(ctx, state);
        renderFlowWidget(ctx, state);
    }
    function tryAcquireWorkflowLock(command, ctx) {
        const lockPath = ab.paths.workflow.lock;
        if (ab.exists(lockPath)) {
            const lockRaw = ab.readIfExists(lockPath);
            let owner = "unknown";
            try {
                const parsed = JSON.parse(lockRaw);
                owner = `${parsed.owner ?? "unknown"} (${parsed.command ?? "?"} @ ${parsed.startedAt ?? "?"})`;
            }
            catch {
                owner = lockRaw || "unknown";
            }
            ctx.ui.notify(`Another workflow is active (lock held by ${owner}). Use /arch:status or /arch:abort.`, "warning");
            return null;
        }
        const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        ab.write(lockPath, JSON.stringify({
            owner,
            pid: process.pid,
            command,
            startedAt: new Date().toISOString(),
        }, null, 2));
        recordEvent(`Lock acquired by ${owner} for ${command}`, ctx);
        return owner;
    }
    function releaseWorkflowLock(owner, ctx) {
        if (!owner)
            return;
        const lockPath = ab.paths.workflow.lock;
        if (!ab.exists(lockPath))
            return;
        const lockRaw = ab.readIfExists(lockPath);
        try {
            const parsed = JSON.parse(lockRaw);
            if (parsed.owner !== owner)
                return;
        }
        catch {
            return;
        }
        fs.unlinkSync(lockPath);
        recordEvent(`Lock released by ${owner}`, ctx);
    }
    function forceReleaseWorkflowLock(ctx) {
        const lockPath = ab.paths.workflow.lock;
        if (!ab.exists(lockPath))
            return;
        fs.unlinkSync(lockPath);
        recordEvent("Lock force-released", ctx);
    }
    function resolveCheckpoint(decision, ctx) {
        if (!pendingCheckpointResolve)
            return false;
        pendingCheckpointResolve(decision);
        pendingCheckpointResolve = null;
        runtime.checkpointView = undefined;
        if (ctx)
            refreshRuntimeUi(ctx);
        return true;
    }
    function makeCheckpointHandler(ctx) {
        return async (label, artifactPath) => {
            const content = ab.readIfExists(artifactPath);
            const summary = summarizeArtifact(artifactPath, content);
            runtime.checkpointView = {
                label,
                artifactPath,
                summary,
                artifactPreview: toWidgetLines(content || "(empty file)", 220),
            };
            recordEvent(`Checkpoint opened: ${label} (${artifactPath})`, ctx);
            ctx.ui.notify(`⏸ CHECKPOINT: ${label}`, "info");
            ab.writeWorkflowState({
                ...ab.readWorkflowState(),
                status: "waiting-checkpoint",
                pendingCheckpoint: { label, artifactPath },
            });
            refreshRuntimeUi(ctx);
            return new Promise((resolve) => {
                pendingCheckpointResolve = resolve;
            });
        };
    }
    pi.registerCommand("arch:init", {
        description: "Initialize archbase/ (non-destructive) and run deep bootstrap analysis",
        handler: async (_args, ctx) => {
            runDetached(ctx, "arch:init", async () => {
                const lockOwner = tryAcquireWorkflowLock("arch:init", ctx);
                if (!lockOwner)
                    return;
                try {
                    const current = ab.readWorkflowState();
                    if (current.status !== "idle") {
                        ctx.ui.notify(`Workflow is ${current.status}. Use /arch:resume to continue or /arch:abort to reset.`, "warning");
                        return;
                    }
                    const wasInitialized = ab.isInitialized();
                    const repoName = process.cwd().split("/").pop() ?? "unknown";
                    ab.init(repoName);
                    if (wasInitialized) {
                        ctx.ui.notify("archbase/ already exists. Missing files were created without overriding existing ones.", "info");
                        recordEvent("arch:init non-destructive sync (existing archbase)", ctx);
                    }
                    else {
                        ctx.ui.notify("✓ archbase/ initialized (non-destructive).", "info");
                        recordEvent("arch:init created base structure", ctx);
                    }
                    ab.writeWorkflowState({
                        ...ab.readWorkflowState(),
                        status: "running",
                        currentObjective: "Deep bootstrap analysis",
                        currentStep: 1,
                        totalSteps: 1,
                        currentRole: "understand",
                        zone: ".",
                        startedAt: new Date().toISOString(),
                    });
                    refreshRuntimeUi(ctx);
                    await (0, agent_runner_1.runStep)({
                        step: {
                            role: "understand",
                            mode: "deep",
                            zone: ".",
                            objective: "Bootstrap archbase in-depth. Perform a deep architectural analysis of the entire repository. " +
                                "Write/update ARCH.md and zone-level analysis in archbase/. Include forensics artifacts (ARCHAEOLOGY.md and INTENT.md) when uncertainty or legacy signals exist.",
                            requiresCheckpoint: true,
                            checkpointLabel: "Review bootstrap deep analysis (ARCH/forensics)",
                        },
                        onCheckpoint: makeCheckpointHandler(ctx),
                        onProgress: (msg) => {
                            recordSubagentLog(`bootstrap: ${msg}`, ctx);
                        },
                        onTelemetry: (data) => {
                            applyTelemetry(data);
                            refreshRuntimeUi(ctx);
                        },
                    });
                    ab.writeWorkflowState({
                        status: "idle",
                        updatedAt: new Date().toISOString(),
                    });
                    recordEvent("Bootstrap analysis completed", ctx);
                    ctx.ui.notify("✅ Bootstrap analysis complete. Review ARCH.md, then refine CONSTRAINTS.md and CONVENTIONS.md.", "info");
                }
                catch (err) {
                    ab.writeWorkflowState({
                        ...ab.readWorkflowState(),
                        status: "failed",
                    });
                    recordEvent(`Bootstrap failed: ${String(err)}`, ctx);
                    ctx.ui.notify(`❌ Bootstrap analysis failed: ${String(err)}`, "error");
                }
                finally {
                    releaseWorkflowLock(lockOwner, ctx);
                }
            });
        },
    });
    pi.registerCommand("arch:task", {
        description: "Launch full agent pipeline. Usage: /arch:task <zone> | <objective>",
        handler: async (args, ctx) => {
            runDetached(ctx, "arch:task", async () => {
                if (!ab.isInitialized()) {
                    ctx.ui.notify("Run /arch:init first", "error");
                    return;
                }
                const lockOwner = tryAcquireWorkflowLock("arch:task", ctx);
                if (!lockOwner)
                    return;
                try {
                    const existing = ab.readWorkflowState();
                    if (existing.status !== "idle") {
                        ctx.ui.notify(`Workflow is ${existing.status}. Use /arch:resume to continue or /arch:abort to reset.`, "warning");
                        return;
                    }
                    const [zone, ...objectiveParts] = args.split("|");
                    const objective = objectiveParts.join("|").trim();
                    if (!zone?.trim() || !objective) {
                        ctx.ui.notify("Usage: /arch:task <zone> | <objective>", "error");
                        return;
                    }
                    recordEvent(`Task requested: zone=${zone.trim()} objective=${objective}`, ctx);
                    const pipeline = (0, pipeline_1.configurePipeline)(zone.trim(), objective);
                    await executePipeline({
                        pipeline,
                        zone: zone.trim(),
                        objective,
                        ctx,
                        onCheckpoint: makeCheckpointHandler(ctx),
                        startIndex: 0,
                        resumed: false,
                        onEvent: (message) => recordSubagentLog(message, ctx),
                        onTelemetry: (data) => {
                            applyTelemetry(data);
                            refreshRuntimeUi(ctx);
                        },
                    });
                }
                finally {
                    releaseWorkflowLock(lockOwner, ctx);
                }
            });
        },
    });
    pi.registerCommand("arch:resume", {
        description: "Resume interrupted workflow from current step",
        handler: async (_args, ctx) => {
            runDetached(ctx, "arch:resume", async () => {
                if (!ab.isInitialized()) {
                    ctx.ui.notify("Run /arch:init first", "error");
                    return;
                }
                const lockOwner = tryAcquireWorkflowLock("arch:resume", ctx);
                if (!lockOwner)
                    return;
                try {
                    const state = ab.readWorkflowState();
                    if (state.status === "idle") {
                        ctx.ui.notify("No interrupted workflow to resume", "info");
                        return;
                    }
                    if (!state.zone || !state.currentObjective) {
                        ctx.ui.notify("Cannot resume: missing zone/objective in WORKFLOW_STATE", "error");
                        return;
                    }
                    recordEvent(`Resuming workflow from status=${state.status}`, ctx);
                    const pipeline = (0, pipeline_1.configurePipeline)(state.zone, state.currentObjective);
                    const stepNumber = state.currentStep ?? (state.lastCompletedStep ? state.lastCompletedStep + 1 : 1);
                    const startIndex = Math.max(stepNumber - 1, 0);
                    await executePipeline({
                        pipeline,
                        zone: state.zone,
                        objective: state.currentObjective,
                        ctx,
                        onCheckpoint: makeCheckpointHandler(ctx),
                        startIndex,
                        resumed: true,
                        onEvent: (message) => recordSubagentLog(message, ctx),
                        onTelemetry: (data) => {
                            applyTelemetry(data);
                            refreshRuntimeUi(ctx);
                        },
                    });
                }
                finally {
                    releaseWorkflowLock(lockOwner, ctx);
                }
            });
        },
    });
    pi.registerCommand("arch:abort", {
        description: "Abort current workflow and reset to idle",
        handler: async (_args, ctx) => {
            const state = ab.readWorkflowState();
            pendingCheckpointResolve = null;
            runtime.checkpointView = undefined;
            resetSubagent();
            ab.writeWorkflowState({
                status: "idle",
                updatedAt: new Date().toISOString(),
            });
            forceReleaseWorkflowLock(ctx);
            recordEvent("Workflow aborted by Director", ctx);
            ctx.ui.notify("Workflow aborted and reset to idle", "warning");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:review", {
        description: "Run standalone Verify audit on a zone",
        handler: async (args, ctx) => {
            runDetached(ctx, "arch:review", async () => {
                if (!ab.isInitialized()) {
                    ctx.ui.notify("Run /arch:init first", "error");
                    return;
                }
                const lockOwner = tryAcquireWorkflowLock("arch:review", ctx);
                if (!lockOwner)
                    return;
                try {
                    const zone = args.trim() || ".";
                    recordEvent(`Standalone review started for zone=${zone}`, ctx);
                    refreshRuntimeUi(ctx);
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
                        onProgress: (msg) => {
                            recordSubagentLog(`review: ${msg}`, ctx);
                        },
                        onTelemetry: (data) => {
                            applyTelemetry(data);
                            refreshRuntimeUi(ctx);
                        },
                    });
                    recordEvent("Standalone review completed", ctx);
                }
                finally {
                    releaseWorkflowLock(lockOwner, ctx);
                }
            });
        },
    });
    pi.registerCommand("arch:verbose", {
        description: "Toggle runtime verbosity. Usage: /arch:verbose on|off",
        handler: async (args, ctx) => {
            const value = args.trim().toLowerCase();
            if (!value || (value !== "on" && value !== "off")) {
                ctx.ui.notify(`Verbose is currently ${runtime.verbose ? "ON" : "OFF"}. Usage: /arch:verbose on|off`, "info");
                return;
            }
            runtime.verbose = value === "on";
            ctx.ui.notify(`Verbose mode: ${runtime.verbose ? "ON" : "OFF"}`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:view", {
        description: "Set runtime widget density. Usage: /arch:view compact|expanded",
        handler: async (args, ctx) => {
            const value = args.trim().toLowerCase();
            if (!value || (value !== "compact" && value !== "expanded")) {
                ctx.ui.notify(`Current view is ${runtime.viewMode}. Usage: /arch:view compact|expanded`, "info");
                return;
            }
            runtime.viewMode = value;
            ctx.ui.notify(`View mode: ${runtime.viewMode}`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:logs", {
        description: "Refresh flow widget with current log mode",
        handler: async (_args, ctx) => {
            ctx.ui.notify(`Flow log refreshed (${runtime.logsExpanded ? "FULL" : "SUMMARY"})`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:logs-mode", {
        description: "Toggle flow log mode. Usage: /arch:logs-mode full|summary",
        handler: async (args, ctx) => {
            const value = args.trim().toLowerCase();
            if (!value || (value !== "full" && value !== "summary")) {
                ctx.ui.notify(`Current logs mode is ${runtime.logsExpanded ? "full" : "summary"}. Usage: /arch:logs-mode full|summary`, "info");
                return;
            }
            runtime.logsExpanded = value === "full";
            ctx.ui.notify(`Logs mode: ${runtime.logsExpanded ? "FULL" : "SUMMARY"}`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerShortcut(pi_tui_1.Key.ctrlShift("o"), {
        description: "Toggle full logs panel",
        handler: async (ctx) => {
            runtime.logsExpanded = !runtime.logsExpanded;
            ctx.ui.notify(`Logs panel: ${runtime.logsExpanded ? "FULL" : "SUMMARY"}`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:status", {
        description: "Show workflow state summary",
        handler: async (_args, ctx) => {
            const state = ab.readWorkflowState();
            ctx.ui.notify(`Workflow: ${state.status} | Agent: ${state.currentRole ?? "idle"} | Objective: ${truncate(state.currentObjective ?? "none", 60)}`, "info");
            refreshRuntimeUi(ctx);
        },
    });
    pi.registerCommand("arch:approve", {
        description: "Approve the pending checkpoint",
        handler: async (_args, ctx) => {
            if (!resolveCheckpoint({ type: "approved" }, ctx)) {
                const state = ab.readWorkflowState();
                if (state.status === "waiting-checkpoint") {
                    ctx.ui.notify("Checkpoint session was interrupted. Use /arch:resume to recreate it.", "warning");
                    return;
                }
                ctx.ui.notify("No pending checkpoint in this session", "warning");
                return;
            }
            recordEvent("Checkpoint approved", ctx);
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
            if (!resolveCheckpoint({ type: "rejected", comment }, ctx)) {
                const state = ab.readWorkflowState();
                if (state.status === "waiting-checkpoint") {
                    ctx.ui.notify("Checkpoint session was interrupted. Use /arch:resume to recreate it.", "warning");
                }
                else {
                    ctx.ui.notify("No pending checkpoint in this session", "warning");
                }
                return;
            }
            recordEvent(`Checkpoint rejected: ${truncate(comment, 120)}`, ctx);
            const add = await ctx.ui.confirm("Add to CONSTRAINTS.md?", `"${comment}"\n\nThis feedback seems like a project constraint. Add it permanently?`);
            if (add) {
                const existing = ab.readIfExists(ab.paths.knowledge.constraints);
                const date = new Date().toISOString().split("T")[0];
                ab.write(ab.paths.knowledge.constraints, `${existing}\n\n## [${date}] Inferred from DDR rejection\n${comment}\n`);
                ab.refreshAgentsMd();
                ctx.ui.notify("✓ Added to CONSTRAINTS.md", "info");
                recordEvent("Constraint inferred and added from rejection feedback", ctx);
            }
            ctx.ui.notify("✗ Checkpoint rejected — agent will revise", "info");
        },
    });
    pi.registerCommand("arch:more-analysis", {
        description: "Request more analysis at checkpoint. Usage: /arch:more-analysis <request>",
        handler: async (args, ctx) => {
            const request = args.trim();
            if (!request) {
                ctx.ui.notify("Usage: /arch:more-analysis <request>", "error");
                return;
            }
            if (!resolveCheckpoint({ type: "more-analysis", request }, ctx)) {
                const state = ab.readWorkflowState();
                if (state.status === "waiting-checkpoint") {
                    ctx.ui.notify("Checkpoint session was interrupted. Use /arch:resume to recreate it.", "warning");
                }
                else {
                    ctx.ui.notify("No pending checkpoint in this session", "warning");
                }
                return;
            }
            recordEvent(`More analysis requested: ${truncate(request, 120)}`, ctx);
            ctx.ui.notify("ℹ Requested more analysis — pipeline continuing", "info");
        },
    });
    pi.on("session_start", async (_event, ctx) => {
        const s = ab.readWorkflowState();
        if (s.status === "idle")
            resetSubagent();
        recordEvent(`Session started (workflow=${s.status})`, ctx);
        refreshRuntimeUi(ctx);
        if (s.status !== "idle") {
            ctx.ui.notify(buildRecoveryHint(s), "warning");
        }
        if (ab.exists(ab.paths.workflow.lock)) {
            ctx.ui.notify(`Workflow lock detected: ${readLockSummary()}`, "warning");
        }
    });
}
async function executePipeline(opts) {
    const { pipeline, zone, objective, ctx, onCheckpoint, startIndex, resumed, onEvent, onTelemetry } = opts;
    const existing = ab.readWorkflowState();
    ab.writeWorkflowState({
        ...existing,
        status: "running",
        currentObjective: objective,
        currentStep: startIndex,
        totalSteps: pipeline.steps.length,
        zone,
        startedAt: existing.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    if (resumed) {
        const msg = `↻ Resuming pipeline from step ${startIndex + 1}/${pipeline.steps.length}. Current step will be re-executed.`;
        ctx.ui.notify(msg, "warning");
        onEvent(msg);
    }
    else {
        const msg = `🚀 Starting pipeline — ${pipeline.steps.length} steps for zone "${zone}"`;
        ctx.ui.notify(msg, "info");
        onEvent(msg);
    }
    let activeDDRPath = existing.activeDDRPath;
    for (let i = startIndex; i < pipeline.steps.length; i += 1) {
        const step = pipeline.steps[i];
        ab.writeWorkflowState({
            ...ab.readWorkflowState(),
            status: "running",
            currentStep: i + 1,
            currentRole: step.role,
            pendingCheckpoint: undefined,
            activeDDRPath,
        });
        onEvent(`Step ${i + 1}/${pipeline.steps.length}: ${step.role}`);
        if (step.role === "act" && step.mode !== "characterization") {
            const n = ab.nextDDRNumber() - 1;
            activeDDRPath = ab.paths.decisions.ddr(n);
            step.allowedPaths = extractAuthorizedPathsFromDDR(activeDDRPath);
            onEvent(`Act authorized scope loaded from ${activeDDRPath} (${step.allowedPaths.length} paths)`);
        }
        try {
            await (0, agent_runner_1.runStep)({
                step,
                activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
                onCheckpoint,
                onProgress: (msg) => {
                    onEvent(msg);
                },
                onTelemetry,
            });
            ab.writeWorkflowState({
                ...ab.readWorkflowState(),
                status: "running",
                currentStep: i + 1,
                currentRole: step.role,
                lastCompletedStep: i + 1,
                pendingCheckpoint: undefined,
                activeDDRPath,
            });
        }
        catch (err) {
            const message = `❌ Step ${step.role} failed: ${String(err)}`;
            ctx.ui.notify(message, "error");
            onEvent(message);
            ab.writeWorkflowState({
                ...ab.readWorkflowState(),
                status: "failed",
                currentStep: i + 1,
                currentRole: step.role,
                activeDDRPath,
            });
            return;
        }
    }
    if (activeDDRPath) {
        (0, post_cycle_1.postCycleUpdate)(zone, activeDDRPath);
        onEvent(`Post-cycle update applied for zone=${zone}`);
    }
    ab.writeWorkflowState({
        status: "idle",
        updatedAt: new Date().toISOString(),
    });
    const done = `✅ Pipeline complete for "${objective}"`;
    ctx.ui.notify(done, "info");
    onEvent(done);
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
function summarizeArtifact(artifactPath, content) {
    const lines = content.split("\n");
    const headings = lines
        .map((l) => l.trim())
        .filter((l) => l.startsWith("#"))
        .slice(0, 3)
        .map((h) => `- ${h}`);
    const summaryLines = [
        `- Path: \`${artifactPath}\``,
        `- Size: ${content.length} chars, ${lines.length} lines`,
        headings.length > 0 ? "- Headings:" : "- Headings: (none)",
        ...headings,
    ];
    return summaryLines.join("\n");
}
function buildRecoveryHint(state) {
    if (state.status === "waiting-checkpoint") {
        return "Recovery available: workflow is waiting-checkpoint. Use /arch:resume to recreate the step/checkpoint, or /arch:abort to reset.";
    }
    if (state.status === "running") {
        return "Recovery available: workflow is running/interrupted. Use /arch:resume to continue from current step, or /arch:abort to reset.";
    }
    if (state.status === "failed") {
        return "Recovery available: workflow is failed. Use /arch:resume to retry current step, or /arch:abort to reset.";
    }
    return "Recovery available: use /arch:resume or /arch:abort.";
}
function readLockSummary() {
    if (!ab.exists(ab.paths.workflow.lock))
        return "none";
    const raw = ab.readIfExists(ab.paths.workflow.lock);
    try {
        const parsed = JSON.parse(raw);
        return `${parsed.command ?? "?"} by ${parsed.owner ?? "unknown"} @ ${parsed.startedAt ?? "?"}`;
    }
    catch {
        return "present (unparseable)";
    }
}
function iconForStatus(status) {
    if (status === "running")
        return "▶";
    if (status === "waiting-checkpoint")
        return "⏸";
    if (status === "failed")
        return "✖";
    if (status === "completed")
        return "✓";
    return "○";
}
function truncate(value, max) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max - 1)}…`;
}
function toWidgetLines(text, maxLines) {
    const lines = text.split("\n");
    if (lines.length <= maxLines)
        return lines;
    return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines truncated)`];
}
