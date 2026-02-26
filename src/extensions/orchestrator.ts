import * as fs from "node:fs";

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Box, Spacer, Text, truncateToWidth } from "@mariozechner/pi-tui";

import * as ab from "../orchestrator/archbase";
import { runStep, type StepTelemetry } from "../orchestrator/agent-runner";
import { configurePipeline } from "../orchestrator/pipeline";
import { postCycleUpdate } from "../orchestrator/post-cycle";
import { parseDdrMeta } from "../orchestrator/artifact-meta";
import { setDdrStatus, upsertDdrIndex } from "../orchestrator/ddr-index";
import { DirectorInterface, type DirectorAction } from "../orchestrator/director-interface";
import type { CheckpointDecision, Pipeline, WorkflowState } from "../types";

type RuntimeViewMode = "compact" | "expanded";

type UiVisibility = {
  visible: boolean;
  showLogs: boolean;
  showStatus: boolean;
};

interface CheckpointView {
  label: string;
  artifactPath: string;
  summary: string;
  artifactPreview: string[];
}

interface SubagentRuntime {
  active: boolean;
  role?: string;
  model?: string;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
}

interface RuntimeState {
  // Master enable switch for ArchAgent UI/shortcuts/status
  archEnabled: boolean;
  // Director conversation mode (intercepts normal input)
  directorEnabled: boolean;

  viewMode: RuntimeViewMode;
  logsExpanded: boolean;
  ui: UiVisibility;

  recentEvents: string[];
  lastEvent?: string;

  checkpointView?: CheckpointView;
  subagent: SubagentRuntime;

  // UI animation
  spinnerIndex: number;
}

const runtime: RuntimeState = {
  archEnabled: false,
  directorEnabled: false,

  viewMode: "compact",
  logsExpanded: false,
  ui: {
    visible: false,
    showLogs: true,
    showStatus: true,
  },

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

  spinnerIndex: 0,
};

const MAX_RECENT_EVENTS = 30;
const SUMMARY_LOG_LINES = 6;

