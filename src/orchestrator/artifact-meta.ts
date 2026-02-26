export interface DdrMeta {
  kind: "ddr";
  id: string; // e.g. DDR-001
  title?: string;
  zone?: string;
  /**
   * Paths (globs allowed) that the Act agent is allowed to modify.
   * These should be relative to repo root.
   */
  authorizedPaths: string[];
}

export interface AuditMeta {
  kind: "audit";
  ddrId?: string;
  zone?: string;
  verdict?: "APPROVED" | "APPROVED WITH ADVISORIES" | "REJECTED";
  blockingCount?: number;
  advisoryCount?: number;
  regressionFailed?: boolean;
  directionRegression?: boolean;
  /** Free-form advisory items to be recorded as debt by the orchestrator. */
  advisories?: string[];
}

export type ArtifactMeta = DdrMeta | AuditMeta;

const FENCE_PREFIX = "```";

export function extractFencedBlock(content: string, fence: string): string | null {
  const pattern = new RegExp(`${escapeRegex(FENCE_PREFIX + fence)}\\s*\\n([\\s\\S]*?)\\n${escapeRegex(FENCE_PREFIX)}`, "m");
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function parseJsonBlock<T>(block: string | null): T | null {
  if (!block) return null;
  try {
    return JSON.parse(block) as T;
  } catch {
    return null;
  }
}

export function parseDdrMeta(content: string): DdrMeta | null {
  const json = extractFencedBlock(content, "archagent-ddr-meta");
  const meta = parseJsonBlock<DdrMeta>(json);
  if (!meta) return null;
  if (meta.kind !== "ddr") return null;
  if (!meta.id || !Array.isArray(meta.authorizedPaths)) return null;
  return {
    ...meta,
    authorizedPaths: meta.authorizedPaths.map((p) => String(p).trim()).filter(Boolean),
  };
}

export function parseAuditMeta(content: string): AuditMeta | null {
  const json = extractFencedBlock(content, "archagent-audit-meta");
  const meta = parseJsonBlock<AuditMeta>(json);
  if (!meta) return null;
  if (meta.kind !== "audit") return null;
  return meta;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
