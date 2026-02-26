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
exports.paths = void 0;
exports.isInitialized = isInitialized;
exports.init = init;
exports.readHealthMap = readHealthMap;
exports.writeHealthMap = writeHealthMap;
exports.readWorkflowState = readWorkflowState;
exports.writeWorkflowState = writeWorkflowState;
exports.nextDDRNumber = nextDDRNumber;
exports.findLatestDDRPath = findLatestDDRPath;
exports.archiveDDR = archiveDDR;
exports.readProjectContext = readProjectContext;
exports.readZoneDetail = readZoneDetail;
exports.readActiveDDR = readActiveDDR;
exports.readAuditReport = readAuditReport;
exports.appendDebt = appendDebt;
exports.read = read;
exports.readIfExists = readIfExists;
exports.write = write;
exports.exists = exists;
exports.refreshAgentsMd = refreshAgentsMd;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const ARCHBASE = "archbase";
exports.paths = {
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
        zones: (zone) => `${ARCHBASE}/health/zones/${zone.replace(/\//g, "-")}.md`,
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
        ddr: (n) => `${ARCHBASE}/decisions/DDR-${String(n).padStart(3, "0")}.md`,
    },
    workflow: {
        state: `${ARCHBASE}/workflow/WORKFLOW_STATE.json`,
        triage: `${ARCHBASE}/workflow/TRIAGE.md`,
        auditReport: `${ARCHBASE}/workflow/audit-report-current.md`,
        archUpdateProposal: `${ARCHBASE}/workflow/arch-update-proposal.md`,
        lock: `${ARCHBASE}/workflow/.lock`,
        logsDir: `${ARCHBASE}/workflow/logs`,
        runLogCurrent: `${ARCHBASE}/workflow/logs/run-current.log`,
        modifiedFilesCurrent: `${ARCHBASE}/workflow/logs/modified-files-current.jsonl`,
        actIntentCurrent: `${ARCHBASE}/workflow/act-intent-current.md`,
    },
    agents: `${ARCHBASE}/AGENTS.md`,
};
function isInitialized() {
    return fs.existsSync(exports.paths.workflow.state);
}
function init(repoName) {
    const dirs = [
        `${ARCHBASE}/knowledge`,
        `${ARCHBASE}/health/zones`,
        `${ARCHBASE}/forensics`,
        `${ARCHBASE}/decisions/_archive`,
        `${ARCHBASE}/workflow`,
    ];
    dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
    writeIfNotExists(exports.paths.knowledge.constraints, "# Constraints\n\n<!-- Escribe aquí las restricciones del proyecto -->\n");
    writeIfNotExists(exports.paths.knowledge.conventions, "# Conventions\n\n<!-- Escribe aquí las convenciones del equipo -->\n");
    writeIfNotExists(exports.paths.knowledge.arch, "# Architecture\n\n<!-- Describe la arquitectura actual del sistema -->\n");
    writeIfNotExists(exports.paths.knowledge.patterns, "# Patterns\n\n<!-- Patrones actualmente en uso -->\n");
    writeIfNotExists(exports.paths.knowledge.vocabulary, "# Vocabulary\n\n<!-- Lenguaje ubicuo / términos de dominio -->\n");
    writeIfNotExists(exports.paths.health.debt, "# Technical Debt\n");
    writeIfNotExists(exports.paths.health.metrics, "# Architecture Metrics\n");
    writeIfNotExists(exports.paths.decisions.index, "# DDR Index\n");
    writeIfNotExists(exports.paths.workflow.auditReport, "");
    writeIfNotExists(exports.paths.workflow.actIntentCurrent, "# Act Intent Log\n\n");
    writeIfNotExists(exports.paths.workflow.runLogCurrent, "");
    writeIfNotExists(exports.paths.workflow.modifiedFilesCurrent, "");
    if (!exists(exports.paths.workflow.state)) {
        writeWorkflowState({
            status: "idle",
            updatedAt: new Date().toISOString(),
        });
    }
    if (!exists(exports.paths.health.map)) {
        const initialMap = {
            version: "1.0",
            repo: repoName,
            zones: {},
            updatedAt: new Date().toISOString(),
        };
        writeHealthMap(initialMap);
    }
    if (!exists(exports.paths.agents)) {
        const agentsContent = `# ArchAgent Project Context

This project uses ArchAgent for architecture-aware AI assistance.
For full capabilities, use the /arch:task command to launch the pipeline.
If using Pi directly, the constraints and conventions below apply.

---

## Constraints
${readIfExists(exports.paths.knowledge.constraints)}

## Conventions
${readIfExists(exports.paths.knowledge.conventions)}
`;
        write(exports.paths.agents, agentsContent);
    }
}
function readHealthMap() {
    if (!fs.existsSync(exports.paths.health.map))
        return null;
    return JSON.parse(fs.readFileSync(exports.paths.health.map, "utf-8"));
}
function writeHealthMap(map) {
    map.updatedAt = new Date().toISOString();
    write(exports.paths.health.map, JSON.stringify(map, null, 2));
}
function readWorkflowState() {
    if (!fs.existsSync(exports.paths.workflow.state)) {
        return { status: "idle", updatedAt: new Date().toISOString() };
    }
    return JSON.parse(fs.readFileSync(exports.paths.workflow.state, "utf-8"));
}
function writeWorkflowState(state) {
    state.updatedAt = new Date().toISOString();
    write(exports.paths.workflow.state, JSON.stringify(state, null, 2));
}
function nextDDRNumber() {
    const dir = exports.paths.decisions.dir;
    if (!fs.existsSync(dir))
        return 1;
    const files = fs.readdirSync(dir).filter((f) => /^DDR-\d+\.md$/.test(f));
    if (files.length === 0)
        return 1;
    const nums = files.map((f) => Number.parseInt(f.match(/\d+/)?.[0] ?? "1", 10));
    return Math.max(...nums) + 1;
}
function findLatestDDRPath() {
    const dir = exports.paths.decisions.dir;
    if (!fs.existsSync(dir))
        return null;
    const files = fs
        .readdirSync(dir)
        .filter((f) => /^DDR-\d+\.md$/.test(f))
        .map((f) => ({
        file: f,
        mtimeMs: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (files.length === 0)
        return null;
    return path.join(dir, files[0].file);
}
function archiveDDR(ddrPath) {
    const filename = path.basename(ddrPath);
    const dest = `${exports.paths.decisions.archive}/${filename}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(ddrPath, dest);
}
function readProjectContext() {
    return {
        constraints: readIfExists(exports.paths.knowledge.constraints),
        conventions: readIfExists(exports.paths.knowledge.conventions),
        arch: readIfExists(exports.paths.knowledge.arch),
        patterns: readIfExists(exports.paths.knowledge.patterns),
        vocabulary: readIfExists(exports.paths.knowledge.vocabulary),
    };
}
function readZoneDetail(zone) {
    return readIfExists(exports.paths.health.zones(zone));
}
function readActiveDDR(ddrPath) {
    return readIfExists(ddrPath);
}
function readAuditReport() {
    return readIfExists(exports.paths.workflow.auditReport);
}
function appendDebt(entry) {
    const current = readIfExists(exports.paths.health.debt);
    write(exports.paths.health.debt, current + "\n" + entry);
}
function read(filePath) {
    return fs.readFileSync(filePath, "utf-8");
}
function readIfExists(filePath) {
    if (!fs.existsSync(filePath))
        return "";
    return fs.readFileSync(filePath, "utf-8");
}
function write(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
}
function writeIfNotExists(filePath, content) {
    if (!fs.existsSync(filePath))
        write(filePath, content);
}
function exists(filePath) {
    return fs.existsSync(filePath);
}
function refreshAgentsMd() {
    const ctx = readProjectContext();
    const content = `# ArchAgent Project Context\n\n## Constraints\n${ctx.constraints}\n\n## Conventions\n${ctx.conventions}\n`;
    write(exports.paths.agents, content);
}
