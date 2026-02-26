import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
export type DirectorAction = {
    type: "none";
} | {
    type: "help";
} | {
    type: "init";
} | {
    type: "task";
    zone: string;
    objective: string;
} | {
    type: "review";
    zone: string;
} | {
    type: "status";
} | {
    type: "resume";
} | {
    type: "abort";
} | {
    type: "approve";
} | {
    type: "reject";
    comment: string;
} | {
    type: "more-analysis";
    request: string;
};
export interface DirectorResponse {
    reply: string;
    action: DirectorAction;
}
export declare class DirectorInterface {
    private session;
    interpret(userText: string, ctx: ExtensionContext): Promise<DirectorResponse>;
    private getOrCreateSession;
}
