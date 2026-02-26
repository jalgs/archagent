import * as ab from "./archbase";
import type { DimensionProfile, HealthMap, HealthStatus, ZoneHealth } from "../types";
import type { AuditMeta } from "./artifact-meta";

export function readZoneHealth(zone: string): ZoneHealth | null {
  const map = ab.readHealthMap();
  if (!map) return null;
  return map.zones[zone] ?? null;
}

export function updateZoneFromAuditReport(zone: string, auditReportContent: string, meta?: AuditMeta | null): void {
  const map: HealthMap =
    ab.readHealthMap() ?? {
      version: "1.0",
      repo: zone,
      zones: {},
      updatedAt: new Date().toISOString(),
    };

  const current = map.zones[zone] ?? defaultZoneHealth(zone);
  const updated = applyAuditReport(current, auditReportContent, meta ?? undefined);
  map.zones[zone] = updated;
  ab.writeHealthMap(map);
}

export function markZoneStale(zone: string): void {
  const map = ab.readHealthMap();
  if (!map || !map.zones[zone]) return;

  const z = map.zones[zone];
  for (const dim of Object.values(z.dimensions) as DimensionProfile[]) {
    if (dim.confidence === "deep" || dim.confidence === "director-validated") {
      dim.confidence = "quick";
    }
  }
  ab.writeHealthMap(map);
}

export function isZoneStale(zone: string): boolean {
  const health = readZoneHealth(zone);
  if (!health) return true;

  const dims = Object.values(health.dimensions) as DimensionProfile[];
  return dims.every((d) => {
    const daysOld = daysSince(d.lastAnalyzed);
    return daysOld > 14;
  });
}

function applyAuditReport(current: ZoneHealth, report: string, meta?: import("./artifact-meta").AuditMeta): ZoneHealth {
  const blockingCount =
    meta?.blockingCount ??
    (report.match(/^## BLOCKING/gm) ?? []).length + countPattern(report, /\[BLOCKING\]/gi);

  const advisoryCount = meta?.advisoryCount ?? countPattern(report, /\[ADVISORY\]/gi);

  const regressionFailed = meta?.regressionFailed ?? report.includes("[REGRESSION-FAILED]");

  // directionRegression=true means not ok
  const directionOk = meta?.directionRegression != null ? !meta.directionRegression : !report.includes("[DIRECTION-REGRESSION]");

  const updated: ZoneHealth = {
    ...current,
    dimensions: {
      structuralReadability: { ...current.dimensions.structuralReadability },
      testReliability: { ...current.dimensions.testReliability },
      impactPredictability: { ...current.dimensions.impactPredictability },
      architecturalAlignment: { ...current.dimensions.architecturalAlignment },
    },
  };

  if (regressionFailed) {
    updated.dimensions.testReliability.status = "compromised";
  } else if (advisoryCount === 0 && blockingCount === 0) {
    updated.dimensions.testReliability.status = improve(current.dimensions.testReliability.status);
  }

  if (!directionOk) {
    updated.dimensions.architecturalAlignment.status = "attention";
  } else if (blockingCount === 0) {
    updated.dimensions.architecturalAlignment.status = improve(current.dimensions.architecturalAlignment.status);
  }

  if (blockingCount === 0 && advisoryCount < 3) {
    updated.dimensions.structuralReadability.status = improve(current.dimensions.structuralReadability.status);
  }

  const prevAvg = averageScore(current);
  const newAvg = averageScore(updated);
  updated.trend = newAvg > prevAvg ? "improving" : newAvg < prevAvg ? "degrading" : "stable";

  const now = new Date().toISOString();
  for (const dim of Object.values(updated.dimensions) as DimensionProfile[]) {
    if (!dim.directorOverride) {
      dim.lastAnalyzed = now;
      dim.confidence = "quick";
    }
  }

  return updated;
}

function defaultZoneHealth(zone: string): ZoneHealth {
  const dim: DimensionProfile = {
    status: "attention",
    confidence: "quick",
    lastAnalyzed: new Date().toISOString(),
  };

  return {
    zone,
    dimensions: {
      structuralReadability: { ...dim },
      testReliability: { ...dim },
      impactPredictability: { ...dim },
      architecturalAlignment: { ...dim },
    },
    trend: "stable",
  };
}

function improve(s: HealthStatus): HealthStatus {
  if (s === "compromised") return "attention";
  if (s === "attention") return "healthy";
  return "healthy";
}

function statusScore(s: HealthStatus): number {
  return s === "healthy" ? 2 : s === "attention" ? 1 : 0;
}

function averageScore(z: ZoneHealth): number {
  const dims = Object.values(z.dimensions) as DimensionProfile[];
  return dims.reduce((sum, d) => sum + statusScore(d.status), 0) / dims.length;
}

function countPattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}
