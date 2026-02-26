"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDdrHeader = parseDdrHeader;
exports.setDdrStatus = setDdrStatus;
exports.upsertDdrIndex = upsertDdrIndex;
const ab = __importStar(require("./archbase"));
function parseDdrHeader(content) {
    const lines = content.split("\n").map((l) => l.trim());
    const first = lines.find((l) => l.startsWith("DDR-"));
    const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));
    const dateLine = lines.find((l) => l.toLowerCase().startsWith("date:"));
    const zoneLine = lines.find((l) => l.toLowerCase().startsWith("zone:"));
    if (!first || !statusLine)
        return null;
    const id = first.split(":")[0].trim();
    const title = first.includes(":") ? first.split(":").slice(1).join(":").trim() : "";
    const statusRaw = statusLine.split(":").slice(1).join(":").trim().toUpperCase();
    const status = statusRaw ?? "DRAFT";
    return {
        id,
        title,
        status,
        date: dateLine ? dateLine.split(":").slice(1).join(":").trim() : undefined,
        zone: zoneLine ? zoneLine.split(":").slice(1).join(":").trim() : undefined,
    };
}
function setDdrStatus(ddrPath, status) {
    const content = ab.readIfExists(ddrPath);
    if (!content.trim())
        return;
    const updated = content.replace(/^Status:\s*.*$/m, `Status: ${status}`);
    if (updated !== content) {
        ab.write(ddrPath, updated);
    }
}
function upsertDdrIndex(ddrPath) {
    const content = ab.readIfExists(ddrPath);
    const info = parseDdrHeader(content);
    if (!info)
        return;
    const indexPath = ab.paths.decisions.index;
    const index = ab.readIfExists(indexPath) || "# DDR Index\n";
    const filename = ddrPath.split("/").pop() ?? ddrPath;
    const line = `- ${filename} | ${info.status.toLowerCase()} | ${info.zone ?? "-"} | ${info.title || "-"}`;
    const lines = index.split("\n");
    const existingIdx = lines.findIndex((l) => l.includes(filename));
    if (existingIdx >= 0) {
        lines[existingIdx] = line;
    }
    else {
        // append after header
        const insertAt = Math.max(1, lines.findIndex((l) => l.trim() === "") + 1);
        lines.splice(insertAt, 0, line);
    }
    ab.write(indexPath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}
