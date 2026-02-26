import type { ZoneHealth } from "../types";
export declare function readZoneHealth(zone: string): ZoneHealth | null;
export declare function updateZoneFromAuditReport(zone: string, auditReportContent: string): void;
export declare function markZoneStale(zone: string): void;
export declare function isZoneStale(zone: string): boolean;
