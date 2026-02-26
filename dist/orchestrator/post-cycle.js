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
function postCycleUpdate(zone, ddrPath) {
    const auditReport = ab.readAuditReport();
    if (!auditReport.trim())
        return;
    (0, health_map_1.updateZoneFromAuditReport)(zone, auditReport);
    extractDebtEntries(auditReport, zone);
    markDDRImplemented(ddrPath);
    cleanWorkflowTemp();
}
function extractDebtEntries(report, zone) {
    const advisoryPattern = /\[ADVISORY\](.*?)(?=\[ADVISORY\]|\[BLOCKING\]|$)/gs;
    const matches = report.matchAll(advisoryPattern);
    const date = new Date().toISOString().split("T")[0];
    for (const match of matches) {
        const content = match[1]?.trim();
        if (!content)
            continue;
        const existing = ab.readIfExists(ab.paths.health.debt);
        if (existing.includes(content.slice(0, 60)))
            continue;
        const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit cycle_\n`;
        ab.appendDebt(entry);
    }
}
function markDDRImplemented(ddrPath) {
    const index = ab.readIfExists(ab.paths.decisions.index);
    const filename = ddrPath.split("/").pop() ?? "";
    const updated = index.replace(new RegExp(`(${filename}.*?)(approved)`, "i"), "$1implemented");
    if (updated !== index) {
        ab.write(ab.paths.decisions.index, updated);
    }
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
