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
exports.DirectorInterface = void 0;
const pi_coding_agent_1 = require("@mariozechner/pi-coding-agent");
const ab = __importStar(require("./archbase"));
const ACTION_FENCE = "archagent-director-action";
class DirectorInterface {
    session = null;
    async interpret(userText, ctx) {
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
    async getOrCreateSession(ctx) {
        if (this.session)
            return this.session;
        const loader = new pi_coding_agent_1.DefaultResourceLoader({
            cwd: process.cwd(),
            noExtensions: true,
            noSkills: true,
            noPromptTemplates: true,
            noThemes: true,
            systemPromptOverride: () => DIRECTOR_SYSTEM_PROMPT,
        });
        await loader.reload();
        const { session } = await (0, pi_coding_agent_1.createAgentSession)({
            resourceLoader: loader,
            sessionManager: pi_coding_agent_1.SessionManager.inMemory(),
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
exports.DirectorInterface = DirectorInterface;
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
function buildPrompt(userText, state, lock) {
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
function safeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return "{}";
    }
}
function getLastAssistantText(session) {
    const messages = session.messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m.role !== "assistant")
            continue;
        const parts = m.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("");
        if (parts.trim())
            return parts;
    }
    return "";
}
function parseAction(text) {
    const json = extractFencedBlock(text, ACTION_FENCE);
    if (!json)
        return null;
    try {
        const parsed = JSON.parse(json);
        if (!parsed || typeof parsed !== "object" || !("type" in parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function stripActionBlock(text) {
    const open = "```" + ACTION_FENCE;
    const pattern = new RegExp("\\n?\\s*" + escapeRegex(open) + "[\\s\\S]*?\\n```\\s*$", "m");
    return text.replace(pattern, "");
}
function extractFencedBlock(content, fence) {
    const open = "```" + fence;
    const pattern = new RegExp(escapeRegex(open) + "\\s*\\n([\\s\\S]*?)\\n```", "m");
    const match = content.match(pattern);
    return match?.[1]?.trim() ?? null;
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
