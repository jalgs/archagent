"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePipeline = configurePipeline;
exports.expectedDDRPathForCurrentRun = expectedDDRPathForCurrentRun;
const archbase_1 = require("./archbase");
const health_map_1 = require("./health-map");
function configurePipeline(zone, objective) {
    const health = (0, health_map_1.readZoneHealth)(zone);
    if (!health) {
        return bootstrapPipeline(zone, objective);
    }
    const dims = health.dimensions;
    const testsCompromised = dims.testReliability.status === "compromised";
    const alignmentCompromised = dims.architecturalAlignment.status === "compromised";
    const readabilityCompromised = dims.structuralReadability.status === "compromised";
    const impactCompromised = dims.impactPredictability.status === "compromised";
    const steps = [];
    const ddrNumber = (0, archbase_1.nextDDRNumber)();
    steps.push({
        role: "understand",
        mode: readabilityCompromised || impactCompromised ? "deep" : "standard",
        zone,
        objective: `Analyze zone "${zone}" for objective: ${objective}`,
        requiresCheckpoint: readabilityCompromised || impactCompromised,
        checkpointLabel: readabilityCompromised ? "Review deep analysis before proceeding" : undefined,
    });
    if (testsCompromised) {
        steps.push({
            role: "act",
            mode: "characterization",
            zone,
            objective: `Write characterization tests capturing current behavior in zone "${zone}"`,
            allowedPaths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/test/**", "**/__tests__/**"],
            requiresCheckpoint: true,
            checkpointLabel: "Review characterization test coverage before proceeding",
        });
    }
    steps.push({
        role: "decide",
        mode: alignmentCompromised ? "incremental" : "standard",
        zone,
        objective,
        requiresCheckpoint: true,
        checkpointLabel: `Review and approve DDR-${String(ddrNumber).padStart(3, "0")}`,
    });
    steps.push({
        role: "act",
        mode: "standard",
        zone,
        objective,
        allowedPaths: undefined,
        requiresCheckpoint: false,
    });
    steps.push({
        role: "verify",
        mode: "standard",
        zone,
        objective,
        requiresCheckpoint: true,
        checkpointLabel: "Review Audit Report",
    });
    return { steps, zone, objective };
}
function bootstrapPipeline(zone, objective) {
    return {
        zone,
        objective,
        steps: [
            {
                role: "understand",
                mode: "standard",
                zone,
                objective: `Initial analysis of zone "${zone}"`,
                requiresCheckpoint: true,
                checkpointLabel: "Review initial ARCH.md before proceeding",
            },
            {
                role: "decide",
                mode: "standard",
                zone,
                objective,
                requiresCheckpoint: true,
                checkpointLabel: "Review and approve DDR",
            },
            {
                role: "act",
                mode: "standard",
                zone,
                objective,
                requiresCheckpoint: false,
            },
            {
                role: "verify",
                mode: "standard",
                zone,
                objective,
                requiresCheckpoint: true,
                checkpointLabel: "Review Audit Report",
            },
        ],
    };
}
function expectedDDRPathForCurrentRun() {
    return archbase_1.paths.decisions.ddr((0, archbase_1.nextDDRNumber)());
}
