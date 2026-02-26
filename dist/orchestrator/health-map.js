"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readZoneHealth = readZoneHealth;
exports.updateZoneFromAuditReport = updateZoneFromAuditReport;
exports.markZoneStale = markZoneStale;
exports.isZoneStale = isZoneStale;
const ab = __importStar(require("./archbase"));
function readZoneHealth(zone) {
    const map = ab.readHealthMap();
    if (!map)
        return null;
    return map.zones[zone] ?? null;
}
function updateZoneFromAuditReport(zone, auditReportContent, meta) {
    const map = ab.readHealthMap() ?? {
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
function markZoneStale(zone) {
    const map = ab.readHealthMap();
    if (!map || !map.zones[zone])
        return;
    const z = map.zones[zone];
    for (const dim of Object.values(z.dimensions)) {
        if (dim.confidence === "deep" || dim.confidence === "director-validated") {
            dim.confidence = "quick";
        }
    }
    ab.writeHealthMap(map);
}
function isZoneStale(zone) {
    const health = readZoneHealth(zone);
    if (!health)
        return true;
    const dims = Object.values(health.dimensions);
    return dims.every((d) => {
        const daysOld = daysSince(d.lastAnalyzed);
        return daysOld > 14;
    });
}
function applyAuditReport(current, report, meta) {
    const blockingCount = meta?.blockingCount ??
        (report.match(/^## BLOCKING/gm) ?? []).length + countPattern(report, /\[BLOCKING\]/gi);
    const advisoryCount = meta?.advisoryCount ?? countPattern(report, /\[ADVISORY\]/gi);
    const regressionFailed = meta?.regressionFailed ?? report.includes("[REGRESSION-FAILED]");
    // directionRegression=true means not ok
    const directionOk = meta?.directionRegression != null ? !meta.directionRegression : !report.includes("[DIRECTION-REGRESSION]");
    const updated = {
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
    }
    else if (advisoryCount === 0 && blockingCount === 0) {
        updated.dimensions.testReliability.status = improve(current.dimensions.testReliability.status);
    }
    if (!directionOk) {
        updated.dimensions.architecturalAlignment.status = "attention";
    }
    else if (blockingCount === 0) {
        updated.dimensions.architecturalAlignment.status = improve(current.dimensions.architecturalAlignment.status);
    }
    if (blockingCount === 0 && advisoryCount < 3) {
        updated.dimensions.structuralReadability.status = improve(current.dimensions.structuralReadability.status);
    }
    const prevAvg = averageScore(current);
    const newAvg = averageScore(updated);
    updated.trend = newAvg > prevAvg ? "improving" : newAvg < prevAvg ? "degrading" : "stable";
    const now = new Date().toISOString();
    for (const dim of Object.values(updated.dimensions)) {
        if (!dim.directorOverride) {
            dim.lastAnalyzed = now;
            dim.confidence = "quick";
        }
    }
    return updated;
}
function defaultZoneHealth(zone) {
    const dim = {
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
function improve(s) {
    if (s === "compromised")
        return "attention";
    if (s === "attention")
        return "healthy";
    return "healthy";
}
function statusScore(s) {
    return s === "healthy" ? 2 : s === "attention" ? 1 : 0;
}
function averageScore(z) {
    const dims = Object.values(z.dimensions);
    return dims.reduce((sum, d) => sum + statusScore(d.status), 0) / dims.length;
}
function countPattern(text, pattern) {
    return (text.match(pattern) ?? []).length;
}
function daysSince(isoDate) {
    return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}
