import type { AgentRole, CheckpointDecision, PipelineStep } from "../types";
export interface StepTelemetry {
    phase: "start" | "update" | "end";
    role: AgentRole;
    model?: string;
    turns: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens: number;
}
interface RunStepOptions {
    step: PipelineStep;
    activeDDRPath?: string;
    onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>;
    onProgress: (message: string) => void;
    onTelemetry?: (data: StepTelemetry) => void;
}
export declare function runStep(opts: RunStepOptions): Promise<void>;
export {};
