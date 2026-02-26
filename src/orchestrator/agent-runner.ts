import * as fs from "node:fs";
import * as path from "node:path";
import { createAgentSession, DefaultResourceLoader, SessionManager, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { assembleContext } from "./context-assembler";
import type { AgentRole, CheckpointDecision, PipelineStep } from "../types";
import * as ab from "./archbase";
import planGuard from "../extensions/plan-guard";
import scopeEnforcer from "../extensions/scope-enforcer";

export interface StepTelemetry {
  phase: "start" | "update" | "end";
  role: AgentRole;
  model?: string;
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
}

interface RunStepOptions {
  step: PipelineStep;
  activeDDRPath?: string;
  onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>;
  onProgress: (message: string) => void;
  onTelemetry?: (data: StepTelemetry) => void;
}

const ROLE_SKILL_DIR: Record<AgentRole, string> = {
  understand: "understand-role",
  decide: "decide-role",
  act: "act-role",
  verify: "verify-role",
};

const AUXILIARY_SKILLS = ["clean-architecture", "design-patterns", "solid-principles"] as const;

function resolveSubagentExtensions(role: AgentRole): ExtensionFactory[] {
  if (role === "understand" || role === "decide") {
    return [(pi) => planGuard(pi)];
  }
  if (role === "act") {
    return [(pi) => scopeEnforcer(pi)];
  }
  // verify: no extension side effects; deterministic updates happen in Orchestrator post-cycle.
  return [];
}

function resolveSkillDir(skillName: string): string {
  return path.resolve(__dirname, "../../skills", skillName);
}

function loadRoleSkillContent(role: AgentRole): string {
  const dir = ROLE_SKILL_DIR[role];
  const skillPath = path.resolve(resolveSkillDir(dir), "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Missing required role skill for ${role}: ${skillPath}`);
  }
  return fs.readFileSync(skillPath, "utf-8");
}

function resolveAllowedSkillDirs(role: AgentRole): string[] {
  const names = [ROLE_SKILL_DIR[role], ...AUXILIARY_SKILLS];
  const dirs = names.map((name) => resolveSkillDir(name));
  const missing = dirs.filter((dir) => !fs.existsSync(path.resolve(dir, "SKILL.md")));
  if (missing.length > 0) {
    throw new Error(`Missing required skills for ${role}: ${missing.join(", ")}`);
  }
  return dirs;
}

function extractFrontmatterBody(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trim();
}

export async function runStep(opts: RunStepOptions): Promise<void> {
  const { step, activeDDRPath, onCheckpoint, onProgress, onTelemetry } = opts;

  const state = ab.readWorkflowState();
  ab.writeWorkflowState({
    ...state,
    status: "running",
    currentRole: step.role,
    activeDDRPath,
  });

  const roleSkillRaw = loadRoleSkillContent(step.role);
  const roleSkillBody = extractFrontmatterBody(roleSkillRaw);
  onProgress(`[${step.role.toUpperCase()}] Role skill loaded: ${ROLE_SKILL_DIR[step.role]}/SKILL.md`);

  const baseContext = assembleContext({
    role: step.role,
    mode: step.mode,
    zone: step.zone,
    objective: step.objective,
    activeDDRPath: step.role === "act" ? activeDDRPath : undefined,
  });

  const systemPrompt = `# MANDATORY ROLE SKILL (${ROLE_SKILL_DIR[step.role]})\n\n${roleSkillBody}\n\n---\n\n${baseContext}`;

  onProgress(`[${step.role.toUpperCase()}] Starting — zone: ${step.zone}`);

  process.env.ARCHAGENT_ROLE = step.role;
  process.env.ARCHAGENT_ALLOWED_PATHS = step.allowedPaths?.join(",") ?? "";

  const allowedSkillDirs = resolveAllowedSkillDirs(step.role);
  onProgress(
    `[${step.role.toUpperCase()}] Allowed skills: ${[ROLE_SKILL_DIR[step.role], ...AUXILIARY_SKILLS].join(", ")}`,
  );

  const extensionFactories: ExtensionFactory[] = resolveSubagentExtensions(step.role);

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    appendSystemPrompt: systemPrompt,

    // Sub-agents must NOT inherit Director/session extensions.
    noExtensions: true,
    extensionFactories,

    // Skills are loaded explicitly from archagent package.
    noSkills: true,
    additionalSkillPaths: allowedSkillDirs,

    // Keep sub-agent sessions minimal.
    noPromptTemplates: true,
    noThemes: true,
  });
  await loader.reload();
  const loadedSkills = loader.getSkills().skills.map((s) => s.name).sort();
  const allowedNames = new Set<string>([ROLE_SKILL_DIR[step.role], ...AUXILIARY_SKILLS]);
  const unexpected = loadedSkills.filter((name) => !allowedNames.has(name));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected skills loaded for ${step.role}: ${unexpected.join(", ")}`);
  }
  if (!loadedSkills.includes(ROLE_SKILL_DIR[step.role])) {
    throw new Error(`Role skill not loaded for ${step.role}: ${ROLE_SKILL_DIR[step.role]}`);
  }

  onProgress(`[${step.role.toUpperCase()}] Skills loaded: ${loadedSkills.join(", ") || "(none)"}`);

  const { session } = await createAgentSession({
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });

  const usage = {
    turns: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
  };
  const modelName = session.model ? `${session.model.provider}/${session.model.id}` : undefined;

  onTelemetry?.({
    phase: "start",
    role: step.role,
    model: modelName,
    ...usage,
  });

  let telemetryEnded = false;

  let streamTextBuf = "";
  let streamThinkingBuf = "";
  let lastStreamFlush = 0;

  const flushStream = (force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastStreamFlush < 800) return;
    lastStreamFlush = now;

    // IMPORTANT: do not truncate/ellipsis here.
    // The run log is the source of truth; truncation is a render concern (summary mode only).
    const emitLines = (tag: "thinking" | "assistant", buf: string) => {
      const cleaned = buf.replace(/\r/g, "");
      const lines = cleaned.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        onProgress(`[${tag}] ${line}`);
      }
    };

    if (streamThinkingBuf.trim()) {
      emitLines("thinking", streamThinkingBuf);
      streamThinkingBuf = "";
    }
    if (streamTextBuf.trim()) {
      emitLines("assistant", streamTextBuf);
      streamTextBuf = "";
    }
  };

  session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      onProgress(`  → ${event.toolName}(${summarizeArgs(event.args)})`);
    }

    // Stream visibility (best-effort): show thinking/text deltas.
    if (event.type === "message_update") {
      const e = event as unknown as { assistantMessageEvent?: { type?: string; delta?: string } };
      const t = e.assistantMessageEvent?.type;
      const d = e.assistantMessageEvent?.delta ?? "";
      if (t === "text_delta" && d) {
        streamTextBuf += d;
        if (streamTextBuf.includes("\n") || streamTextBuf.length > 220) flushStream();
      }
      if (t === "thinking_delta" && d) {
        streamThinkingBuf += d;
        if (streamThinkingBuf.includes("\n") || streamThinkingBuf.length > 220) flushStream();
      }
    }

    if (event.type === "message_end") {
      flushStream(true);

      const msg = event.message as {
        role?: string;
        usage?: {
          input?: number;
          output?: number;
          cacheRead?: number;
          cacheWrite?: number;
          cost?: { total?: number };
          totalTokens?: number;
        };
        model?: string;
      };
      if (msg.role === "assistant") {
        usage.turns += 1;
        usage.input += msg.usage?.input ?? 0;
        usage.output += msg.usage?.output ?? 0;
        usage.cacheRead += msg.usage?.cacheRead ?? 0;
        usage.cacheWrite += msg.usage?.cacheWrite ?? 0;
        usage.cost += msg.usage?.cost?.total ?? 0;
        usage.contextTokens = msg.usage?.totalTokens ?? usage.contextTokens;

        onTelemetry?.({
          phase: "update",
          role: step.role,
          model: msg.model ?? modelName,
          ...usage,
        });
      }
    }

    if (event.type === "agent_end") {
      flushStream(true);
      onProgress(`[${step.role.toUpperCase()}] Completed`);
      telemetryEnded = true;
      onTelemetry?.({
        phase: "end",
        role: step.role,
        model: modelName,
        ...usage,
      });
    }
  });

  try {
    await session.prompt(buildPrompt(step));

    if (step.requiresCheckpoint && step.checkpointLabel) {
      const artifactPath = resolveCheckpointArtifact(step);

      // Loop until approved.
      // - rejected => prompt revision, then checkpoint again
      // - more-analysis => prompt more analysis, then checkpoint again
      // - approved => continue
      //
      // This makes checkpoints a hard gate as described in the docs.
      //
      // Note: the checkpoint UI is owned by the Director (orchestrator extension).
      // Here we only enforce the control flow.
      //
      // eslint-disable-next-line no-constant-condition
      while (true) {
        ab.writeWorkflowState({
          ...ab.readWorkflowState(),
          status: "waiting-checkpoint",
          pendingCheckpoint: { label: step.checkpointLabel, artifactPath },
        });

        const decision = await onCheckpoint(step.checkpointLabel, artifactPath);

        if (decision.type === "approved") {
          break;
        }

        if (decision.type === "rejected") {
          onProgress(`[${step.role.toUpperCase()}] Rejected — revising with Director feedback`);
          const feedbackPrompt = `The Director rejected your output with this feedback:\n\n\"${decision.comment}\"\n\nPlease revise your work addressing this feedback.`;
          await session.prompt(feedbackPrompt);
          continue;
        }

        if (decision.type === "more-analysis") {
          onProgress(`[${step.role.toUpperCase()}] More analysis requested`);
          await session.prompt(`The Director requests additional analysis: "${decision.request}"`);
          continue;
        }
      }
    }
  } finally {
    if (!telemetryEnded) {
      onTelemetry?.({
        phase: "end",
        role: step.role,
        model: modelName,
        ...usage,
      });
    }
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
    return ab.findLatestDDRPath() ?? ab.paths.decisions.ddr(ab.nextDDRNumber() - 1);
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
