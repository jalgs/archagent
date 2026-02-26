import type { AgentMode, AgentRole, ZoneHealth } from "../types";
interface AssembleOptions {
    role: AgentRole;
    mode: AgentMode;
    zone: string;
    objective: string;
    zoneHealth?: ZoneHealth;
    activeDDRPath?: string;
}
export declare function assembleContext(opts: AssembleOptions): string;
export {};
