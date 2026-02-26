export interface DdrMeta {
    kind: "ddr";
    id: string;
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
export declare function extractFencedBlock(content: string, fence: string): string | null;
export declare function parseJsonBlock<T>(block: string | null): T | null;
export declare function parseDdrMeta(content: string): DdrMeta | null;
export declare function parseAuditMeta(content: string): AuditMeta | null;
