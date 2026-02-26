# ArchAgent — Guía de Implementación Completa
## DDR-000: Arquitectura del Sistema v1.0 (MVP)

---

## Decisión Arquitectónica Central

**ArchAgent se implementa como un Pi Package**, no como un fork ni como un CLI wrapper.

Un Pi Package es un módulo npm con estructura específica que Pi descubre y carga automáticamente. El
Director instala ArchAgent con `pi install npm:archagent` (o localmente durante desarrollo con `pi install
local:./archagent`). A partir de ahí, Pi arranca exactamente igual que siempre — mismo TUI, mismo login,
mismo selector de modelo — pero con los comandos, extensiones y skills de ArchAgent disponibles.

**Por qué esta es la única decisión correcta:**

- El Director no aprende una nueva herramienta. Aprende comandos nuevos en Pi.
- Toda la infraestructura de Pi (auth, modelo, sesiones en árbol, compactación, themes) funciona sin tocarla.
- El sistema puede evolucionar añadiendo al paquete, no modificando Pi.
- Un `pi install` y funciona. Un `pi remove` y desaparece sin rastro.

**Alternativa descartada — CLI wrapper:** Requeriría reimplementar el TUI de Pi, la autenticación, el selector
de modelo, y la gestión de sesiones. Semanas de trabajo para replicar algo que ya existe y funciona.

**Alternativa descartada — Fork de Pi:** Rompe la posibilidad de actualizar Pi cuando saque nuevas
versiones. Mantenimiento de dos codebases.

---

## Estructura del Repositorio

```
archagent/
├── package.json                  ← Pi Package manifest + npm config
├── tsconfig.json
├── src/
│ ├── index.ts                  ← Entry point del Pi Package
│ │
│ ├── extensions/
│ │ ├── orchestrator.ts       ← Extensión principal: /task /status /approve /reject
│ │ ├── plan-guard.ts         ← Bloquea writes fuera de archbase/ en agentes read-only


│ │ ├── scope-enforcer.ts     ← Bloquea writes fuera del scope del DDR activo
│ │ └── health-tracker.ts     ← Actualiza HEALTH_MAP.md tras ciclo Verify
│ │
│ ├── orchestrator/
│ │ ├── pipeline.ts           ← Pipeline Configurator: zona → secuencia de pasos
│ │ ├── context-assembler.ts  ← Ensambla appendSystemPrompt por agente+zona
│ │ ├── agent-runner.ts       ← Crea y gestiona sesiones Pi especializadas vía SDK
│ │ ├── health-map.ts         ← Leer/escribir HEALTH_MAP.md
│ │ ├── post-cycle.ts         ← postCycleUpdate tras cada ciclo Verify
│ │ └── archbase.ts           ← Operaciones sobre archbase/ (init, read, write)
│ │
│ └── skills/                   ← Skills instalados con el paquete
│ ├── understand-role.md
│ ├── decide-role.md
│ ├── act-role.md
│ ├── verify-role.md
│ ├── clean-architecture.md
│ ├── solid-principles.md
│ └── design-patterns.md
│
└── templates/
└── archbase-init/            ← Plantillas para archagent init
├── CONSTRAINTS.md
├── CONVENTIONS.md
└── WORKFLOW_STATE.md
```

## ---

## package.json

```json
{
"name": "archagent",
"version": "0.1.0",
"description": "Architecture-aware multi-agent system for senior developers, built as a Pi Package",
"keywords": ["pi-package"],
"main": "src/index.ts",
"scripts": {
"dev": "tsx watch src/index.ts",
"build": "tsc"


## },

"dependencies": {
"@mariozechner/pi-coding-agent": "latest",
"@mariozechner/pi-agent-core": "latest",
"@mariozechner/pi-ai": "latest",
"@sinclair/typebox": "latest",
"gray-matter": "^4.0.3"
},
"devDependencies": {
"typescript": "^5.0.0",
"@types/node": "^20.0.0",
"tsx": "^4.0.0"
}
}
```

El keyword `"pi-package"` es lo que hace que Pi reconozca este paquete al instalarlo.

---

## src/index.ts — Entry Point del Pi Package

Pi busca el `main` del package.json y espera una función default que exporta la configuración del paquete.
Un Pi Package puede declarar extensiones, skills, prompt templates y themes.

```typescript
import type { PiPackage } from "@mariozechner/pi-coding-agent";
import { createOrchestratorExtension } from "./extensions/orchestrator";
import { createPlanGuardExtension } from "./extensions/plan-guard";
import { createScopeEnforcerExtension } from "./extensions/scope-enforcer";
import { createHealthTrackerExtension } from "./extensions/health-tracker";

const pkg: PiPackage = {
extensions: [
"./extensions/orchestrator.ts",
"./extensions/plan-guard.ts",
"./extensions/scope-enforcer.ts",
"./extensions/health-tracker.ts",
],
skills: [
"./skills/understand-role.md",


"./skills/decide-role.md",
"./skills/act-role.md",
"./skills/verify-role.md",
"./skills/clean-architecture.md",
"./skills/solid-principles.md",
"./skills/design-patterns.md",
],
};

export default pkg;
```

**Nota de implementación:** verificar la API exacta de PiPackage en la versión actual de `@mariozechner/pi-
coding-agent`. El contrato puede ser ligeramente diferente — revisar `packages/coding-agent/src/core/` en el
repo de Pi para el tipo exacto.

## ---

## Tipos Compartidos

Definir en `src/types.ts`. Todos los módulos los importan desde aquí.

