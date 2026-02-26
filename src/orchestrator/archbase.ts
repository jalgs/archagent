import * as fs from "node:fs";
import * as path from "node:path";
import type { HealthMap, WorkflowState } from "../types";

const ARCHBASE = "archbase";

export const paths = {
  root: ARCHBASE,
  knowledge: {
    arch: `${ARCHBASE}/knowledge/ARCH.md`,
    archTarget: `${ARCHBASE}/knowledge/ARCH_TARGET.md`,
    patterns: `${ARCHBASE}/knowledge/PATTERNS.md`,
    conventions: `${ARCHBASE}/knowledge/CONVENTIONS.md`,
    constraints: `${ARCHBASE}/knowledge/CONSTRAINTS.md`,
    vocabulary: `${ARCHBASE}/knowledge/VOCABULARY.md`,
  },
  health: {
    map: `${ARCHBASE}/health/HEALTH_MAP.json`,
    debt: `${ARCHBASE}/health/DEBT.md`,
    metrics: `${ARCHBASE}/health/METRICS.md`,
    zones: (zone: string) => `${ARCHBASE}/health/zones/${zone.replace(/\//g, "-")}.md`,
  },
  forensics: {
    archaeology: `${ARCHBASE}/forensics/ARCHAEOLOGY.md`,
    intent: `${ARCHBASE}/forensics/INTENT.md`,
    delta: `${ARCHBASE}/forensics/DELTA.md`,
  },
  decisions: {
    dir: `${ARCHBASE}/decisions`,
    index: `${ARCHBASE}/decisions/_index.md`,
    archive: `${ARCHBASE}/decisions/_archive`,
    ddr: (n: number) => `${ARCHBASE}/decisions/DDR-${String(n).padStart(3, "0")}.md`,
  },
  workflow: {
    state: `${ARCHBASE}/workflow/WORKFLOW_STATE.json`,
    triage: `${ARCHBASE}/workflow/TRIAGE.md`,
    auditReport: `${ARCHBASE}/workflow/audit-report-current.md`,
    archUpdateProposal: `${ARCHBASE}/workflow/arch-update-proposal.md`,
    lock: `${ARCHBASE}/workflow/.lock`,
    logsDir: `${ARCHBASE}/workflow/logs`,
    runLogCurrent: `${ARCHBASE}/workflow/logs/run-current.log`,
  },
  agents: `${ARCHBASE}/AGENTS.md`,
};

export function isInitialized(): boolean {
  return fs.existsSync(paths.workflow.state);
}

export function init(repoName: string): void {
  const dirs = [
    `${ARCHBASE}/knowledge`,
    `${ARCHBASE}/health/zones`,
    `${ARCHBASE}/forensics`,
    `${ARCHBASE}/decisions/_archive`,
    `${ARCHBASE}/workflow`,
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

  writeIfNotExists(paths.knowledge.constraints, "# Constraints\n\n<!-- Escribe aquí las restricciones del proyecto -->\n");
  writeIfNotExists(paths.knowledge.conventions, "# Conventions\n\n<!-- Escribe aquí las convenciones del equipo -->\n");
  writeIfNotExists(paths.knowledge.arch, "# Architecture\n\n<!-- Describe la arquitectura actual del sistema -->\n");
  writeIfNotExists(paths.knowledge.patterns, "# Patterns\n\n<!-- Patrones actualmente en uso -->\n");
  writeIfNotExists(paths.knowledge.vocabulary, "# Vocabulary\n\n<!-- Lenguaje ubicuo / términos de dominio -->\n");
  writeIfNotExists(paths.health.debt, "# Technical Debt\n");
  writeIfNotExists(paths.health.metrics, "# Architecture Metrics\n");
  writeIfNotExists(paths.decisions.index, "# DDR Index\n");
  writeIfNotExists(paths.workflow.auditReport, "");

  if (!exists(paths.workflow.state)) {
    writeWorkflowState({
      status: "idle",
      updatedAt: new Date().toISOString(),
    });
  }

  if (!exists(paths.health.map)) {
    const initialMap: HealthMap = {
      version: "1.0",
      repo: repoName,
      zones: {},
      updatedAt: new Date().toISOString(),
    };
    writeHealthMap(initialMap);
  }

  if (!exists(paths.agents)) {
    const agentsContent = `# ArchAgent Project Context

This project uses ArchAgent for architecture-aware AI assistance.
For full capabilities, use the /arch:task command to launch the pipeline.
If using Pi directly, the constraints and conventions below apply.

---

## Constraints
${readIfExists(paths.knowledge.constraints)}

## Conventions
${readIfExists(paths.knowledge.conventions)}
`;

    write(paths.agents, agentsContent);
  }
}

export function readHealthMap(): HealthMap | null {
  if (!fs.existsSync(paths.health.map)) return null;
  return JSON.parse(fs.readFileSync(paths.health.map, "utf-8")) as HealthMap;
}

export function writeHealthMap(map: HealthMap): void {
  map.updatedAt = new Date().toISOString();
  write(paths.health.map, JSON.stringify(map, null, 2));
}

export function readWorkflowState(): WorkflowState {
  if (!fs.existsSync(paths.workflow.state)) {
    return { status: "idle", updatedAt: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(paths.workflow.state, "utf-8")) as WorkflowState;
}

export function writeWorkflowState(state: WorkflowState): void {
  state.updatedAt = new Date().toISOString();
  write(paths.workflow.state, JSON.stringify(state, null, 2));
}

export function nextDDRNumber(): number {
  const dir = paths.decisions.dir;
  if (!fs.existsSync(dir)) return 1;
  const files = fs.readdirSync(dir).filter((f) => /^DDR-\d+\.md$/.test(f));
  if (files.length === 0) return 1;
  const nums = files.map((f) => Number.parseInt(f.match(/\d+/)?.[0] ?? "1", 10));
  return Math.max(...nums) + 1;
}

export function archiveDDR(ddrPath: string): void {
  const filename = path.basename(ddrPath);
  const dest = `${paths.decisions.archive}/${filename}`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(ddrPath, dest);
}

export interface ProjectContext {
  constraints: string;
  conventions: string;
  arch: string;
  patterns: string;
  vocabulary: string;
}

export function readProjectContext(): ProjectContext {
  return {
    constraints: readIfExists(paths.knowledge.constraints),
    conventions: readIfExists(paths.knowledge.conventions),
    arch: readIfExists(paths.knowledge.arch),
    patterns: readIfExists(paths.knowledge.patterns),
    vocabulary: readIfExists(paths.knowledge.vocabulary),
  };
}

export function readZoneDetail(zone: string): string {
  return readIfExists(paths.health.zones(zone));
}

export function readActiveDDR(ddrPath: string): string {
  return readIfExists(ddrPath);
}

export function readAuditReport(): string {
  return readIfExists(paths.workflow.auditReport);
}

export function appendDebt(entry: string): void {
  const current = readIfExists(paths.health.debt);
  write(paths.health.debt, current + "\n" + entry);
}

export function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

export function readIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

export function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeIfNotExists(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) write(filePath, content);
}

export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function refreshAgentsMd(): void {
  const ctx = readProjectContext();
  const content = `# ArchAgent Project Context\n\n## Constraints\n${ctx.constraints}\n\n## Conventions\n${ctx.conventions}\n`;
  write(paths.agents, content);
}
