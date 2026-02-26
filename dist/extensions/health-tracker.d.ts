import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
/**
 * NOTE: Health Map updates are handled deterministically by the Orchestrator
 * in postCycleUpdate().
 *
 * This extension is kept as a lightweight signal only.
 */
export default function healthTracker(pi: ExtensionAPI): void;