```typescript
// src/types.ts

export type HealthStatus = "healthy" | "attention" | "compromised";
export type ConfidenceLevel = "quick" | "deep" | "director-validated";

export interface DimensionProfile {
status: HealthStatus;
confidence: ConfidenceLevel;
lastAnalyzed: string; // ISO date
directorOverride?: {
status: HealthStatus;
reason: string;
date: string;
};
}

export interface ZoneHealth {
zone: string;           // e.g. "src/auth", "src/billing"


dimensions: {
structuralReadability: DimensionProfile;
testReliability: DimensionProfile;
impactPredictability: DimensionProfile;
architecturalAlignment: DimensionProfile;
};
lastCommitAnalyzed?: string;
trend: "improving" | "stable" | "degrading";
}

export interface HealthMap {
version: "1.0";
repo: string;           // git remote origin or directory name
zones: Record<string, ZoneHealth>;
updatedAt: string;
}

export type AgentRole = "understand" | "decide" | "act" | "verify";
export type AgentMode = "standard" | "deep" | "incremental" | "characterization";

export interface PipelineStep {
role: AgentRole;
mode: AgentMode;
zone: string;
objective: string;      // Instrucción específica para este step
allowedPaths?: string[]; // Para scope-enforcer en Act
requiresCheckpoint: boolean;
checkpointLabel?: string;
}

export interface Pipeline {
steps: PipelineStep[];
zone: string;
objective: string;
}

export type CheckpointDecision =
| { type: "approved" }
| { type: "rejected"; comment: string }
| { type: "more-analysis"; request: string };


export interface WorkflowState {
status: "idle" | "running" | "waiting-checkpoint" | "completed" | "failed";
currentObjective?: string;
currentStep?: number;
totalSteps?: number;
currentRole?: AgentRole;
pendingCheckpoint?: {
label: string;
artifactPath: string;
};
lastCompletedStep?: number;
zone?: string;
activeDDRPath?: string;
startedAt?: string;
updatedAt: string;
}
```

---

## src/orchestrator/archbase.ts

Operaciones de bajo nivel sobre el sistema de ficheros de `archbase/`. Todos los demás módulos leen y
escriben a través de este módulo, nunca directamente.

```typescript
import * as fs from "fs";
import * as path from "path";
import type { HealthMap, WorkflowState } from "../types";

const ARCHBASE = "archbase";

// Rutas canónicas — fuente de verdad para toda la estructura
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
zones: (zone: string) =>
`${ARCHBASE}/health/zones/${zone.replace(/\//g, "-")}.md`,
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
ddr: (n: number) =>
`${ARCHBASE}/decisions/DDR-${String(n).padStart(3, "0")}.md`,
},
workflow: {
state: `${ARCHBASE}/workflow/WORKFLOW_STATE.json`,
triage: `${ARCHBASE}/workflow/TRIAGE.md`,
auditReport: `${ARCHBASE}/workflow/audit-report-current.md`,
archUpdateProposal: `${ARCHBASE}/workflow/arch-update-proposal.md`,
},
agents: `${ARCHBASE}/AGENTS.md`,
};

// ── Init
──────────────────────────────────────────────────────────────────────

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

// Ficheros que el Director escribe — se crean vacíos con placeholder
writeIfNotExists(paths.knowledge.constraints, `# Constraints\n\n<!-- Escribe aquí las restricciones del
proyecto -->\n`);
writeIfNotExists(paths.knowledge.conventions, `# Conventions\n\n<!-- Escribe aquí las convenciones del
equipo -->\n`);

// Estado inicial del workflow
writeWorkflowState({
status: "idle",
updatedAt: new Date().toISOString(),
});

// Health Map vacío
const initialMap: HealthMap = {
version: "1.0",
repo: repoName,
zones: {},
updatedAt: new Date().toISOString(),
};
writeHealthMap(initialMap);

// AGENTS.md — fallback para uso directo de Pi sin Orchestrator
const agentsContent = `# ArchAgent Project Context

This project uses ArchAgent for architecture-aware AI assistance.
For full capabilities, use the /task command to launch the pipeline.
If using Pi directly, the constraints and conventions below apply.

---

## Constraints
${readIfExists(paths.knowledge.constraints)}

## Conventions
${readIfExists(paths.knowledge.conventions)}


## `;

write(paths.agents, agentsContent);
}

// ── Health Map
─────────────────────────────────────────────────────────────────

export function readHealthMap(): HealthMap | null {
if (!fs.existsSync(paths.health.map)) return null;
return JSON.parse(fs.readFileSync(paths.health.map, "utf-8"));
}

export function writeHealthMap(map: HealthMap): void {
map.updatedAt = new Date().toISOString();
write(paths.health.map, JSON.stringify(map, null, 2));
}

// ── Workflow State
─────────────────────────────────────────────────────────────

export function readWorkflowState(): WorkflowState {
if (!fs.existsSync(paths.workflow.state)) {
return { status: "idle", updatedAt: new Date().toISOString() };
}
return JSON.parse(fs.readFileSync(paths.workflow.state, "utf-8"));
}

export function writeWorkflowState(state: WorkflowState): void {
state.updatedAt = new Date().toISOString();
write(paths.workflow.state, JSON.stringify(state, null, 2));
}

// ── DDR Management
─────────────────────────────────────────────────────────────

export function nextDDRNumber(): number {
const dir = paths.decisions.dir;
if (!fs.existsSync(dir)) return 1;
const files = fs.readdirSync(dir).filter((f) => /^DDR-\d+\.md$/.test(f));
if (files.length === 0) return 1;
const nums = files.map((f) => parseInt(f.match(/\d+/)![0]));


return Math.max(...nums) + 1;
}

export function archiveDDR(ddrPath: string): void {
const filename = path.basename(ddrPath);
const dest = `${paths.decisions.archive}/${filename}`;
fs.renameSync(ddrPath, dest);
}

// ── Context Reading
────────────────────────────────────────────────────────────

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


// ── Debt Management
────────────────────────────────────────────────────────────

export function appendDebt(entry: string): void {
const current = readIfExists(paths.health.debt);
write(paths.health.debt, current + "\n" + entry);
}

// ── Helpers
────────────────────────────────────────────────────────────────────

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

// Regenera AGENTS.md cuando cambian constraints o conventions
export function refreshAgentsMd(): void {
const ctx = readProjectContext();
const content = `# ArchAgent Project Context\n\n## Constraints\n${ctx.constraints}\n\n##
Conventions\n${ctx.conventions}\n`;
write(paths.agents, content);
}


## ```

## ---

## src/orchestrator/context-assembler.ts

Construye el `appendSystemPrompt` para cada sesión de agente especializado. Este es el componente que
hace que el mismo Pi se comporte como Understand, Decide, Act, o Verify.

```typescript
import * as fs from "fs";
import * as ab from "./archbase";
import type { AgentRole, AgentMode, ZoneHealth } from "../types";

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

// ── 1. Role instructions ──────────────────────────────────────────────────
// Los skills de rol están en el package y Pi los carga automáticamente.
// Aquí añadimos el encuadre de la tarea concreta como contexto de sesión.
sections.push(buildRoleHeader(opts));

// ── 2. Project constraints — SIEMPRE, COMPLETO, MÁXIMA PRIORIDAD ──────────
if (ctx.constraints.trim()) {
sections.push(`## PROJECT CONSTRAINTS (NON-NEGOTIABLE)\n${ctx.constraints}`);
}

