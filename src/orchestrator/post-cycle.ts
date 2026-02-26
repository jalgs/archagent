import * as ab from "./archbase";
import { updateZoneFromAuditReport } from "./health-map";
import { parseAuditMeta } from "./artifact-meta";
import { setDdrStatus, upsertDdrIndex } from "./ddr-index";

/**
 * Applies deterministic updates after a Verify run.
 *
 * - Updates Health Map
 * - Extracts debt
 * - Updates DDR index (only if ddrPath is provided)
 * - Archives and clears the current audit report
 */
export function postCycleUpdate(zone: string, ddrPath?: string): void {
  const auditReport = ab.readAuditReport();
  if (!auditReport.trim()) return;

  const meta = parseAuditMeta(auditReport);

  updateZoneFromAuditReport(zone, auditReport, meta);
  extractDebtEntries(auditReport, zone, meta);
  if (ddrPath) {
    markDDRImplemented(ddrPath);
  }
  cleanWorkflowTemp();
}

function extractDebtEntries(report: string, zone: string, meta: ReturnType<typeof parseAuditMeta>): void {
  const date = new Date().toISOString().split("T")[0];

  // Preferred: debt from meta (deterministic)
  const items = meta?.advisories?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (items.length > 0) {
    for (const content of items) {
      const existing = ab.readIfExists(ab.paths.health.debt);
      if (existing.includes(content.slice(0, 60))) continue;
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
    if (!content) continue;

    const existing = ab.readIfExists(ab.paths.health.debt);
    if (existing.includes(content.slice(0, 60))) continue;

    const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit(legacy)_\n`;
    ab.appendDebt(entry);
  }
}

function markDDRImplemented(ddrPath: string): void {
  // Update DDR header status
  setDdrStatus(ddrPath, "IMPLEMENTED");

  // Update index line
  upsertDdrIndex(ddrPath);
}

function cleanWorkflowTemp(): void {
  const report = ab.readIfExists(ab.paths.workflow.auditReport);
  if (!report.trim()) return;

  const date = new Date().toISOString().split("T")[0];
  const archivePath = `archbase/workflow/audit-report-${date}-${Date.now()}.md`;
  ab.write(archivePath, report);
  ab.write(ab.paths.workflow.auditReport, "");
}
