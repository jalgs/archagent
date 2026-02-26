/**
 * Applies deterministic updates after a Verify run.
 *
 * - Updates Health Map
 * - Extracts debt
 * - Updates DDR index (only if ddrPath is provided)
 * - Archives and clears the current audit report
 */
export declare function postCycleUpdate(zone: string, ddrPath?: string): void;
