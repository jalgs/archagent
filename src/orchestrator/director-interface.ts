import type { AgentSession, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createAgentSession, DefaultResourceLoader, SessionManager } from "@mariozechner/pi-coding-agent";
import * as ab from "./archbase";

export type DirectorAction =
  | { type: "none" }
  | { type: "help" }
  | { type: "init" }
  | { type: "task"; zone: string; objective: string }
  | { type: "review"; zone: string }
  | { type: "status" }
  | { type: "resume" }
  | { type: "abort" }
  | { type: "approve" }
  | { type: "reject"; comment: string }
  | { type: "more-analysis"; request: string };

export interface DirectorResponse {
  reply: string;
  action: DirectorAction;
}

const ACTION_FENCE = "archagent-director-action";

export class DirectorInterface {
  private session: AgentSession | null = null;

  async interpret(userText: string, ctx: ExtensionContext): Promise<DirectorResponse> {
    const session = await this.getOrCreateSession(ctx);

    const state = ab.readWorkflowState();
    const lock = ab.exists(ab.paths.workflow.lock) ? ab.readIfExists(ab.paths.workflow.lock) : "";

    const prompt = buildPrompt(userText, state, lock);

    await session.prompt(prompt);

    const assistantText = getLastAssistantText(session);
    const action = parseAction(assistantText);
    const reply = stripActionBlock(assistantText).trim() || "(no response)";

    return {
      reply,
      action: action ?? { type: "none" },
    };
  }

  private async getOrCreateSession(ctx: ExtensionContext): Promise<AgentSession> {
    if (this.session) return this.session;

    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      systemPromptOverride: () => DIRECTOR_SYSTEM_PROMPT,
    });

    await loader.reload();

    const { session } = await createAgentSession({
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(),
      tools: [],
    });

    // Use same model as the main session if available.
    if (ctx.model) {
      await session.setModel(ctx.model);
    }

    this.session = session;
    return session;
  }
}

const DIRECTOR_SYSTEM_PROMPT = `You are the ArchAgent Director Interface.

You converse with the user (the Director) and translate intent into a SINGLE deterministic action for the ArchAgent Orchestrator.

Rules:
- You MUST always include an action block at the end of your message.
- The action block MUST be a fenced code block named \"${ACTION_FENCE}\" containing strict JSON.
- Output exactly ONE action.
- If information is missing, ask a clarification question and output { \"type\": \"none\" }.
- Never call tools. Never reference internal implementation details.

Supported actions (JSON):
- {"type":"init"}  // bootstrap ArchAgent (create archbase + run deep bootstrap analysis)
- {"type":"task","zone":"src/auth","objective":"Add OAuth"}
- {"type":"review","zone":"src/auth"}
- {"type":"status"}
- {"type":"resume"}
- {"type":"abort"}
- {"type":"approve"}
- {"type":"reject","comment":"..."}
- {"type":"more-analysis","request":"..."}
- {"type":"help"}
- {"type":"none"}

Decision heuristics:
- Default action for any new work request is {"type":"task"}.
- Missing archbase/ does NOT imply {"type":"init"}. The orchestrator can initialize archbase non-destructively when running a task.
- Use {"type":"init"} ONLY when the Director explicitly asks to bootstrap/initialize ArchAgent itself (archbase + deep bootstrap analysis).
- If the user asks to "create a small example repo", that's still a {"type":"task"} with zone="." and an objective describing what to generate.
- When a checkpoint is pending, prefer approve/reject/more-analysis actions.
- When a workflow is running, prefer status/abort.
`;

function buildPrompt(userText: string, state: unknown, lock: string): string {
  return [
    "Director message:",
    userText,
    "",
    "Current orchestrator state (JSON):",
    safeJson(state),
    "",
    lock.trim() ? "Workflow lock (raw):\n" + lock.trim() : "Workflow lock: none",
    "",
    "Respond to the Director normally, then include the action JSON block.",
  ].join("\n");
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function getLastAssistantText(session: AgentSession): string {
  const messages = session.messages;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const parts = m.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    if (parts.trim()) return parts;
  }
  return "";
}

function parseAction(text: string): DirectorAction | null {
  const json = extractFencedBlock(text, ACTION_FENCE);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as DirectorAction;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stripActionBlock(text: string): string {
  const open = "```" + ACTION_FENCE;
  const pattern = new RegExp("\\n?\\s*" + escapeRegex(open) + "[\\s\\S]*?\\n```\\s*$", "m");
  return text.replace(pattern, "");
}

function extractFencedBlock(content: string, fence: string): string | null {
  const open = "```" + fence;
  const pattern = new RegExp(escapeRegex(open) + "\\s*\\n([\\s\\S]*?)\\n```", "m");
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
