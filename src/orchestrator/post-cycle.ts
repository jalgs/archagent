import * as ab from "./archbase";
import { updateZoneFromAuditReport } from "./health-map";

export function postCycleUpdate(zone: string, ddrPath: string): void {
  const auditReport = ab.readAuditReport();
  if (!auditReport.trim()) return;

  updateZoneFromAuditReport(zone, auditReport);
  extractDebtEntries(auditReport, zone);
  markDDRImplemented(ddrPath);
  cleanWorkflowTemp();
}

function extractDebtEntries(report: string, zone: string): void {
  const advisoryPattern = /\[ADVISORY\](.*?)(?=\[ADVISORY\]|\[BLOCKING\]|$)/gs;
  const matches = report.matchAll(advisoryPattern);
  const date = new Date().toISOString().split("T")[0];

  for (const match of matches) {
    const content = match[1]?.trim();
    if (!content) continue;

    const existing = ab.readIfExists(ab.paths.health.debt);
    if (existing.includes(content.slice(0, 60))) continue;

    const entry = `\n## [OPEN] ${date} — ${zone}\n${content}\n_Source: audit cycle_\n`;
    ab.appendDebt(entry);
  }
}

function markDDRImplemented(ddrPath: string): void {
  const index = ab.readIfExists(ab.paths.decisions.index);
  const filename = ddrPath.split("/").pop() ?? "";
  const updated = index.replace(new RegExp(`(${filename}.*?)(approved)`, "i"), "$1implemented");
  if (updated !== index) {
    ab.write(ab.paths.decisions.index, updated);
  }
}

function cleanWorkflowTemp(): void {
  const report = ab.readIfExists(ab.paths.workflow.auditReport);
  if (!report.trim()) return;

  const date = new Date().toISOString().split("T")[0];
  const archivePath = `archbase/workflow/audit-report-${date}-${Date.now()}.md`;
  ab.write(archivePath, report);
  ab.write(ab.paths.workflow.auditReport, "");
}
