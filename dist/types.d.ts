export type HealthStatus = "healthy" | "attention" | "compromised";
export type ConfidenceLevel = "quick" | "deep" | "director-validated";
export interface DimensionProfile {
    status: HealthStatus;
    confidence: ConfidenceLevel;
    lastAnalyzed: string;
    directorOverride?: {
        status: HealthStatus;
        reason: string;
        date: string;
    };
}
export interface ZoneHealth {
    zone: string;
    dimensions: {
        structuralReadability: DimensionProfile;
        testReliability: DimensionProfile;
        impactPredictability: DimensionProfile;
        architecturalAlignment: DimensionProfile;
    };
    lastCommitAnalyzed?: string;
    trend: "improving" | "stable" | "degrading";
}
export interface HealthMap {
    version: "1.0";
    repo: string;
    zones: Record<string, ZoneHealth>;
    updatedAt: string;
}
export type AgentRole = "understand" | "decide" | "act" | "verify";
export type AgentMode = "standard" | "deep" | "incremental" | "characterization";
export interface PipelineStep {
    role: AgentRole;
    mode: AgentMode;
    zone: string;
    objective: string;
    allowedPaths?: string[];
    requiresCheckpoint: boolean;
    checkpointLabel?: string;
}
export interface Pipeline {
    steps: PipelineStep[];
    zone: string;
    objective: string;
}
export type CheckpointDecision = {
    type: "approved";
} | {
    type: "rejected";
    comment: string;
} | {
    type: "more-analysis";
    request: string;
};
export interface WorkflowState {
    status: "idle" | "running" | "waiting-checkpoint" | "completed" | "failed";
    currentObjective?: string;
    currentStep?: number;
    totalSteps?: number;
    currentRole?: AgentRole;
    pendingCheckpoint?: {
        label: string;
        artifactPath: string;
    };
    lastCompletedStep?: number;
    zone?: string;
    activeDDRPath?: string;
    startedAt?: string;
    updatedAt: string;
}