// ── 3. Conventions — para Act y Verify ───────────────────────────────────
if (["act", "verify"].includes(opts.role) && ctx.conventions.trim()) {
sections.push(`## PROJECT CONVENTIONS\n${ctx.conventions}`);
}


// ── 4. Architecture — para Decide y Verify ───────────────────────────────
if (["decide", "verify"].includes(opts.role) && ctx.arch.trim()) {
sections.push(`## CURRENT ARCHITECTURE (ARCH.md)\n${ctx.arch}`);
}

// ── 5. Patterns — para Decide ────────────────────────────────────────────
if (opts.role === "decide" && ctx.patterns.trim()) {
sections.push(`## PATTERNS IN USE\n${ctx.patterns}`);
}

// ── 6. Vocabulary — para Decide ──────────────────────────────────────────
if (opts.role === "decide" && ctx.vocabulary.trim()) {
sections.push(`## DOMAIN VOCABULARY\n${ctx.vocabulary}`);
}

// ── 7. Zone detail (si existe análisis profundo) ──────────────────────────
const zoneDetail = ab.readZoneDetail(opts.zone);
if (zoneDetail) {
sections.push(`## ZONE ANALYSIS: ${opts.zone}\n${zoneDetail}`);
}

// ── 8. Active DDR — SOLO para Act ────────────────────────────────────────
if (opts.role === "act" && opts.activeDDRPath) {
const ddr = ab.readActiveDDR(opts.activeDDRPath);
if (ddr) {
sections.push(
`## ACTIVE DDR — YOUR ONLY AUTHORIZED SCOPE\n` +
`This is the ONLY design you are authorized to implement.\n` +
`Do NOT make any changes outside what this DDR specifies.\n\n${ddr}`
);
}
}

// ── 9. Mode-specific instructions ────────────────────────────────────────
const modeInstructions = buildModeInstructions(opts);
if (modeInstructions) {
sections.push(modeInstructions);
}

// ── 10. Archbase paths — para que el agente sepa dónde escribir ──────────


sections.push(buildArchbasePaths(opts.role));

return sections.join("\n\n---\n\n");
}

function buildRoleHeader(opts: AssembleOptions): string {
const roleDescriptions: Record<AgentRole, string> = {
understand:
"You are the UNDERSTAND agent. Your ONLY job is to analyze and document. " +
"You NEVER write production code. You write ONLY to archbase/.",
decide:
"You are the DECIDE agent. Your ONLY job is to produce a Design Decision Record (DDR). " +
"You NEVER write production code. Your output is a DDR file in archbase/decisions/.",
act:
"You are the ACT agent. Your ONLY job is to implement the active DDR exactly as specified. " +
"Do NOT make design decisions. If you find something the DDR doesn't cover, STOP and report.",
verify:
"You are the VERIFY agent. Your ONLY job is to audit the implementation. " +
"You do NOT fix issues — you identify and document them in archbase/workflow/audit-report-current.md.",
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
return `## DEEP ANALYSIS MODE\nThis zone has compromised dimensions. Perform archaeological
analysis:\n- Identify actual vs intended architecture\n- Map load-bearing walls (highly coupled code that
many things depend on)\n- Identify available seams (points where behavior can be altered without editing the
code at that point)\n- Document with explicit confidence levels (high/medium/low) per section\n- Write
ARCHAEOLOGY.md and draft INTENT.md in archbase/forensics/`;
}
if (opts.mode === "incremental" && opts.role === "decide") {
return `## INCREMENTAL MODE (LEGACY ZONE)\nThis zone has architectural issues. Your DDR MUST:\n-
Be the smallest possible step in the right direction (Baby Step constraint)\n- Include a "What Must Not


Change" section listing behaviors that must remain identical\n- Verify your proposal moves toward the target
architecture in ARCH_TARGET.md (if it exists)\n- Identify which existing seams you will use`;
}
if (opts.mode === "characterization" && opts.role === "act") {
return `## CHARACTERIZATION MODE\nDo NOT implement features. Write characterization tests ONLY:\n-
Tests that capture CURRENT behavior (not desired behavior)\n- Tests must pass before and after any
refactoring\n- Write ONLY to test directories\n- Document what behaviors you've captured in
archbase/workflow/audit-report-current.md`;
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
`archbase/decisions/DDR-NNN.md — write your DDR here (use next available number)`,
"archbase/knowledge/ARCH.md — read for current architecture",
"archbase/knowledge/PATTERNS.md — read for patterns in use",
],
act: [
"archbase/workflow/WORKFLOW_STATE.json — log each file BEFORE modifying it",
"archbase/workflow/audit-report-current.md — DO NOT write here (Verify only)",
],
verify: [
"archbase/workflow/audit-report-current.md — write your full Audit Report here",
"archbase/health/DEBT.md — DO NOT write here (Orchestrator updates this)",
],
};

return `## ARCHBASE PATHS FOR THIS ROLE\n${relevant[role].map((p) => `- ${p}`).join("\n")}`;
}
```

---


## src/orchestrator/health-map.ts

```typescript
import * as ab from "./archbase";
import type { HealthMap, ZoneHealth, HealthStatus, DimensionProfile } from "../types";

export function readZoneHealth(zone: string): ZoneHealth | null {
const map = ab.readHealthMap();
if (!map) return null;
return map.zones[zone] ?? null;
}

export function updateZoneFromAuditReport(zone: string, auditReportContent: string): void {
const map = ab.readHealthMap() ?? {
version: "1.0" as const,
repo: zone,
zones: {},
updatedAt: new Date().toISOString(),
};

const current = map.zones[zone] ?? defaultZoneHealth(zone);
const updated = applyAuditReport(current, auditReportContent);
map.zones[zone] = updated;
ab.writeHealthMap(map);
}

export function markZoneStale(zone: string): void {
const map = ab.readHealthMap();
if (!map || !map.zones[zone]) return;
// Stale: bajar confidence de todas las dimensiones a "quick"
const z = map.zones[zone];
for (const dim of Object.values(z.dimensions) as DimensionProfile[]) {
if (dim.confidence === "deep" || dim.confidence === "director-validated") {
dim.confidence = "quick";
}
}
ab.writeHealthMap(map);
}

export function isZoneStale(zone: string): boolean {
const health = readZoneHealth(zone);


if (!health) return true; // no analizado = stale
const dims = Object.values(health.dimensions) as DimensionProfile[];
return dims.every((d) => {
const daysOld = daysSince(d.lastAnalyzed);
return daysOld > 14; // configurable desde CONSTRAINTS.md en v
});
}

