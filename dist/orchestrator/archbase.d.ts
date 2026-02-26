import type { HealthMap, WorkflowState } from "../types";
export declare const paths: {
    root: string;
    knowledge: {
        arch: string;
        archTarget: string;
        patterns: string;
        conventions: string;
        constraints: string;
        vocabulary: string;
    };
    health: {
        map: string;
        debt: string;
        metrics: string;
        zones: (zone: string) => string;
    };
    forensics: {
        archaeology: string;
        intent: string;
        delta: string;
    };
    decisions: {
        dir: string;
        index: string;
        archive: string;
        ddr: (n: number) => string;
    };
    workflow: {
        state: string;
        triage: string;
        auditReport: string;
        archUpdateProposal: string;
        lock: string;
        logsDir: string;
        runLogCurrent: string;
        modifiedFilesCurrent: string;
        actIntentCurrent: string;
    };
    agents: string;
};
export declare function isInitialized(): boolean;
export declare function init(repoName: string): void;
export declare function readHealthMap(): HealthMap | null;
export declare function writeHealthMap(map: HealthMap): void;
export declare function readWorkflowState(): WorkflowState;
export declare function writeWorkflowState(state: WorkflowState): void;
export declare function nextDDRNumber(): number;
export declare function findLatestDDRPath(): string | null;
export declare function archiveDDR(ddrPath: string): void;
export interface ProjectContext {
    constraints: string;
    conventions: string;
    arch: string;
    patterns: string;
    vocabulary: string;
}
export declare function readProjectContext(): ProjectContext;
export declare function readZoneDetail(zone: string): string;
export declare function readActiveDDR(ddrPath: string): string;
export declare function readAuditReport(): string;
export declare function appendDebt(entry: string): void;
export declare function read(filePath: string): string;
export declare function readIfExists(filePath: string): string;
export declare function write(filePath: string, content: string): void;
export declare function exists(filePath: string): boolean;
export declare function refreshAgentsMd(): void;