export default function archagentOrchestrator(pi: ExtensionAPI): void {
  const director = new DirectorInterface();
  let pendingCheckpointResolve: ((d: CheckpointDecision) => void) | null = null;

  let lastUiCtx: ExtensionContext | null = null;
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

  // Opt-in activation.
  // - Default: ArchAgent stays dormant (Pi behaves normally)
  // - Enable: run /arch:director, or set ARCHAGENT=1, or (if Pi allows) pass --arch
  const autoEnable = process.env.ARCHAGENT === "1" || process.argv.includes("--arch");
  if (autoEnable) {
    runtime.archEnabled = true;
    runtime.directorEnabled = true;
    runtime.ui.visible = true;
  }

  // Custom message renderers (nicer labels)
  pi.registerMessageRenderer("archagent-director", (message, _options, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("Arch Director")), 0, 0));
    box.addChild(new Spacer(1));
    box.addChild(new Text(theme.fg("customMessageText", extractCustomMessageText(message.content)), 0, 0));
    return box;
  });

  pi.registerMessageRenderer("archagent-director-user", (message, _options, theme) => {
    const box = new Box(1, 1, (t) => theme.bg("userMessageBg", t));
    box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("User")), 0, 0));
    box.addChild(new Spacer(1));
    box.addChild(new Text(theme.fg("customMessageText", extractCustomMessageText(message.content)), 0, 0));
    return box;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // State + logging
  // ────────────────────────────────────────────────────────────────────────────

  function recordEvent(message: string, ctx?: ExtensionContext): void {
    runtime.lastEvent = message;
    runtime.recentEvents.push(message);
    if (runtime.recentEvents.length > MAX_RECENT_EVENTS) {
      runtime.recentEvents.splice(0, runtime.recentEvents.length - MAX_RECENT_EVENTS);
    }
    if (ctx) refreshUi(ctx);
  }

  function recordSubagentLog(message: string, ctx?: ExtensionContext): void {
    tickSpinner();
    const line = `[${new Date().toISOString()}] ${message}`;
    const existing = ab.readIfExists(ab.paths.workflow.runLogCurrent);
    ab.write(ab.paths.workflow.runLogCurrent, `${existing}${existing ? "\n" : ""}${line}`);
    if (ctx) refreshUi(ctx);
  }

  function formatTokens(n: number): string {
    if (n < 1000) return `${n}`;
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1000000) return `${Math.round(n / 1000)}k`;
    return `${(n / 1000000).toFixed(1)}M`;
  }

  function resetSubagent(): void {
    runtime.subagent.active = false;
    runtime.subagent.role = undefined;
    runtime.subagent.model = undefined;
    runtime.subagent.turns = 0;
    runtime.subagent.input = 0;
    runtime.subagent.output = 0;
    runtime.subagent.cacheRead = 0;
    runtime.subagent.cacheWrite = 0;
    runtime.subagent.cost = 0;
    runtime.subagent.contextTokens = 0;
  }

  function tickSpinner(): void {
    if (!runtime.subagent.active) return;
    runtime.spinnerIndex = (runtime.spinnerIndex + 1) % SPINNER_FRAMES.length;
  }

  function applyTelemetry(data: StepTelemetry): void {
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
    if (data.phase === "end") runtime.subagent.active = false;

    tickSpinner();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────────────────────────────────

  function getLogLines(full: boolean): string[] {
    const log = ab.readIfExists(ab.paths.workflow.runLogCurrent);
    const logLines = log.trim() ? log.split("\n") : ["(no log entries yet)"];
    if (full) return logLines.slice(-500);
    return logLines.slice(-SUMMARY_LOG_LINES);
  }

  function buildFooterStatus(state: WorkflowState, ctx: ExtensionContext): string {
    const statusIcon = iconForStatus(state.status);
    const role = state.currentRole ?? "-";

    const usage = ctx.getContextUsage();
    const mainCtx =
      usage?.tokens != null && usage.percent != null
        ? `main:${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)} (${usage.percent.toFixed(0)}%)`
        : "main:—";

    const s = runtime.subagent;
    const subPart = s.active
      ? `sub:${s.role ?? "-"} t:${s.turns} ctx:${formatTokens(s.contextTokens)} $${s.cost.toFixed(3)}`
      : "sub:idle";

    // Keep it short: the built-in footer already shows model/git/etc.
    const mode = runtime.directorEnabled ? "dir:on" : runtime.archEnabled ? "arch:on" : "arch:off";

    return `${statusIcon} ArchAgent ${state.status} • ${role} • ${subPart} • ${mainCtx} • ${mode}`;
  }

  function refreshUi(ctx: ExtensionContext): void {
    lastUiCtx = ctx;

    const state = ab.readWorkflowState();

    // Add extra info to Pi's built-in footer via setStatus().
    // Do NOT overwrite the native footer with ctx.ui.setFooter().
    if (runtime.archEnabled || state.status !== "idle") {
      ctx.ui.setStatus("archagent", buildFooterStatus(state, ctx));
    } else {
      ctx.ui.setStatus("archagent", undefined);
    }

    if (!ctx.hasUI) return;

    if (!runtime.ui.visible) {
      ctx.ui.setWidget("archagent-logs", undefined);
      ctx.ui.setWidget("archagent-status", undefined);
      return;
    }

    if (runtime.ui.showLogs) {
      renderLogsWidget(ctx, state);
    } else {
      ctx.ui.setWidget("archagent-logs", undefined);
    }

    if (runtime.ui.showStatus) {
      renderStatusWidget(ctx, state);
    } else {
      ctx.ui.setWidget("archagent-status", undefined);
    }
  }

  function renderLogsWidget(ctx: ExtensionContext, state: WorkflowState): void {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(
      "archagent-logs",
      (_tui, theme) => {
        const box = new Box(1, 1, (t) => theme.bg("toolPendingBg", t));

        // Checkpoint panel takes precedence
        if (state.status === "waiting-checkpoint" && runtime.checkpointView) {
          const cp = runtime.checkpointView;
          const title = theme.fg("warning", theme.bold(`⏸ CHECKPOINT | ${cp.label}`));
          const help = theme.fg(
            "dim",
            `Shortcuts: ${theme.fg("success", "Alt+Y")} approve • ${theme.fg("error", "Alt+N")} reject • ${theme.fg("warning", "Alt+M")} more-analysis`,
          );

          const body = [
            `${theme.fg("dim", "Artifact:")} ${theme.fg("warning", cp.artifactPath)}`,
            "",
            theme.fg("accent", theme.bold("Summary")),
            ...cp.summary.split("\n").map((l) => theme.fg("dim", l)),
            "",
            theme.fg("accent", theme.bold("Artifact preview")),
            ...cp.artifactPreview.map((l) => theme.fg("dim", truncate(l, runtime.viewMode === "compact" ? 180 : 260))),
          ];

          box.addChild(new Text(`${title}\n${help}\n${theme.fg("dim", "────────────────────────────────────────────────────────")}\n${body.join("\n")}`, 0, 0));
          return box;
        }

        const title = theme.fg(
          runtime.logsExpanded ? "warning" : "accent",
          theme.bold("SUB-AGENT LOGS"),
        );
        const subtitle = theme.fg(
          "dim",
          `${runtime.logsExpanded ? "FULL" : "SUMMARY"} • toggle full: Alt+O • hide logs: Alt+L • hide status: Alt+S`,
        );

        const raw = getLogLines(runtime.logsExpanded);
        const rendered = raw.map((l) => formatLogLine(l, theme, runtime.logsExpanded, runtime.viewMode));

        if (runtime.subagent.active) {
          const spin = theme.fg("accent", SPINNER_FRAMES[runtime.spinnerIndex]);
          rendered.push(theme.fg("dim", `${spin} Waiting...`));
        }

        // In FULL mode we do not truncate; Text will wrap by terminal width.
        // In SUMMARY we pre-truncate for readability.
        box.addChild(new Text(`${title}\n${subtitle}\n${theme.fg("dim", "────────────────────────────────────────────────────────")}\n${rendered.join("\n")}`, 0, 0));
        return box;
      },
      { placement: "aboveEditor" },
    );
  }

  function renderStatusWidget(ctx: ExtensionContext, state: WorkflowState): void {
    if (!ctx.hasUI) return;

    const statusIcon = iconForStatus(state.status);
    const role = state.currentRole ?? "-";

    const progress =
      state.currentStep && state.totalSteps
        ? `${state.currentStep}/${state.totalSteps} (done: ${state.lastCompletedStep ?? 0})`
        : "-";

    ctx.ui.setWidget(
      "archagent-status",
      (_tui, theme) => {
        const box = new Box(1, 1, (t) => theme.bg("userMessageBg", t));

        const statusTone = state.status === "failed" ? "error" : state.status === "waiting-checkpoint" ? "warning" : state.status === "completed" ? "success" : "accent";

        const row = (icon: string, tone: string, label: string, value: string) => {
          const iconPart = theme.fg(tone as any, icon);
          const labelPart = theme.fg("dim", label);
          const valuePart = theme.fg("customMessageText", value);
          return `${iconPart} ${labelPart} ${valuePart}`;
        };

        // Headline uses the same icon style as logs: colored icon, normal text.
        const headline = `${theme.fg(statusTone as any, statusIcon)} ${theme.bold("ArchAgent")} ${theme.fg("customMessageText", `${state.status} • ${role} • ${progress}`)}`;

        const s = runtime.subagent;
        const sub = s.active
          ? `sub:${s.role ?? "-"} t:${s.turns} ↑${formatTokens(s.input)} ↓${formatTokens(s.output)} ctx:${formatTokens(s.contextTokens)} $${s.cost.toFixed(3)}`
          : "sub:idle";

        const rows: string[] = [
          headline,
          row("→", "accent", "Zone:", state.zone ?? "-"),
          row("→", "accent", "Objective:", truncate(state.currentObjective ?? "-", runtime.viewMode === "compact" ? 90 : 140)),
          row("→", "accent", "Lock:", readLockSummary()),
          row(s.active ? "▶" : "○", s.active ? "accent" : "dim", "Sub-agent:", sub),
          row("→", "accent", "Last:", truncate(runtime.lastEvent ?? "-", runtime.viewMode === "compact" ? 90 : 140)),
          runtime.viewMode === "expanded"
            ? theme.fg(
                "dim",
                `Recent: ${runtime.recentEvents.slice(-3).map((e) => truncate(e, 60)).join(" | ") || "-"}`,
              )
            : "",
          theme.fg(
            "dim",
            `UI: Alt+U toggle • Alt+L logs • Alt+S status • Alt+V view • Alt+O full logs`,
          ),
        ].filter(Boolean);

        box.addChild(new Text(rows.join("\n"), 0, 0));
        return box;
      },
      { placement: "belowEditor" },
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Locking
  // ────────────────────────────────────────────────────────────────────────────

  function tryAcquireWorkflowLock(command: string, ctx: ExtensionContext): string | null {
    const lockPath = ab.paths.workflow.lock;
    if (ab.exists(lockPath)) {
      const lockRaw = ab.readIfExists(lockPath);
      let owner = "unknown";
      try {
        const parsed = JSON.parse(lockRaw) as { owner?: string; command?: string; startedAt?: string };
        owner = `${parsed.owner ?? "unknown"} (${parsed.command ?? "?"} @ ${parsed.startedAt ?? "?"})`;
      } catch {
        owner = lockRaw || "unknown";
      }

      ctx.ui.notify(`Another workflow is active (lock held by ${owner}).`, "warning");
      return null;
    }

    const owner = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ab.write(
      lockPath,
      JSON.stringify(
        {
          owner,
          pid: process.pid,
          command,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    recordEvent(`Lock acquired by ${owner} for ${command}`, ctx);
    return owner;
  }

  function releaseWorkflowLock(owner: string | null, ctx?: ExtensionContext): void {
    if (!owner) return;
    const lockPath = ab.paths.workflow.lock;
    if (!ab.exists(lockPath)) return;

    const lockRaw = ab.readIfExists(lockPath);
    try {
      const parsed = JSON.parse(lockRaw) as { owner?: string };
      if (parsed.owner !== owner) return;
    } catch {
      return;
    }

    fs.unlinkSync(lockPath);
    recordEvent(`Lock released by ${owner}`, ctx);
  }

  function forceReleaseWorkflowLock(ctx?: ExtensionContext): void {
    const lockPath = ab.paths.workflow.lock;
    if (!ab.exists(lockPath)) return;
    fs.unlinkSync(lockPath);
    recordEvent("Lock force-released", ctx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Checkpoints
  // ────────────────────────────────────────────────────────────────────────────

  function resolveCheckpoint(decision: CheckpointDecision, ctx?: ExtensionContext): boolean {
    if (!pendingCheckpointResolve) return false;
    pendingCheckpointResolve(decision);
    pendingCheckpointResolve = null;
    runtime.checkpointView = undefined;
    if (ctx) refreshUi(ctx);
    return true;
  }

  function makeCheckpointHandler(ctx: ExtensionContext) {
    return async (label: string, artifactPath: string): Promise<CheckpointDecision> => {
      const content = ab.readIfExists(artifactPath);
      const summary = summarizeArtifact(artifactPath, content);

      runtime.checkpointView = {
        label,
        artifactPath,
        summary,
        artifactPreview: toWidgetLines(content || "(empty file)", 120),
      };

      recordEvent(`Checkpoint opened: ${label} (${artifactPath})`, ctx);
      ctx.ui.notify(`⏸  CHECKPOINT: ${label}`, "info");

      ab.writeWorkflowState({
        ...ab.readWorkflowState(),
        status: "waiting-checkpoint",
        pendingCheckpoint: { label, artifactPath },
      });
      refreshUi(ctx);

      return new Promise<CheckpointDecision>((resolve) => {
        pendingCheckpointResolve = resolve;
      });
    };
  }

  async function shortcutReject(ctx: ExtensionContext): Promise<void> {
    const comment = await ctx.ui.input("Reject checkpoint", "Explain what needs to change");
    if (!comment?.trim()) return;
    if (!resolveCheckpoint({ type: "rejected", comment: comment.trim() }, ctx)) {
      ctx.ui.notify("No pending checkpoint", "warning");
      return;
    }
    recordEvent(`Checkpoint rejected: ${truncate(comment, 120)}`, ctx);
  }

  async function shortcutMoreAnalysis(ctx: ExtensionContext): Promise<void> {
    const request = await ctx.ui.input("More analysis", "What do you want to clarify? ");
    if (!request?.trim()) return;
    if (!resolveCheckpoint({ type: "more-analysis", request: request.trim() }, ctx)) {
      ctx.ui.notify("No pending checkpoint", "warning");
      return;
    }
    recordEvent(`More analysis requested: ${truncate(request, 120)}`, ctx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pipeline execution helpers
  // ────────────────────────────────────────────────────────────────────────────

  function runDetached(ctx: ExtensionContext, label: string, fn: () => Promise<void>): void {
    recordEvent(`${label} queued`, ctx);
    ctx.ui.notify(`${label} started in background.`, "info");
    void (async () => {
      try {
        await fn();
      } catch (err) {
        recordEvent(`${label} crashed: ${String(err)}`, ctx);
        ctx.ui.notify(`${label} crashed: ${String(err)}`, "error");
      }
    })();
  }

  async function executePipeline(opts: {
    pipeline: Pipeline;
    zone: string;
    objective: string;
    ctx: ExtensionContext;
    startIndex: number;
    resumed: boolean;
  }): Promise<void> {
    const { pipeline, zone, objective, ctx, startIndex, resumed } = opts;

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
      recordSubagentLog(`↻ Resuming pipeline from step ${startIndex + 1}/${pipeline.steps.length}`, ctx);
    } else {
      recordSubagentLog(`🚀 Starting pipeline — ${pipeline.steps.length} steps for zone "${zone}"`, ctx);
    }

    let activeDDRPath: string | undefined = existing.activeDDRPath;

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

      recordSubagentLog(`Step ${i + 1}/${pipeline.steps.length}: ${step.role} (${step.mode})`, ctx);

      if (step.role === "act" && step.mode !== "characterization") {
        // Find last DDR written.
        activeDDRPath = ab.findLatestDDRPath() ?? ab.paths.decisions.ddr(ab.nextDDRNumber() - 1);

        const ddrContent = ab.readIfExists(activeDDRPath);
        const meta = parseDdrMeta(ddrContent);
        step.allowedPaths = meta?.authorizedPaths ?? extractAuthorizedPathsFallback(ddrContent);
        recordSubagentLog(
          `Act scope loaded from ${activeDDRPath} (${step.allowedPaths.length} paths)`,
          ctx,
        );
      }

      try {
        await runStep({
          step,
          activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
          onCheckpoint: makeCheckpointHandler(ctx),
          onProgress: (msg) => recordSubagentLog(msg, ctx),
          onTelemetry: (data) => {
            applyTelemetry(data);
            refreshUi(ctx);
          },
        });

        // After Decide completes, the DDR has been approved at its checkpoint.
        // Mark it as APPROVED and ensure it is indexed.
        if (step.role === "decide") {
          const ddrPath = ab.findLatestDDRPath() ?? ab.paths.decisions.ddr(ab.nextDDRNumber() - 1);
          activeDDRPath = ddrPath;
          setDdrStatus(ddrPath, "APPROVED");
          upsertDdrIndex(ddrPath);
          recordSubagentLog(`DDR approved: ${ddrPath}`, ctx);
        }

        ab.writeWorkflowState({
          ...ab.readWorkflowState(),
          status: "running",
          currentStep: i + 1,
          currentRole: step.role,
          lastCompletedStep: i + 1,
          pendingCheckpoint: undefined,
          activeDDRPath,
        });
      } catch (err) {
        const message = `❌ Step ${step.role} failed: ${String(err)}`;
        ctx.ui.notify(message, "error");
        recordSubagentLog(message, ctx);
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

    // Deterministic post-cycle updates (health map, debt, index)
    postCycleUpdate(zone, activeDDRPath);
    recordSubagentLog(`Post-cycle update applied for zone=${zone}`, ctx);

    ab.writeWorkflowState({
      status: "idle",
      updatedAt: new Date().toISOString(),
    });

    ctx.ui.notify(`✅ Pipeline complete for "${objective}"`, "info");
    recordEvent(`Pipeline complete: ${objective}`, ctx);
    refreshUi(ctx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Actions
  // ────────────────────────────────────────────────────────────────────────────

  function enableArchUi(ctx: ExtensionContext): void {
    runtime.archEnabled = true;
    if (!runtime.ui.visible) runtime.ui.visible = true;
    refreshUi(ctx);
  }

  function actionInit(ctx: ExtensionContext): void {
    enableArchUi(ctx);
    runDetached(ctx, "arch:init", async () => {
      const lockOwner = tryAcquireWorkflowLock("arch:init", ctx);
      if (!lockOwner) return;

      try {
        const current = ab.readWorkflowState();
        if (current.status !== "idle") {
          ctx.ui.notify(`Workflow is ${current.status}.`, "warning");
          return;
        }

        const wasInitialized = ab.isInitialized();
        const repoName = process.cwd().split("/").pop() ?? "unknown";
        ab.init(repoName);

        ctx.ui.notify(
          wasInitialized
            ? "archbase/ already exists. Missing files were created without overriding existing ones."
            : "✓ archbase/ initialized (non-destructive).",
          "info",
        );

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
        refreshUi(ctx);

        await runStep({
          step: {
            role: "understand",
            mode: "deep",
            zone: ".",
            objective:
              "Bootstrap archbase in-depth. Perform a deep architectural analysis of the entire repository. " +
              "Write/update ARCH.md and zone-level analysis in archbase/. Include forensics artifacts (ARCHAEOLOGY.md and INTENT.md) when uncertainty or legacy signals exist.",
            requiresCheckpoint: true,
            checkpointLabel: "Review bootstrap deep analysis (ARCH/forensics)",
          },
          onCheckpoint: makeCheckpointHandler(ctx),
          onProgress: (msg) => recordSubagentLog(`bootstrap: ${msg}`, ctx),
          onTelemetry: (data) => {
            applyTelemetry(data);
            refreshUi(ctx);
          },
        });

        ab.writeWorkflowState({ status: "idle", updatedAt: new Date().toISOString() });
        recordEvent("Bootstrap analysis completed", ctx);
      } catch (err) {
        ab.writeWorkflowState({ ...ab.readWorkflowState(), status: "failed" });
        recordEvent(`Bootstrap failed: ${String(err)}`, ctx);
        ctx.ui.notify(`❌ Bootstrap analysis failed: ${String(err)}`, "error");
      } finally {
        releaseWorkflowLock(lockOwner, ctx);
      }
    });
  }

  function actionTask(zone: string, objective: string, ctx: ExtensionContext): void {
    enableArchUi(ctx);
    runDetached(ctx, "arch:task", async () => {
      if (!ab.isInitialized()) {
        const repoName = process.cwd().split("/").pop() ?? "unknown";
        ab.init(repoName);
        ctx.ui.notify("archbase/ initialized (non-destructive)", "info");
      }

      const lockOwner = tryAcquireWorkflowLock("arch:task", ctx);
      if (!lockOwner) return;

      try {
        const existing = ab.readWorkflowState();
        if (existing.status !== "idle") {
          ctx.ui.notify(`Workflow is ${existing.status}.`, "warning");
          return;
        }

        recordEvent(`Task requested: zone=${zone} objective=${objective}`, ctx);

        const pipeline = configurePipeline(zone, objective);
        await executePipeline({ pipeline, zone, objective, ctx, startIndex: 0, resumed: false });
      } finally {
        releaseWorkflowLock(lockOwner, ctx);
      }
    });
  }

  function actionResume(ctx: ExtensionContext): void {
    enableArchUi(ctx);
    runDetached(ctx, "arch:resume", async () => {
      if (!ab.isInitialized()) {
        const repoName = process.cwd().split("/").pop() ?? "unknown";
        ab.init(repoName);
        ctx.ui.notify("archbase/ initialized (non-destructive)", "info");
      }

      const lockOwner = tryAcquireWorkflowLock("arch:resume", ctx);
      if (!lockOwner) return;

      try {
        const state = ab.readWorkflowState();
        if (state.status === "idle") {
          ctx.ui.notify("No interrupted workflow to resume", "info");
          return;
        }
        if (!state.zone || !state.currentObjective) {
          ctx.ui.notify("Cannot resume: missing zone/objective", "error");
          return;
        }

        const pipeline = configurePipeline(state.zone, state.currentObjective);
        const stepNumber = state.currentStep ?? (state.lastCompletedStep ? state.lastCompletedStep + 1 : 1);
        const startIndex = Math.max(stepNumber - 1, 0);

        await executePipeline({
          pipeline,
          zone: state.zone,
          objective: state.currentObjective,
          ctx,
          startIndex,
          resumed: true,
        });
      } finally {
        releaseWorkflowLock(lockOwner, ctx);
      }
    });
  }

  function actionAbort(ctx: ExtensionContext): void {
    pendingCheckpointResolve = null;
    runtime.checkpointView = undefined;
    resetSubagent();

    ab.writeWorkflowState({ status: "idle", updatedAt: new Date().toISOString() });
    forceReleaseWorkflowLock(ctx);
    recordEvent("Workflow aborted", ctx);
    ctx.ui.notify("Workflow aborted and reset to idle", "warning");
    refreshUi(ctx);
  }

  function actionReview(zone: string, ctx: ExtensionContext): void {
    enableArchUi(ctx);
    runDetached(ctx, "arch:review", async () => {
      if (!ab.isInitialized()) {
        const repoName = process.cwd().split("/").pop() ?? "unknown";
        ab.init(repoName);
        ctx.ui.notify("archbase/ initialized (non-destructive)", "info");
      }

      const lockOwner = tryAcquireWorkflowLock("arch:review", ctx);
      if (!lockOwner) return;

      try {
        recordEvent(`Standalone review started for zone=${zone}`, ctx);
        refreshUi(ctx);

        await runStep({
          step: {
            role: "verify",
            mode: "standard",
            zone,
            objective: `Standalone architecture review of zone \"${zone}\"`,
            requiresCheckpoint: true,
            checkpointLabel: "Review Audit Report",
          },
          onCheckpoint: makeCheckpointHandler(ctx),
          onProgress: (msg) => recordSubagentLog(`review: ${msg}`, ctx),
          onTelemetry: (data) => {
            applyTelemetry(data);
            refreshUi(ctx);
          },
        });

        postCycleUpdate(zone);
        recordSubagentLog(`Post-cycle update applied for zone=${zone} (standalone review)`, ctx);
        recordEvent("Standalone review completed", ctx);
      } finally {
        releaseWorkflowLock(lockOwner, ctx);
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Director conversation: intercept normal input (no commands)
  // ────────────────────────────────────────────────────────────────────────────

  pi.on("input", async (event, ctx) => {
    // Let slash commands pass through.
    if (event.text.trim().startsWith("/")) return { action: "continue" };

    // Director mode is opt-in. When disabled, Pi behaves normally.
    if (!runtime.directorEnabled) return { action: "continue" };

    // Show the Director prompt in history, then the director reply.
    pi.sendMessage({
      customType: "archagent-director-user",
      content: event.text,
      display: true,
    });

    try {
      const response = await director.interpret(event.text, ctx);
      sendDirectorMessage(pi, response.reply);
      await executeDirectorAction(response.action, ctx);
    } catch (err) {
      ctx.ui.notify(`Director interface error: ${String(err)}`, "error");
    }

    refreshUi(ctx);
    return { action: "handled" };
  });

  async function executeDirectorAction(action: DirectorAction, ctx: ExtensionContext): Promise<void> {
    switch (action.type) {
      case "help":
        sendDirectorMessage(
          pi,
          "You can describe what you want (e.g. 'Add OAuth to src/auth'). I will run the pipeline and present checkpoints. Shortcuts: Alt+U (UI), Alt+L (logs), Alt+O (full logs).",
        );
        return;
      case "none":
        return;
      case "init":
        actionInit(ctx);
        return;
      case "task":
        actionTask(action.zone, action.objective, ctx);
        return;
      case "review":
        actionReview(action.zone, ctx);
        return;
      case "status":
        ctx.ui.notify(
          `Workflow: ${ab.readWorkflowState().status} | Agent: ${ab.readWorkflowState().currentRole ?? "-"}`,
          "info",
        );
        return;
      case "resume":
        actionResume(ctx);
        return;
      case "abort":
        actionAbort(ctx);
        return;
      case "approve":
        if (!resolveCheckpoint({ type: "approved" }, ctx)) ctx.ui.notify("No pending checkpoint", "warning");
        return;
      case "reject":
        if (!action.comment?.trim()) {
          await shortcutReject(ctx);
          return;
        }
        if (!resolveCheckpoint({ type: "rejected", comment: action.comment.trim() }, ctx)) {
          ctx.ui.notify("No pending checkpoint", "warning");
        }
        return;
      case "more-analysis":
        if (!action.request?.trim()) {
          await shortcutMoreAnalysis(ctx);
          return;
        }
        if (!resolveCheckpoint({ type: "more-analysis", request: action.request.trim() }, ctx)) {
          ctx.ui.notify("No pending checkpoint", "warning");
        }
        return;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Commands (fallback / scripting surface)
  // ────────────────────────────────────────────────────────────────────────────

  pi.registerCommand("arch:director", {
    description: "Enable/disable ArchAgent Director (conversational) mode",
    handler: async (args, ctx) => {
      const a = args.trim().toLowerCase();
      const enable = a ? a === "on" || a === "enable" || a === "1" || a === "true" : !runtime.directorEnabled;

      runtime.archEnabled = enable;
      runtime.directorEnabled = enable;
      runtime.ui.visible = enable;

      ctx.ui.notify(enable ? "ArchAgent Director enabled" : "ArchAgent Director disabled", "info");
      refreshUi(ctx);
    },
  });

  pi.registerCommand("arch:init", {
    description: "Initialize archbase/ (non-destructive) and run deep bootstrap analysis",
    handler: async (_args, ctx) => actionInit(ctx),
  });

  pi.registerCommand("arch:task", {
    description: "Launch full agent pipeline. Usage: /arch:task <zone> | <objective>",
    handler: async (args, ctx) => {
      const [zone, ...objectiveParts] = args.split("|");
      const objective = objectiveParts.join("|").trim();
      if (!zone?.trim() || !objective) {
        ctx.ui.notify("Usage: /arch:task <zone> | <objective>", "error");
        return;
      }
      actionTask(zone.trim(), objective, ctx);
    },
  });

  pi.registerCommand("arch:review", {
    description: "Run standalone Verify audit on a zone",
    handler: async (args, ctx) => actionReview(args.trim() || ".", ctx),
  });

  pi.registerCommand("arch:resume", {
    description: "Resume interrupted workflow from current step",
    handler: async (_args, ctx) => actionResume(ctx),
  });

  pi.registerCommand("arch:abort", {
    description: "Abort current workflow and reset to idle",
    handler: async (_args, ctx) => actionAbort(ctx),
  });

  // Legacy aliases (older docs / muscle memory)
  pi.registerCommand("arch:logs-mode", {
    description: "Legacy alias. Use Alt+O to toggle full logs.",
    handler: async (_args, ctx) => {
      runtime.logsExpanded = !runtime.logsExpanded;
      refreshUi(ctx);
    },
  });

  pi.registerCommand("arch:view", {
    description: "Legacy alias. Use Alt+V to toggle view density.",
    handler: async (_args, ctx) => {
      runtime.viewMode = runtime.viewMode === "compact" ? "expanded" : "compact";
      refreshUi(ctx);
    },
  });

  pi.registerCommand("arch:status", {
    description: "Show workflow state summary",
    handler: async (_args, ctx) => {
      const s = ab.readWorkflowState();
      ctx.ui.notify(
        `Workflow: ${s.status} | Role: ${s.currentRole ?? "-"} | Zone: ${s.zone ?? "-"} | Objective: ${truncate(s.currentObjective ?? "-", 80)}`,
        "info",
      );
      refreshUi(ctx);
    },
  });

  pi.registerCommand("arch:approve", {
    description: "Approve pending checkpoint",
    handler: async (_args, ctx) => {
      if (!resolveCheckpoint({ type: "approved" }, ctx)) ctx.ui.notify("No pending checkpoint", "warning");
    },
  });

  pi.registerCommand("arch:reject", {
    description: "Reject pending checkpoint. Usage: /arch:reject <comment>",
    handler: async (args, ctx) => {
      const comment = args.trim();
      if (!comment) {
        await shortcutReject(ctx);
        return;
      }
      if (!resolveCheckpoint({ type: "rejected", comment }, ctx)) ctx.ui.notify("No pending checkpoint", "warning");
    },
  });

  pi.registerCommand("arch:more-analysis", {
    description: "Request more analysis at checkpoint. Usage: /arch:more-analysis <request>",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request) {
        await shortcutMoreAnalysis(ctx);
        return;
      }
      if (!resolveCheckpoint({ type: "more-analysis", request }, ctx)) ctx.ui.notify("No pending checkpoint", "warning");
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Shortcuts (primary UX)
  // ────────────────────────────────────────────────────────────────────────────

  // IMPORTANT: many terminals do not distinguish Ctrl+Shift+<letter> from Ctrl+<letter>.
  // Use Alt-based shortcuts for reliability.

  function requireArchEnabled(ctx: ExtensionContext): boolean {
    if (runtime.archEnabled) return true;
    ctx.ui.notify("ArchAgent is disabled. Run /arch:director to enable.", "info");
    return false;
  }

  pi.registerShortcut("alt+u", {
    description: "Toggle ArchAgent UI panels",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      runtime.ui.visible = !runtime.ui.visible;
      refreshUi(ctx);
    },
  });

  pi.registerShortcut("alt+l", {
    description: "Toggle logs panel visibility",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      runtime.ui.showLogs = !runtime.ui.showLogs;
      refreshUi(ctx);
    },
  });

  pi.registerShortcut("alt+s", {
    description: "Toggle status panel visibility",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      runtime.ui.showStatus = !runtime.ui.showStatus;
      refreshUi(ctx);
    },
  });

  pi.registerShortcut("alt+o", {
    description: "Toggle full logs (summary/full)",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      runtime.logsExpanded = !runtime.logsExpanded;
      refreshUi(ctx);
    },
  });

  pi.registerShortcut("alt+v", {
    description: "Toggle view density (compact/expanded)",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      runtime.viewMode = runtime.viewMode === "compact" ? "expanded" : "compact";
      refreshUi(ctx);
    },
  });

  pi.registerShortcut("alt+y", {
    description: "Approve checkpoint (if any)",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      if (!resolveCheckpoint({ type: "approved" }, ctx)) ctx.ui.notify("No pending checkpoint", "warning");
    },
  });

  pi.registerShortcut("alt+n", {
    description: "Reject checkpoint (prompt for feedback)",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      await shortcutReject(ctx);
    },
  });

  pi.registerShortcut("alt+m", {
    description: "Request more analysis (prompt)",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      await shortcutMoreAnalysis(ctx);
    },
  });

  pi.registerShortcut("alt+x", {
    description: "Abort workflow",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      actionAbort(ctx);
    },
  });

  pi.registerShortcut("alt+r", {
    description: "Resume workflow",
    handler: async (ctx) => {
      if (!requireArchEnabled(ctx)) return;
      actionResume(ctx);
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Session lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (ab.readWorkflowState().status === "idle") resetSubagent();
    recordEvent("Session started", ctx);
    refreshUi(ctx);

    if (ab.exists(ab.paths.workflow.lock)) {
      ctx.ui.notify(`Workflow lock detected: ${readLockSummary()}`, "warning");
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function sendDirectorMessage(pi: ExtensionAPI, text: string): void {
  pi.sendMessage({
    customType: "archagent-director",
    content: text,
    display: true,
  });
}

function extractAuthorizedPathsFallback(ddrContent: string): string[] {
  // Legacy section "Authorized Files"
  const match = ddrContent.match(/#{2,3}\s*Authorized Files\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/);
  if (match) {
    return match[1]
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  }

  // Infer from AFFECTED FILES (exact paths)
  const affected = ddrContent.match(/AFFECTED FILES:\s*\n([\s\S]*?)(?=\n[A-Z _-]+:\s*\n|\n#{2,}|$)/i);
  if (affected) {
    return affected[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/:.*/, ""))
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter((p) => p.includes("/"));
  }

  return [];
}

function summarizeArtifact(artifactPath: string, content: string): string {
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

function readLockSummary(): string {
  if (!ab.exists(ab.paths.workflow.lock)) return "none";
  const raw = ab.readIfExists(ab.paths.workflow.lock);
  try {
    const parsed = JSON.parse(raw) as { owner?: string; command?: string; startedAt?: string };
    return `${parsed.command ?? "?"} by ${parsed.owner ?? "unknown"} @ ${parsed.startedAt ?? "?"}`;
  } catch {
    return "present (unparseable)";
  }
}

function iconForStatus(status: WorkflowState["status"]): string {
  if (status === "running") return "▶";
  if (status === "waiting-checkpoint") return "⏸";
  if (status === "failed") return "✖";
  if (status === "completed") return "✓";
  return "○";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function toWidgetLines(text: string, maxLines: number): string[] {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} more lines truncated)`];
}

function extractCustomMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && "type" in c && (c as any).type === "text") return String((c as any).text ?? "");
        return "";
      })
      .join("");
  }
  return String(content ?? "");
}

function formatLogLine(raw: string, theme: any, full: boolean, viewMode: RuntimeViewMode): string {
  // Expect: [ISO] message
  const m = raw.match(/^\[(.*?)\]\s*(.*)$/);
  const ts = m?.[1] ?? "";
  const msg = m?.[2] ?? raw;

  const time = ts ? formatLocalTime(ts) : "";
  const timePart = time ? theme.fg("dim", `[${time}]`) + " " : "";

  const low = msg.toLowerCase();

  let tone: "accent" | "warning" | "error" | "success" | "dim" = "dim";
  let icon = "○";

  if (low.includes("failed") || low.includes("error") || low.includes("crashed")) {
    tone = "error";
    icon = "✖";
  } else if (low.includes("checkpoint") || low.includes("waiting-checkpoint")) {
    tone = "warning";
    icon = "⏸";
  } else if (low.includes("completed") || low.includes("pipeline complete") || low.includes("post-cycle")) {
    tone = "success";
    icon = "✓";
  } else if (low.startsWith("step ") || low.includes("starting") || low.includes("resuming")) {
    tone = "accent";
    icon = "▶";
  } else if (low.includes("→") || msg.trim().startsWith("→") || msg.trim().startsWith("  →")) {
    tone = "accent";
    icon = "→";
  }

  // Color only the icon + known headers (e.g. [assistant]/[thinking]).
  // Keep the body text in normal widget text color.
  let header = "";
  let rest = msg;

  const headerMatch = msg.match(/^(\[(assistant|thinking)\])\s*(.*)$/i);
  if (headerMatch) {
    header = headerMatch[1] ?? "";
    rest = headerMatch[3] ?? "";

    if (header.toLowerCase() === "[assistant]") {
      tone = "accent";
      icon = "✎";
    } else if (header.toLowerCase() === "[thinking]") {
      tone = "warning";
      icon = "🧠";
    }
  }

  const iconPart = theme.fg(tone, icon);
  const headerPart = header ? theme.fg(tone, header) + " " : "";
  const restPart = theme.fg("customMessageText", rest || "");

  const line = `${timePart}${iconPart} ${headerPart}${restPart}`.trimEnd();

  if (full) return line;

  // SUMMARY mode: keep it dense.
  const max = viewMode === "compact" ? 200 : 320;
  return truncateToWidth(line, max);
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
