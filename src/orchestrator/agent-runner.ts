import { createAgentSession, DefaultResourceLoader, SessionManager } from "@mariozechner/pi-coding-agent";
import { assembleContext } from "./context-assembler";
import type { CheckpointDecision, PipelineStep } from "../types";
import * as ab from "./archbase";

interface RunStepOptions {
  step: PipelineStep;
  activeDDRPath?: string;
  onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>;
  onProgress: (message: string) => void;
}

export async function runStep(opts: RunStepOptions): Promise<void> {
  const { step, activeDDRPath, onCheckpoint, onProgress } = opts;

  const state = ab.readWorkflowState();
  ab.writeWorkflowState({
    ...state,
    status: "running",
    currentRole: step.role,
    activeDDRPath,
  });

  const systemPrompt = assembleContext({
    role: step.role,
    mode: step.mode,
    zone: step.zone,
    objective: step.objective,
    activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
  });

  onProgress(`[${step.role.toUpperCase()}] Starting — zone: ${step.zone}`);

  process.env.ARCHAGENT_ROLE = step.role;
  process.env.ARCHAGENT_ALLOWED_PATHS = step.allowedPaths?.join(",") ?? "";

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    appendSystemPrompt: systemPrompt,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });

  session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      onProgress(`  → ${event.toolName}(${summarizeArgs(event.args)})`);
    }
    if (event.type === "agent_end") {
      onProgress(`[${step.role.toUpperCase()}] Completed`);
    }
  });

  try {
    await session.prompt(buildPrompt(step));

    if (step.requiresCheckpoint && step.checkpointLabel) {
      const artifactPath = resolveCheckpointArtifact(step);

      ab.writeWorkflowState({
        ...ab.readWorkflowState(),
        status: "waiting-checkpoint",
        pendingCheckpoint: { label: step.checkpointLabel, artifactPath },
      });

      const decision = await onCheckpoint(step.checkpointLabel, artifactPath);

      if (decision.type === "rejected") {
        onProgress(`[${step.role.toUpperCase()}] Rejected — re-running with feedback`);
        const feedbackPrompt = `The Director rejected your output with this feedback:\n\n\"${decision.comment}\"\n\nPlease revise your work addressing this feedback.`;
        await session.prompt(feedbackPrompt);
      }

      if (decision.type === "more-analysis") {
        onProgress(`[${step.role.toUpperCase()}] More analysis requested`);
        await session.prompt(`The Director requests additional analysis: "${decision.request}"`);
        const decision2 = await onCheckpoint(step.checkpointLabel, artifactPath);
        if (decision2.type === "rejected") {
          throw new Error(`Step ${step.role} rejected after additional analysis: ${decision2.comment}`);
        }
      }
    }
  } finally {
    session.dispose();
    delete process.env.ARCHAGENT_ROLE;
    delete process.env.ARCHAGENT_ALLOWED_PATHS;
  }
}

function buildPrompt(step: PipelineStep): string {
  const prompts: Record<string, string> = {
    understand: `Analyze the codebase for zone "${step.zone}". Focus on: ${step.objective}. Write your findings to archbase/ as specified in your instructions.`,
    decide: `Design a solution for: "${step.objective}" in zone "${step.zone}". Write your DDR to archbase/decisions/ as specified in your instructions.`,
    act: `Implement the active DDR exactly as specified. Zone: "${step.zone}". Do not deviate from the DDR scope.`,
    characterization: `Write characterization tests for zone "${step.zone}" that capture all current observable behaviors. Write tests to test directories only.`,
    verify: `Audit the implementation in zone "${step.zone}" for objective: "${step.objective}". Write your Audit Report to archbase/workflow/audit-report-current.md.`,
  };

  return prompts[step.mode === "characterization" ? "characterization" : step.role];
}

function resolveCheckpointArtifact(step: PipelineStep): string {
  if (step.role === "understand") return ab.paths.knowledge.arch;
  if (step.role === "decide") {
    const n = ab.nextDDRNumber() - 1;
    return ab.paths.decisions.ddr(n);
  }
  if (step.role === "act" && step.mode === "characterization") {
    return ab.paths.workflow.auditReport;
  }
  if (step.role === "verify") return ab.paths.workflow.auditReport;
  return ab.paths.workflow.state;
}

function summarizeArgs(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  return Object.entries(args as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(", ");
}
