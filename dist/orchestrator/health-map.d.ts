import type { ZoneHealth } from "../types";
import type { AuditMeta } from "./artifact-meta";
export declare function readZoneHealth(zone: string): ZoneHealth | null;
export declare function updateZoneFromAuditReport(zone: string, auditReportContent: string, meta?: AuditMeta | null): void;
export declare function markZoneStale(zone: string): void;
export declare function isZoneStale(zone: string): boolean;
