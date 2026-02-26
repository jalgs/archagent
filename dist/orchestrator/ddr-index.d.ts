export type DdrLifecycleStatus = "DRAFT" | "APPROVED" | "IMPLEMENTED" | "REJECTED";
export interface DdrHeaderInfo {
    id: string;
    title: string;
    status: DdrLifecycleStatus;
    date?: string;
    zone?: string;
}
export declare function parseDdrHeader(content: string): DdrHeaderInfo | null;
export declare function setDdrStatus(ddrPath: string, status: DdrLifecycleStatus): void;
export declare function upsertDdrIndex(ddrPath: string): void;
