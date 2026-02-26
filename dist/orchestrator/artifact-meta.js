"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFencedBlock = extractFencedBlock;
exports.parseJsonBlock = parseJsonBlock;
exports.parseDdrMeta = parseDdrMeta;
exports.parseAuditMeta = parseAuditMeta;
const FENCE_PREFIX = "```";
function extractFencedBlock(content, fence) {
    const pattern = new RegExp(`${escapeRegex(FENCE_PREFIX + fence)}\\s*\\n([\\s\\S]*?)\\n${escapeRegex(FENCE_PREFIX)}`, "m");
    const match = content.match(pattern);
    return match?.[1]?.trim() ?? null;
}
function parseJsonBlock(block) {
    if (!block)
        return null;
    try {
        return JSON.parse(block);
    }
    catch {
        return null;
    }
}
function parseDdrMeta(content) {
    const json = extractFencedBlock(content, "archagent-ddr-meta");
    const meta = parseJsonBlock(json);
    if (!meta)
        return null;
    if (meta.kind !== "ddr")
        return null;
    if (!meta.id || !Array.isArray(meta.authorizedPaths))
        return null;
    return {
        ...meta,
        authorizedPaths: meta.authorizedPaths.map((p) => String(p).trim()).filter(Boolean),
    };
}
function parseAuditMeta(content) {
    const json = extractFencedBlock(content, "archagent-audit-meta");
    const meta = parseJsonBlock(json);
    if (!meta)
        return null;
    if (meta.kind !== "audit")
        return null;
    return meta;
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
