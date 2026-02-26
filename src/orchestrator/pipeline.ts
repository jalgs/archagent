import type { Pipeline, PipelineStep } from "../types";
import { nextDDRNumber, paths } from "./archbase";
import { readZoneHealth } from "./health-map";

export function configurePipeline(zone: string, objective: string): Pipeline {
  const health = readZoneHealth(zone);

  if (!health) {
    return bootstrapPipeline(zone, objective);
  }

  const dims = health.dimensions;
  const testsCompromised = dims.testReliability.status === "compromised";
  const alignmentCompromised = dims.architecturalAlignment.status === "compromised";
  const readabilityCompromised = dims.structuralReadability.status === "compromised";
  const impactCompromised = dims.impactPredictability.status === "compromised";

  const steps: PipelineStep[] = [];
  const ddrNumber = nextDDRNumber();

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

function bootstrapPipeline(zone: string, objective: string): Pipeline {
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

export function expectedDDRPathForCurrentRun(): string {
  return paths.decisions.ddr(nextDDRNumber());
}
