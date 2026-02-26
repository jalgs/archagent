import type { CheckpointDecision, PipelineStep } from "../types";
interface RunStepOptions {
    step: PipelineStep;
    activeDDRPath?: string;
    onCheckpoint: (label: string, artifactPath: string) => Promise<CheckpointDecision>;
    onProgress: (message: string) => void;
}
export declare function runStep(opts: RunStepOptions): Promise<void>;
export {};
