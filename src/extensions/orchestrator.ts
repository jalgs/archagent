import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { runStep } from "../orchestrator/agent-runner";
import * as ab from "../orchestrator/archbase";
import { configurePipeline } from "../orchestrator/pipeline";
import { postCycleUpdate } from "../orchestrator/post-cycle";
import type { CheckpointDecision } from "../types";

export default function archagentOrchestrator(pi: ExtensionAPI): void {
  let pendingCheckpointResolve: ((d: CheckpointDecision) => void) | null = null;

  function resolveCheckpoint(decision: CheckpointDecision): void {
    if (!pendingCheckpointResolve) return;
    pendingCheckpointResolve(decision);
    pendingCheckpointResolve = null;
  }

  function makeCheckpointHandler(ctx: ExtensionCommandContext) {
    return async (label: string, artifactPath: string): Promise<CheckpointDecision> => {
      const content = ab.readIfExists(artifactPath);
      ctx.ui.notify(`⏸ CHECKPOINT: ${label}`, "info");

      pi.sendUserMessage(
        `## ⏸ Checkpoint: ${label}\n\nArtifact: \`${artifactPath}\`\n\n---\n\n${content}\n\n---\n\nUse **/arch:approve** to continue or **/arch:reject <feedback>** to revise.`,
        { deliverAs: "followUp" },
      );

      ab.writeWorkflowState({
        ...ab.readWorkflowState(),
        status: "waiting-checkpoint",
        pendingCheckpoint: { label, artifactPath },
      });

      return new Promise<CheckpointDecision>((resolve) => {
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

      await runStep({
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

      const lines: string[] = [
        `**Status:** ${state.status}`,
        state.currentObjective ? `**Objective:** ${state.currentObjective}` : "",
        state.currentRole ? `**Current agent:** ${state.currentRole}` : "",
        state.activeDDRPath ? `**Active DDR:** ${state.activeDDRPath}` : "",
        "",
        "**Health Map:**",
      ];

      if (map) {
        for (const [zone, health] of Object.entries(map.zones)) {
          const worst = worstDimension(health.dimensions as Record<string, { status: string }>);
          lines.push(`- ${zone}: ${worst} (trend: ${health.trend})`);
        }
      } else {
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

      const add = await ctx.ui.confirm(
        "Add to CONSTRAINTS.md?",
        `"${comment}"\n\nThis feedback seems like a project constraint. Add it permanently?`,
      );

      if (add) {
        const existing = ab.readIfExists(ab.paths.knowledge.constraints);
        const date = new Date().toISOString().split("T")[0];
        ab.write(
          ab.paths.knowledge.constraints,
          `${existing}\n\n## [${date}] Inferred from DDR rejection\n${comment}\n`,
        );
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

async function runPipeline(
  zone: string,
  objective: string,
  _pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>,
): Promise<void> {
  const pipeline = configurePipeline(zone, objective);

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

  let activeDDRPath: string | undefined;

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
      await runStep({
        step,
        activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
        onCheckpoint,
        onProgress: (msg) => ctx.ui.setStatus("archagent", msg),
      });
    } catch (err) {
      ctx.ui.notify(`❌ Step ${step.role} failed: ${String(err)}`, "error");
      ab.writeWorkflowState({
        ...ab.readWorkflowState(),
        status: "failed",
      });
      return;
    }
  }

  if (activeDDRPath) {
    postCycleUpdate(zone, activeDDRPath);
  }

  ab.writeWorkflowState({
    status: "idle",
    updatedAt: new Date().toISOString(),
  });

  ctx.ui.setStatus("archagent", "✓ complete");
  ctx.ui.notify(`✅ Pipeline complete for "${objective}"`, "info");
}

function worstDimension(dims: Record<string, { status: string }>): string {
  const statuses = Object.values(dims).map((d) => d.status);
  if (statuses.includes("compromised")) return "⚠ compromised";
  if (statuses.includes("attention")) return "~ attention";
  return "✓ healthy";
}

function extractAuthorizedPathsFromDDR(ddrPath: string): string[] {
  const content = ab.readIfExists(ddrPath);
  const match = content.match(/#{2,3}\s*Authorized Files\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/);
  if (!match) return [];

  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}
