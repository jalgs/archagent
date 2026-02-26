import * as ab from "./archbase";

export type DdrLifecycleStatus = "DRAFT" | "APPROVED" | "IMPLEMENTED" | "REJECTED";

export interface DdrHeaderInfo {
  id: string; // DDR-001
  title: string;
  status: DdrLifecycleStatus;
  date?: string;
  zone?: string;
}

export function parseDdrHeader(content: string): DdrHeaderInfo | null {
  const lines = content.split("\n").map((l) => l.trim());
  const first = lines.find((l) => l.startsWith("DDR-"));
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));
  const dateLine = lines.find((l) => l.toLowerCase().startsWith("date:"));
  const zoneLine = lines.find((l) => l.toLowerCase().startsWith("zone:"));

  if (!first || !statusLine) return null;

  const id = first.split(":")[0]!.trim();
  const title = first.includes(":") ? first.split(":").slice(1).join(":").trim() : "";
  const statusRaw = statusLine.split(":").slice(1).join(":").trim().toUpperCase();
  const status = (statusRaw as DdrLifecycleStatus) ?? "DRAFT";

  return {
    id,
    title,
    status,
    date: dateLine ? dateLine.split(":").slice(1).join(":").trim() : undefined,
    zone: zoneLine ? zoneLine.split(":").slice(1).join(":").trim() : undefined,
  };
}

export function setDdrStatus(ddrPath: string, status: DdrLifecycleStatus): void {
  const content = ab.readIfExists(ddrPath);
  if (!content.trim()) return;

  const updated = content.replace(/^Status:\s*.*$/m, `Status: ${status}`);
  if (updated !== content) {
    ab.write(ddrPath, updated);
  }
}

export function upsertDdrIndex(ddrPath: string): void {
  const content = ab.readIfExists(ddrPath);
  const info = parseDdrHeader(content);
  if (!info) return;

  const indexPath = ab.paths.decisions.index;
  const index = ab.readIfExists(indexPath) || "# DDR Index\n";

  const filename = ddrPath.split("/").pop() ?? ddrPath;
  const line = `- ${filename} | ${info.status.toLowerCase()} | ${info.zone ?? "-"} | ${info.title || "-"}`;

  const lines = index.split("\n");
  const existingIdx = lines.findIndex((l) => l.includes(filename));
  if (existingIdx >= 0) {
    lines[existingIdx] = line;
  } else {
    // append after header
    const insertAt = Math.max(1, lines.findIndex((l) => l.trim() === "") + 1);
    lines.splice(insertAt, 0, line);
  }

  ab.write(indexPath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}
