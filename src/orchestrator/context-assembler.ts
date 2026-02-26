import * as ab from "./archbase";
import type { AgentMode, AgentRole, ZoneHealth } from "../types";

interface AssembleOptions {
  role: AgentRole;
  mode: AgentMode;
  zone: string;
  objective: string;
  zoneHealth?: ZoneHealth;
  activeDDRPath?: string;
}

export function assembleContext(opts: AssembleOptions): string {
  const ctx = ab.readProjectContext();
  const sections: string[] = [];

  sections.push(buildRoleHeader(opts));

  if (ctx.constraints.trim()) {
    sections.push(`## PROJECT CONSTRAINTS (NON-NEGOTIABLE)\n${ctx.constraints}`);
  }

  if (["act", "verify"].includes(opts.role) && ctx.conventions.trim()) {
    sections.push(`## PROJECT CONVENTIONS\n${ctx.conventions}`);
  }

  if (["decide", "verify"].includes(opts.role) && ctx.arch.trim()) {
    sections.push(`## CURRENT ARCHITECTURE (ARCH.md)\n${ctx.arch}`);
  }

  if (opts.role === "decide" && ctx.patterns.trim()) {
    sections.push(`## PATTERNS IN USE\n${ctx.patterns}`);
  }

  if (opts.role === "decide" && ctx.vocabulary.trim()) {
    sections.push(`## DOMAIN VOCABULARY\n${ctx.vocabulary}`);
  }

  const zoneDetail = ab.readZoneDetail(opts.zone);
  if (zoneDetail.trim()) {
    sections.push(`## ZONE ANALYSIS: ${opts.zone}\n${zoneDetail}`);
  }

  if (opts.role === "act" && opts.activeDDRPath) {
    const ddr = ab.readActiveDDR(opts.activeDDRPath);
    if (ddr.trim()) {
      sections.push(
        "## ACTIVE DDR — YOUR ONLY AUTHORIZED SCOPE\n" +
          "This is the ONLY design you are authorized to implement.\n" +
          "Do NOT make any changes outside what this DDR specifies.\n\n" +
          ddr,
      );
    }
  }

  const modeInstructions = buildModeInstructions(opts);
  if (modeInstructions) {
    sections.push(modeInstructions);
  }

  sections.push(buildArchbasePaths(opts.role));

  return sections.join("\n\n---\n\n");
}

function buildRoleHeader(opts: AssembleOptions): string {
  const roleDescriptions: Record<AgentRole, string> = {
    understand:
      "You are the UNDERSTAND agent. Your ONLY job is to analyze and document. You NEVER write production code. You write ONLY to archbase/.",
    decide:
      "You are the DECIDE agent. Your ONLY job is to produce a Design Decision Record (DDR). You NEVER write production code. Your output is a DDR file in archbase/decisions/.",
    act:
      "You are the ACT agent. Your ONLY job is to implement the active DDR exactly as specified. Do NOT make design decisions. If you find something the DDR does not cover, STOP and report.",
    verify:
      "You are the VERIFY agent. Your ONLY job is to audit the implementation. You do NOT fix issues — you identify and document them in archbase/workflow/audit-report-current.md.",
  };

  return (
    `# ROLE: ${opts.role.toUpperCase()}\n\n` +
    `${roleDescriptions[opts.role]}\n\n` +
    `**Current objective:** ${opts.objective}\n` +
    `**Target zone:** ${opts.zone}`
  );
}

function buildModeInstructions(opts: AssembleOptions): string {
  if (opts.mode === "deep" && opts.role === "understand") {
    return `## DEEP ANALYSIS MODE
This zone has compromised dimensions. Perform archaeological analysis:
- Identify actual vs intended architecture
- Map load-bearing walls (highly coupled code that many things depend on)
- Identify available seams (points where behavior can be altered without editing the code at that point)
- Document with explicit confidence levels (high/medium/low) per section
- Write ARCHAEOLOGY.md and draft INTENT.md in archbase/forensics/`;
  }

  if (opts.mode === "incremental" && opts.role === "decide") {
    return `## INCREMENTAL MODE (LEGACY ZONE)
This zone has architectural issues. Your DDR MUST:
- Be the smallest possible step in the right direction (Baby Step constraint)
- Include a "What Must Not Change" section listing behaviors that must remain identical
- Verify your proposal moves toward the target architecture in ARCH_TARGET.md (if it exists)
- Identify which existing seams you will use`;
  }

  if (opts.mode === "characterization" && opts.role === "act") {
    return `## CHARACTERIZATION MODE
Do NOT implement features. Write characterization tests ONLY:
- Tests that capture CURRENT behavior (not desired behavior)
- Tests must pass before and after any refactoring
- Write ONLY to test directories
- Document what behaviors you've captured in archbase/workflow/audit-report-current.md`;
  }

  return "";
}

function buildArchbasePaths(role: AgentRole): string {
  const relevant: Record<AgentRole, string[]> = {
    understand: [
      "archbase/knowledge/ARCH.md — write your architectural analysis here",
      "archbase/health/HEALTH_MAP.json — update zone analysis (read-only, Orchestrator updates this)",
      "archbase/health/zones/<zone>.md — write detailed zone analysis",
      "archbase/forensics/ — write ARCHAEOLOGY.md and INTENT.md if in deep mode",
    ],
    decide: [
      "archbase/decisions/DDR-NNN.md — write your DDR here (use next available number)",
      "archbase/knowledge/ARCH.md — read for current architecture",
      "archbase/knowledge/PATTERNS.md — read for patterns in use",
    ],
    act: [
      "archbase/workflow/act-intent-current.md — optional: write intent/blocker notes (human readable)",
      "archbase/workflow/logs/modified-files-current.jsonl — automatically updated by scope-enforcer",
      "archbase/workflow/audit-report-current.md — DO NOT write here (Verify only)",
    ],
    verify: [
      "archbase/workflow/audit-report-current.md — write your full Audit Report here",
      "archbase/health/DEBT.md — DO NOT write here (Orchestrator updates this)",
    ],
  };

  return `## ARCHBASE PATHS FOR THIS ROLE\n${relevant[role].map((p) => `- ${p}`).join("\n")}`;
}