function applyAuditReport(current: ZoneHealth, report: string): ZoneHealth {
// Parser simple basado en secciones del Audit Report
// El Verify Agent escribe el report con secciones marcadas
const blockingCount = (report.match(/^## BLOCKING/gm) ?? []).length +
countPattern(report, /\[BLOCKING\]/gi);
const advisoryCount = countPattern(report, /\[ADVISORY\]/gi);
const regressionFailed = report.includes("[REGRESSION-FAILED]");
const directionOk = !report.includes("[DIRECTION-REGRESSION]");

const updated: ZoneHealth = { ...current };

// Test reliability
if (regressionFailed) {
updated.dimensions.testReliability.status = "compromised";
} else if (advisoryCount === 0 && blockingCount === 0) {
updated.dimensions.testReliability.status = improve(current.dimensions.testReliability.status);
}

// Architectural alignment
if (!directionOk) {
updated.dimensions.architecturalAlignment.status = "attention";
} else if (blockingCount === 0) {
updated.dimensions.architecturalAlignment.status = improve(
current.dimensions.architecturalAlignment.status
);
}

// General: si no hay blockings, mejorar structural readability
if (blockingCount === 0 && advisoryCount < 3) {
updated.dimensions.structuralReadability.status = improve(
current.dimensions.structuralReadability.status
);
}


// Trend
const prevAvg = averageScore(current);
const newAvg = averageScore(updated);
updated.trend = newAvg > prevAvg? "improving" : newAvg < prevAvg? "degrading" : "stable";

// Update timestamps
const now = new Date().toISOString();
for (const dim of Object.values(updated.dimensions) as DimensionProfile[]) {
if (!dim.directorOverride) {
dim.lastAnalyzed = now;
dim.confidence = "quick";
}
}

return updated;
}

function defaultZoneHealth(zone: string): ZoneHealth {
const dim: DimensionProfile = {
status: "attention",
confidence: "quick",
lastAnalyzed: new Date().toISOString(),
};
return {
zone,
dimensions: {
structuralReadability: { ...dim },
testReliability: { ...dim },
impactPredictability: { ...dim },
architecturalAlignment: { ...dim },
},
trend: "stable",
};
}

function improve(s: HealthStatus): HealthStatus {
if (s === "compromised") return "attention";
if (s === "attention") return "healthy";
return "healthy";
}


function statusScore(s: HealthStatus): number {
return s === "healthy"? 2 : s === "attention"? 1 : 0;
}

function averageScore(z: ZoneHealth): number {
const dims = Object.values(z.dimensions) as DimensionProfile[];
return dims.reduce((sum, d) => sum + statusScore(d.status), 0) / dims.length;
}

function countPattern(text: string, pattern: RegExp): number {
return (text.match(pattern) ?? []).length;
}

function daysSince(isoDate: string): number {
return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}
```

---

## src/orchestrator/pipeline.ts

```typescript
import type { ZoneHealth, Pipeline, PipelineStep, AgentRole } from "../types";
import { readZoneHealth } from "./health-map";
import { nextDDRNumber, paths } from "./archbase";

export function configurePipeline(zone: string, objective: string): Pipeline {
const health = readZoneHealth(zone);

if (!health) {
// Zona desconocida: bootstrap completo
return bootstrapPipeline(zone, objective);
}

const dims = health.dimensions;
const testsCompromised = dims.testReliability.status === "compromised";
const alignmentCompromised = dims.architecturalAlignment.status === "compromised";
const readabilityCompromised = dims.structuralReadability.status === "compromised";
const impactCompromised = dims.impactPredictability.status === "compromised";


const multipleCompromised =
[testsCompromised, alignmentCompromised, readabilityCompromised, impactCompromised]
.filter(Boolean).length >= 2;

const steps: PipelineStep[] = [];
const ddrNumber = nextDDRNumber();
const ddrPath = paths.decisions.ddr(ddrNumber);

// Step 1: Understand
steps.push({
role: "understand",
mode: readabilityCompromised || impactCompromised? "deep" : "standard",
zone,
objective: `Analyze zone "${zone}" for objective: ${objective}`,
requiresCheckpoint: readabilityCompromised || impactCompromised,
checkpointLabel: readabilityCompromised? "Review deep analysis before proceeding" : undefined,
});

// Step 2 (opcional): Characterization si tests comprometidos
if (testsCompromised) {
steps.push({
role: "act",
mode: "characterization",
zone,
objective: `Write characterization tests capturing current behavior in zone "${zone}"`,
allowedPaths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/test/**", "**/__tests__/**"],
requiresCheckpoint: true,
checkpointLabel: "Review characterization test coverage before proceeding",
});
}

// Step 3: Decide
steps.push({
role: "decide",
mode: alignmentCompromised? "incremental" : "standard",
zone,
objective,
requiresCheckpoint: true,
checkpointLabel: `Review and approve DDR-${String(ddrNumber).padStart(3, "0")}`,
});


// Step 4: Act
steps.push({
role: "act",
mode: "standard",
zone,
objective,
allowedPaths: undefined, // Se llenará con los paths del DDR aprobado
requiresCheckpoint: false,
});

// Step 5: Verify
steps.push({
role: "verify",
mode: "standard",
zone,
objective,
requiresCheckpoint: true,
checkpointLabel: "Review Audit Report",
});

return { steps, zone, objective };
}

function bootstrapPipeline(zone: string, objective: string): Pipeline {
return {
zone,
objective,
steps: [
{
role: "understand",
mode: "standard",
zone,
objective: `Initial analysis of zone "${zone}"`,
requiresCheckpoint: true,
checkpointLabel: "Review initial ARCH.md before proceeding",
},
{
role: "decide",
mode: "standard",
zone,
objective,


requiresCheckpoint: true,
checkpointLabel: "Review and approve DDR",
},
{
role: "act",
mode: "standard",
zone,
objective,
requiresCheckpoint: false,
},
{
role: "verify",
mode: "standard",
zone,
objective,
requiresCheckpoint: true,
checkpointLabel: "Review Audit Report",
},
],
};
}
```

## ---

## src/orchestrator/agent-runner.ts

El componente más importante de la implementación. Crea sesiones Pi especializadas usando el SDK y
gestiona su ciclo de vida.

```typescript
import {
createAgentSession,
SessionManager,
} from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { assembleContext } from "./context-assembler";
import type { PipelineStep, CheckpointDecision } from "../types";
import * as ab from "./archbase";

interface RunStepOptions {


step: PipelineStep;
activeDDRPath?: string;
onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>;
onProgress: (message: string) => void;
}

export async function runStep(opts: RunStepOptions): Promise<void> {
const { step, activeDDRPath, onCheckpoint, onProgress } = opts;

// Registrar en WORKFLOW_STATE que empezamos este step
const state = ab.readWorkflowState();
ab.writeWorkflowState({
...state,
status: "running",
currentRole: step.role,
activeDDRPath,
});

// Ensamblar el system prompt para este agente específico
const systemPrompt = assembleContext({
role: step.role,
mode: step.mode,
zone: step.zone,
objective: step.objective,
activeDDRPath: step.role === "act"? activeDDRPath : undefined,
});

onProgress(`[${step.role.toUpperCase()}] Starting — zone: ${step.zone}`);

// Crear la sesión Pi especializada
// Las extensiones plan-guard y scope-enforcer se cargan desde el package
// y se activan según la variable de entorno ARCHAGENT_ROLE
process.env.ARCHAGENT_ROLE = step.role;
process.env.ARCHAGENT_ALLOWED_PATHS = step.allowedPaths?.join(",") ?? "";

const session = await createAgentSession({
// El model se hereda de la sesión del Director (configuración global de Pi)
// En v1, usar el modelo por defecto de Pi; en v2, permitir override por rol
appendSystemPrompt: systemPrompt,
sessionManager: SessionManager.inMemory(), // No persistimos sesiones de sub-agentes
// Las extensiones del package se cargan automáticamente por Pi


## });

// Suscribirse a eventos para progress reporting
session.subscribe((event) => {
if (event.type === "tool_execution_start") {
onProgress(`  → ${event.toolName}(${summarizeArgs(event.args)})`);
}
if (event.type === "agent_end") {
onProgress(`[${step.role.toUpperCase()}] Completed`);
}
});

// Lanzar el agente con el objetivo de este step
await session.prompt(buildPrompt(step));

// Si este step tiene checkpoint, pausar y esperar al Director
if (step.requiresCheckpoint && step.checkpointLabel) {
const artifactPath = resolveCheckpointArtifact(step);

ab.writeWorkflowState({
...ab.readWorkflowState(),
status: "waiting-checkpoint",
pendingCheckpoint: { label: step.checkpointLabel, artifactPath },
});

const decision = await onCheckpoint(step.checkpointLabel, artifactPath);

if (decision.type === "rejected") {
// Reinyectar el feedback y volver a correr el mismo step
onProgress(`[${step.role.toUpperCase()}] Rejected — re-running with feedback`);
const feedbackPrompt = `The Director rejected your output with this
feedback:\n\n"${decision.comment}"\n\nPlease revise your work addressing this feedback.`;
await session.prompt(feedbackPrompt);
// Recursión controlada: máximo 2 reintentos (implementar contador en v2)
}

if (decision.type === "more-analysis") {
onProgress(`[${step.role.toUpperCase()}] More analysis requested`);
await session.prompt(`The Director requests additional analysis: "${decision.request}"`);
// Después de la análisis adicional, volver a checkpoint
const decision2 = await onCheckpoint(step.checkpointLabel, artifactPath);


if (decision2.type === "rejected") {
throw new Error(`Step ${step.role} rejected after additional analysis: ${decision2.comment}`);
}
}
}

// Limpiar variable de entorno
delete process.env.ARCHAGENT_ROLE;
delete process.env.ARCHAGENT_ALLOWED_PATHS;
}

function buildPrompt(step: PipelineStep): string {
// El system prompt ya tiene el rol y el contexto completo.
// El user prompt es la instrucción concreta de la tarea.
const prompts: Record<string, string> = {
understand: `Analyze the codebase for zone "${step.zone}". Focus on: ${step.objective}. Write your findings
to archbase/ as specified in your instructions.`,
decide: `Design a solution for: "${step.objective}" in zone "${step.zone}". Write your DDR to
archbase/decisions/ as specified in your instructions.`,
act: `Implement the active DDR exactly as specified. Zone: "${step.zone}". Do not deviate from the DDR
scope.`,
characterization: `Write characterization tests for zone "${step.zone}" that capture all current observable
behaviors. Write tests to test directories only.`,
verify: `Audit the implementation in zone "${step.zone}" for objective: "${step.objective}". Write your Audit
Report to archbase/workflow/audit-report-current.md.`,
};
return prompts[step.mode === "characterization"? "characterization" : step.role];
}

function resolveCheckpointArtifact(step: PipelineStep): string {
if (step.role === "understand") return ab.paths.knowledge.arch;
if (step.role === "decide") {
const n = ab.nextDDRNumber() - 1; // Ya fue creado
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
const entries = Object.entries(args as Record<string, unknown>);
return entries
.map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
.join(", ");
}
```

---

## src/orchestrator/post-cycle.ts

```typescript
import * as ab from "./archbase";
import { updateZoneFromAuditReport } from "./health-map";

export function postCycleUpdate(zone: string, ddrPath: string): void {
const auditReport = ab.readAuditReport();
if (!auditReport) return;

// 1. Actualizar Health Map
updateZoneFromAuditReport(zone, auditReport);

// 2. Extraer advisory issues → DEBT.md
extractDebtEntries(auditReport, zone);

// 3. Marcar DDR como implementado en _index.md
markDDRImplemented(ddrPath);

// 4. Limpiar artefactos temporales del workflow
cleanWorkflowTemp();
}

function extractDebtEntries(report: string, zone: string): void {
const advisoryPattern = /\[ADVISORY\](.*?)(?=\[ADVISORY\]|\[BLOCKING\]|$)/gs;
const matches = report.matchAll(advisoryPattern);
const date = new Date().toISOString().split("T")[0];

for (const match of matches) {


const content = match[1].trim();
if (!content) continue;

// Deduplicar: no añadir si ya existe entrada similar en DEBT.md
const existing = ab.readIfExists(ab.paths.health.debt);
if (existing.includes(content.slice(0, 60))) continue;

const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit cycle_\n`;
ab.appendDebt(entry);
}
}

function markDDRImplemented(ddrPath: string): void {
const index = ab.readIfExists(ab.paths.decisions.index);
const filename = ddrPath.split("/").pop() ?? "";
const updated = index.replace(
new RegExp(`(${filename}.*?)(approved)`),
"$1implemented"
);
if (updated !== index) {
ab.write(ab.paths.decisions.index, updated);
}
}

function cleanWorkflowTemp(): void {
// Renombrar el audit report actual a histórico
const report = ab.readIfExists(ab.paths.workflow.auditReport);
if (!report) return;
const date = new Date().toISOString().split("T")[0];
const archivePath = `archbase/workflow/audit-report-${date}-${Date.now()}.md`;
ab.write(archivePath, report);
ab.write(ab.paths.workflow.auditReport, "");
}
```

---

## src/extensions/orchestrator.ts

La extensión principal. Registra todos los comandos que el Director usa. **Esta es la interfaz completa del
Director.**


```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configurePipeline } from "../orchestrator/pipeline";
import { runStep } from "../orchestrator/agent-runner";
import { postCycleUpdate } from "../orchestrator/post-cycle";
import * as ab from "../orchestrator/archbase";
import type { CheckpointDecision, Pipeline } from "../types";

export default function archagentOrchestrator(pi: ExtensionAPI) {

// ── /arch:init
─────────────────────────────────────────────────────────────
pi.registerCommand("arch:init", {
description: "Initialize archbase/ in the current repository",
handler: async (_args, ctx) => {
if (ab.isInitialized()) {
ctx.ui.notify("archbase/ already initialized", "info");
return;
}
const repoName = process.cwd().split("/").pop() ?? "unknown";
ab.init(repoName);
ctx.ui.notify("✓ archbase/ initialized. Edit CONSTRAINTS.md and CONVENTIONS.md to configure.",
"success");
ctx.ui.setStatus("archagent", "ready");
},
});

// ── /arch:task
─────────────────────────────────────────────────────────────
pi.registerCommand("arch:task", {
description: "Launch a full agent pipeline for a task. Usage: /arch:task <zone> | <objective>",
handler: async (args, ctx) => {
if (!ab.isInitialized()) {
ctx.ui.notify("Run /arch:init first", "error");
return;
}

// Parse: "/arch:task src/auth | Add OAuth2 support"
const [zone, ...objectiveParts] = (args as string).split("|");
const objective = objectiveParts.join("|").trim();


if (!zone?.trim() || !objective) {
ctx.ui.notify("Usage: /arch:task <zone> | <objective>", "error");
return;
}

await runPipeline(
zone.trim(),
objective,
pi,
ctx
);
},
});

// ── /arch:review
───────────────────────────────────────────────────────────
pi.registerCommand("arch:review", {
description: "Run a standalone Verify audit on a zone or diff",
handler: async (args, ctx) => {
if (!ab.isInitialized()) {
ctx.ui.notify("Run /arch:init first", "error");
return;
}
const zone = (args as string).trim() || ".";
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
onCheckpoint: makeCheckpointHandler(pi, ctx),
onProgress: (msg) => ctx.ui.setStatus("archagent", msg),
});

ctx.ui.setStatus("archagent", "review complete");


## },

## });

// ── /arch:status
───────────────────────────────────────────────────────────
pi.registerCommand("arch:status", {
description: "Show current workflow state and Health Map summary",
handler: async (_args, ctx) => {
const state = ab.readWorkflowState();
const map = ab.readHealthMap();

const lines: string[] = [
`**Status:** ${state.status}`,
state.currentObjective? `**Objective:** ${state.currentObjective}` : "",
state.currentRole? `**Current agent:** ${state.currentRole}` : "",
state.activeDDRPath? `**Active DDR:** ${state.activeDDRPath}` : "",
"",
"**Health Map:**",
];

if (map) {
for (const [zone, health] of Object.entries(map.zones)) {
const dims = health.dimensions;
const worst = worstDimension(dims);
lines.push(`  ${zone}: ${worst} (trend: ${health.trend})`);
}
} else {
lines.push("  No Health Map yet. Run /arch:task to start.");
}

// Usar Pi's message system para mostrar el status
pi.sendUserMessage(lines.filter(Boolean).join("\n"), {
deliverAs: "followUp",
});
},
});

// ── /arch:approve
──────────────────────────────────────────────────────────
pi.registerCommand("arch:approve", {
description: "Approve the pending checkpoint",


handler: async (_args, ctx) => {
resolveCheckpoint({ type: "approved" });
ctx.ui.notify("✓ Checkpoint approved — pipeline continuing", "success");
},
});

// ── /arch:reject
───────────────────────────────────────────────────────────
pi.registerCommand("arch:reject", {
description: "Reject the pending checkpoint. Usage: /arch:reject <comment>",
handler: async (args, ctx) => {
const comment = (args as string).trim();
if (!comment) {
ctx.ui.notify("Provide feedback: /arch:reject <your comment>", "error");
return;
}
resolveCheckpoint({ type: "rejected", comment });

// Proponer añadir el feedback a CONSTRAINTS.md
const add = await ctx.ui.confirm(
"Add to CONSTRAINTS.md?",
`"${comment}"\n\nThis feedback seems like a project constraint. Add it permanently?`
);
if (add) {
const existing = ab.readIfExists(ab.paths.knowledge.constraints);
const date = new Date().toISOString().split("T")[0];
ab.write(
ab.paths.knowledge.constraints,
existing + `\n\n## [${date}] Inferred from DDR rejection\n${comment}\n`
);
ab.refreshAgentsMd();
ctx.ui.notify("✓ Added to CONSTRAINTS.md", "success");
}

ctx.ui.notify("✗ Checkpoint rejected — agent will revise", "info");
},
});

// ── Status widget en el footer de Pi ──────────────────────────────────────
const state = ab.readWorkflowState();
if (state.status !== "idle") {


pi.on("session_start", async (_event, ctx) => {
const s = ab.readWorkflowState();
ctx.ui.setStatus("archagent", `[${s.status}] ${s.currentRole ?? ""}`.trim());
});
}

// ── Checkpoint resolution mechanism ───────────────────────────────────────
// Almacena el resolve de la Promise pendiente para que /arch:approve y
// /arch:reject puedan resolverla desde el handler de comandos
let pendingCheckpointResolve: ((d: CheckpointDecision) => void) | null = null;

function resolveCheckpoint(decision: CheckpointDecision): void {
if (pendingCheckpointResolve) {
pendingCheckpointResolve(decision);
pendingCheckpointResolve = null;
}
}

function makeCheckpointHandler(pi: ExtensionAPI, ctx: any) {
return async (label: string, artifactPath: string): Promise<CheckpointDecision> => {
// Mostrar el artefacto al Director
const content = ab.readIfExists(artifactPath);
ctx.ui.notify(`⏸ CHECKPOINT: ${label}`, "info");

// Usar Pi's message stream para mostrar el artefacto completo
pi.sendUserMessage(
`## ⏸ Checkpoint: ${label}\n\nArtifact: \`${artifactPath}\`\n\n---\n\n${content}\n\n---\n\nUse
**/arch:approve** to continue, **/arch:reject <feedback>** to revise, or ask for more analysis.`,
{ deliverAs: "followUp" }
);

ab.writeWorkflowState({
...ab.readWorkflowState(),
status: "waiting-checkpoint",
pendingCheckpoint: { label, artifactPath },
});

// Esperar a que el Director resuelva via /arch:approve o /arch:reject
return new Promise<CheckpointDecision>((resolve) => {
pendingCheckpointResolve = resolve;
});


## };

## }

async function runPipeline(
zone: string,
objective: string,
pi: ExtensionAPI,
ctx: any
): Promise<void> {
const pipeline = configurePipeline(zone, objective);

ab.writeWorkflowState({
status: "running",
currentObjective: objective,
currentStep: 0,
totalSteps: pipeline.steps.length,
zone,
updatedAt: new Date().toISOString(),
});

ctx.ui.setStatus("archagent", `Pipeline: 0/${pipeline.steps.length}`);
ctx.ui.notify(`🚀 Starting pipeline — ${pipeline.steps.length} steps for zone "${zone}"`, "info");

let activeDDRPath: string | undefined;

for (let i = 0; i < pipeline.steps.length; i++) {
const step = pipeline.steps[i];

ab.writeWorkflowState({
...ab.readWorkflowState(),
currentStep: i + 1,
currentRole: step.role,
});

ctx.ui.setStatus("archagent", `Step ${i + 1}/${pipeline.steps.length}: ${step.role}`);

// Si el step anterior fue Decide, recuperar el path del DDR para Act
if (step.role === "act" && step.mode !== "characterization") {
const n = ab.nextDDRNumber() - 1;
activeDDRPath = ab.paths.decisions.ddr(n);


// Leer los ficheros autorizados del DDR y configurar scope-enforcer
step.allowedPaths = extractAuthorizedPathsFromDDR(activeDDRPath);
}

try {
await runStep({
step,
activeDDRPath: step.role === "act"? activeDDRPath : undefined,
onCheckpoint: makeCheckpointHandler(pi, ctx),
onProgress: (msg) => ctx.ui.setStatus("archagent", msg),
});
} catch (err) {
ctx.ui.notify(`❌ Step ${step.role} failed: ${err}`, "error");
ab.writeWorkflowState({
...ab.readWorkflowState(),
status: "failed",
});
return;
}
}

// postCycleUpdate al finalizar el pipeline completo
if (activeDDRPath) {
postCycleUpdate(zone, activeDDRPath);
}

ab.writeWorkflowState({
status: "idle",
updatedAt: new Date().toISOString(),
});

ctx.ui.setStatus("archagent", "✓ complete");
ctx.ui.notify(`✅ Pipeline complete for "${objective}"`, "success");
}
}

function worstDimension(dims: Record<string, { status: string }>): string {
const statuses = Object.values(dims).map((d) => d.status);
if (statuses.includes("compromised")) return "⚠ compromised";
if (statuses.includes("attention")) return "~ attention";
return "✓ healthy";


## }

function extractAuthorizedPathsFromDDR(ddrPath: string): string[] {
const content = ab.readIfExists(ddrPath);
// El Decide Agent debe incluir una sección "## Authorized Files" en el DDR
// con la lista de ficheros que el Act Agent puede modificar
const match = content.match(/## Authorized Files\s*\n([\s\S]*?)(?=\n##|$)/);
if (!match) return [];
return match[1]
.split("\n")
.map((l) => l.replace(/^[-*]\s*/, "").trim())
.filter((l) => l.length > 0 && !l.startsWith("#"));
}
```

---

## src/extensions/plan-guard.ts

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function planGuard(pi: ExtensionAPI) {
const role = process.env.ARCHAGENT_ROLE;

// Solo activo para agentes read-only: understand y decide
if (role !== "understand" && role !== "decide") return;

pi.on("tool_call", async (event, ctx) => {
if (event.toolName !== "write" && event.toolName !== "edit") return;

const targetPath: string =
(event.input as any).path ?? (event.input as any).filePath ?? "";

// Understand y Decide SOLO pueden escribir en archbase/
if (!targetPath.startsWith("archbase/")) {
ctx.ui.notify(
`🛡 plan-guard: Blocked write to "${targetPath}" — ${role} agent can only write to archbase/`,
"error"
);
return {


block: true,
reason: `plan-guard: ${role} agents can only write to archbase/. Attempted: ${targetPath}`,
};
}
});
}
```

---

## src/extensions/scope-enforcer.ts

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "path";

export default function scopeEnforcer(pi: ExtensionAPI) {
const role = process.env.ARCHAGENT_ROLE;
if (role !== "act") return;

const allowedPathsRaw = process.env.ARCHAGENT_ALLOWED_PATHS ?? "";
const allowedPaths = allowedPathsRaw
.split(",")
.map((p) => p.trim())
.filter(Boolean);

// Si no hay allowedPaths definidos, modo permisivo (no bloquear)
if (allowedPaths.length === 0) return;

pi.on("tool_call", async (event, ctx) => {
if (event.toolName !== "write" && event.toolName !== "edit") return;

const targetPath: string =
(event.input as any).path ?? (event.input as any).filePath ?? "";

// archbase/ siempre permitido para Act (para WORKFLOW_STATE.json)
if (targetPath.startsWith("archbase/")) return;

const isAllowed = allowedPaths.some((allowed) => {
// Soporte básico de glob: ** para cualquier directorio
const pattern = allowed.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");


return new RegExp(pattern).test(targetPath);
});

if (!isAllowed) {
ctx.ui.notify(
`🛡 scope-enforcer: "${targetPath}" is NOT in the authorized DDR scope`,
"error"
);
return {
block: true,
reason: `scope-enforcer: File "${targetPath}" is not authorized by the active DDR. Authorized paths:
${allowedPaths.join(", ")}`,
};
}
});
}
```

---

## src/extensions/health-tracker.ts

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { updateZoneFromAuditReport } from "../orchestrator/health-map";
import * as ab from "../orchestrator/archbase";

export default function healthTracker(pi: ExtensionAPI) {
const role = process.env.ARCHAGENT_ROLE;
if (role !== "verify") return;

pi.on("agent_end", async (_event, ctx) => {
const state = ab.readWorkflowState();
const zone = state.zone;
if (!zone) return;

const auditReport = ab.readAuditReport();
if (!auditReport) return;

updateZoneFromAuditReport(zone, auditReport);
ctx.ui.notify("✓ Health Map updated", "success");


## });

## }

## ```

## ---

## Skills — Estructura y Metadatos

Los skills en Pi son ficheros Markdown con frontmatter. Los skills del usuario ya existen — solo necesitan
añadir el frontmatter correcto para que el Pi Package los descubra.

```markdown
---
name: understand-role
description: Role instructions for the ArchAgent UNDERSTAND agent — analysis and documentation only
---

# UNDERSTAND Agent Role

[... contenido del skill del usuario ...]
```

```markdown
---
name: decide-role
description: Role instructions for the ArchAgent DECIDE agent — design decisions and DDR production
---
```

```markdown
---
name: act-role
description: Role instructions for the ArchAgent ACT agent — implementation within DDR scope
---
```

```markdown
---
name: verify-role
description: Role instructions for the ArchAgent VERIFY agent — architecture audit and reporting
---


## ```

**Formato del Audit Report que el Verify Agent debe producir** (añadir a `verify-role.md`):

```
## AUDIT REPORT — [zone] — [date]

### DDR Conformance
[BLOCKING] o [ADVISORY] por cada finding

### SOLID Analysis
[BLOCKING] / [ADVISORY] con archivo:línea

### Clean Code
[ADVISORY] con archivo:línea

### Architectural Alignment
[DIRECTION-REGRESSION] si el cambio aleja de ARCH_TARGET.md

### Regression Check
[REGRESSION-FAILED] si algún test de caracterización falla

### Summary

- Blocking issues: N
- Advisory issues: N
- Recommendation: APPROVE / REJECT
```

Este formato es lo que parsea `health-map.ts`. El Verify Agent debe seguirlo estrictamente.

---

## Formato del DDR que el Decide Agent debe producir

Añadir a `decide-role.md`:

```markdown
## DDR-NNN: [Título]
**Date:** YYYY-MM-DD 
**Zone:** [zona] 
**Status:** draft


### Context
[Qué dice ARCH.md y el Health Map sobre esta zona]

### Decision
[Qué se ha decidido y por qué]

### Alternatives Considered
[Opciones evaluadas y razón de descarte]

### Constraints Respected
[Entradas de CONSTRAINTS.md que aplican]

### Authorized Files

- path/to/file1.ts
- path/to/file2.ts
[Lista EXACTA de ficheros que el Act Agent puede modificar]

### What Must Not Change
[Solo en modo incremental — comportamientos que deben permanecer iguales]

### Impact on ARCH.md
[Si esta decisión requiere actualizar ARCH.md]
```

La sección `## Authorized Files` es crítica — `scope-enforcer` la usa para configurar los paths permitidos del
Act Agent.

## ---

## Instalación y Uso

### Desarrollo local

```bash
# En el directorio del paquete
npm install
npm link

# En el repo del usuario
pi install local:./path/to/archagent


# Verificar que el paquete se cargó
pi list
```

### Uso en un repo

```bash
# 1. Inicializar archbase/
/arch:init

# 2. Editar CONSTRAINTS.md y CONVENTIONS.md directamente
# (Pi puede ayudar: "help me fill in CONSTRAINTS.md for this project")

# 3. Lanzar una tarea
/arch:task src/auth | Add OAuth2 support with Google provider

# 4. El Director sigue el pipeline via checkpoints:
#    - Revisa ARCH.md generado por Understand
#    - Revisa y aprueba el DDR
#    - Revisa el Audit Report

# 5. Ver estado en cualquier momento
/arch:status

# 6. Revisar un PR
/arch:review src/payments
```

---

## Prioridades de Implementación

**Fase 1 — Implementar y testear en este orden:**

1. `archbase.ts` — sin esto nada funciona
2. `plan-guard.ts` + `scope-enforcer.ts` — validar manualmente que bloquean correctamente
3. `context-assembler.ts` — imprimir el output y verificar que es coherente
4. `agent-runner.ts` + Orchestrator básico sin checkpoints — solo el loop completo
5. Añadir checkpoints al Orchestrator
6. `health-map.ts` + `post-cycle.ts` + `health-tracker.ts`


7. Todos los comandos del `orchestrator.ts`

**El primer test de integración real:**
```
/arch:init
/arch:task src/<modulo-conocido> | <objetivo-pequeño>
```
Verificar que los cuatro agentes se ejecutan en secuencia, que plan-guard bloquea, que el DDR se escribe en
archbase/, y que el Audit Report aparece en el checkpoint final.

---

## Notas Críticas para el Implementador

1. **`createAgentSession` API**: verificar los parámetros exactos en la versión instalada. El parámetro puede
llamarse `systemPrompt` en lugar de `appendSystemPrompt`. Revisar los tipos exportados por
`@mariozechner/pi-coding-agent`.
2. **Variables de entorno para extensiones**: el mecanismo de pasar `ARCHAGENT_ROLE` via `process.env`
funciona porque las extensiones se cargan en el mismo proceso Node.js. Si Pi cambia a workers aislados,
habrá que usar otro mecanismo de comunicación.
3. **`sendUserMessage` vs UI**: para mostrar el contenido de los artefactos en checkpoints,
`pi.sendUserMessage` con `deliverAs: "followUp"` inyecta el contenido como un mensaje del usuario en la
sesión del Director, que Pi renderiza con su TUI completo (Markdown, syntax highlighting). Es la forma más
simple y más visual.
4. **El Decide Agent y el DDR path**: el `agent-runner.ts` infiere el path del DDR usando `nextDDRNumber() -
1` después de que el Decide Agent termina. Esto es frágil — en v2, el Decide Agent debería escribir el path en
`WORKFLOW_STATE.json`.
5. **Checkpoint Promise**: el mecanismo de `pendingCheckpointResolve` funciona porque el Orchestrator y
los comandos `/arch:approve`/`/arch:reject` viven en la misma extensión. Si se separan en ficheros distintos,
hay que mover el resolver a un módulo compartido de estado.


