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
exports.postCycleUpdate = postCycleUpdate;
const ab = __importStar(require("./archbase"));
const health_map_1 = require("./health-map");
const artifact_meta_1 = require("./artifact-meta");
const ddr_index_1 = require("./ddr-index");
/**
 * Applies deterministic updates after a Verify run.
 *
 * - Updates Health Map
 * - Extracts debt
 * - Updates DDR index (only if ddrPath is provided)
 * - Archives and clears the current audit report
 */
function postCycleUpdate(zone, ddrPath) {
    const auditReport = ab.readAuditReport();
    if (!auditReport.trim())
        return;
    const meta = (0, artifact_meta_1.parseAuditMeta)(auditReport);
    (0, health_map_1.updateZoneFromAuditReport)(zone, auditReport, meta);
    extractDebtEntries(auditReport, zone, meta);
    if (ddrPath) {
        markDDRImplemented(ddrPath);
    }
    cleanWorkflowTemp();
}
function extractDebtEntries(report, zone, meta) {
    const date = new Date().toISOString().split("T")[0];
    // Preferred: debt from meta (deterministic)
    const items = meta?.advisories?.map((s) => s.trim()).filter(Boolean) ?? [];
    if (items.length > 0) {
        for (const content of items) {
            const existing = ab.readIfExists(ab.paths.health.debt);
            if (existing.includes(content.slice(0, 60)))
                continue;
            const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit(meta)_\n`;
            ab.appendDebt(entry);
        }
        return;
    }
    // Fallback: legacy marker-based parsing
    const advisoryPattern = /\[ADVISORY\](.*?)(?=\[ADVISORY\]|\[BLOCKING\]|$)/gs;
    const matches = report.matchAll(advisoryPattern);
    for (const match of matches) {
        const content = match[1]?.trim();
        if (!content)
            continue;
        const existing = ab.readIfExists(ab.paths.health.debt);
        if (existing.includes(content.slice(0, 60)))
            continue;
        const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit(legacy)_\n`;
        ab.appendDebt(entry);
    }
}
function markDDRImplemented(ddrPath) {
    // Update DDR header status
    (0, ddr_index_1.setDdrStatus)(ddrPath, "IMPLEMENTED");
    // Update index line
    (0, ddr_index_1.upsertDdrIndex)(ddrPath);
}
function cleanWorkflowTemp() {
    const report = ab.readIfExists(ab.paths.workflow.auditReport);
    if (!report.trim())
        return;
    const date = new Date().toISOString().split("T")[0];
    const archivePath = `archbase/workflow/audit-report-${date}-${Date.now()}.md`;
    ab.write(archivePath, report);
    ab.write(ab.paths.workflow.auditReport, "");
}
