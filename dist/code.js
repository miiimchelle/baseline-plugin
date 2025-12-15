"use strict";
// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.
// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).
figma.notify("Baseline TS compiled ✅");
const STORAGE_KEY = "baseline.journal.v1";
function getJournal() {
    const raw = figma.root.getPluginData(STORAGE_KEY);
    if (!raw)
        return [];
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        return [];
    }
}
function setJournal(entries) {
    figma.root.setPluginData(STORAGE_KEY, JSON.stringify(entries));
}
function getSelectionContext() {
    const node = figma.currentPage.selection[0];
    return {
        nodeId: node === null || node === void 0 ? void 0 : node.id,
        nodeName: node === null || node === void 0 ? void 0 : node.name,
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name
    };
}
figma.showUI(__html__, { width: 360, height: 520 });
figma.ui.onmessage = (msg) => {
    if (msg.type === "GET_JOURNAL") {
        figma.ui.postMessage({ type: "JOURNAL", entries: getJournal() });
        return;
    }
    if (msg.type === "ADD_ENTRY") {
        const { entryType, note } = msg;
        const ctx = getSelectionContext();
        const entry = Object.assign({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString(), type: entryType, note: String(note !== null && note !== void 0 ? note : "").trim() }, ctx);
        if (!entry.note) {
            figma.ui.postMessage({ type: "ERROR", message: "Write a note first." });
            return;
        }
        const next = [entry, ...getJournal()];
        setJournal(next);
        figma.ui.postMessage({ type: "JOURNAL", entries: next });
        figma.notify("Saved to Baseline");
        return;
    }
    if (msg.type === "FILTER_BY_SELECTION") {
        const ctx = getSelectionContext();
        const entries = getJournal();
        const filtered = ctx.nodeId
            ? entries.filter((e) => e.nodeId === ctx.nodeId)
            : [];
        figma.ui.postMessage({ type: "SELECTION_ENTRIES", entries: filtered, ctx });
        return;
    }
    if (msg.type === "EXPORT_MD") {
        const entries = getJournal();
        const md = toMarkdown(entries);
        figma.ui.postMessage({ type: "EXPORT_MD_RESULT", markdown: md });
        return;
    }
    if (msg.type === "CLEAR_ALL") {
        setJournal([]);
        figma.ui.postMessage({ type: "JOURNAL", entries: [] });
        figma.notify("Baseline cleared");
        return;
    }
};
function toMarkdown(entries) {
    const lines = [];
    lines.push(`# Baseline — design decision journal`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(``);
    for (const e of entries) {
        const when = new Date(e.createdAt).toLocaleString();
        const where = e.nodeName && e.pageName ? `(${e.pageName} → ${e.nodeName})` :
            e.pageName ? `(${e.pageName})` :
                ``;
        lines.push(`## ${e.type} — ${when} ${where}`.trim());
        lines.push(e.note);
        lines.push(``);
    }
    return lines.join("\n");
}
