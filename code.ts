import {
  EntryType,
  JournalEntry,
  STORAGE_KEY,
  FILE_KEY_STORAGE,
  parseJournal,
  buildNodeUrl,
  toMarkdown
} from "./logic";

figma.notify("Jot v2.0.0 ready");

const post = (msg: object) => figma.ui.postMessage(msg);
const err = (message: string) => post({ type: "ERROR", message });

function getJournal(): JournalEntry[] {
  return parseJournal(figma.root.getPluginData(STORAGE_KEY));
}

function setJournal(entries: JournalEntry[]) {
  figma.root.setPluginData(STORAGE_KEY, JSON.stringify(entries));
}

function fileKey(): string | undefined {
  return figma.root.getPluginData(FILE_KEY_STORAGE) || undefined;
}

function sendFileKey() {
  post({ type: "FILE_KEY", fileKey: fileKey() || "" });
}

function sendJournal(entries: JournalEntry[]) {
  post({ type: "JOURNAL", entries });
}

function cleanNote(raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim();
  return trimmed || null;
}

function selectionContext() {
  const node = figma.currentPage.selection[0];
  const nodeId = node?.id;
  return {
    nodeId,
    nodeName: node?.name,
    nodeUrl: buildNodeUrl(fileKey(), nodeId),
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name
  };
}

function getPageForNode(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE") current = current.parent;
  return current as PageNode | null;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return (node as any).x !== undefined;
}

figma.showUI(__html__, { width: 360, height: 520 });
sendFileKey();

figma.ui.onmessage = (msg) => {
  if (msg.type === "GET_JOURNAL") {
    sendJournal(getJournal());
    return;
  }

  if (msg.type === "GET_FILE_KEY") {
    sendFileKey();
    return;
  }

  if (msg.type === "SET_FILE_KEY") {
    figma.root.setPluginData(FILE_KEY_STORAGE, msg.fileKey);
    figma.notify("File key saved");
    post({ type: "FILE_KEY", fileKey: msg.fileKey });
    return;
  }

  if (msg.type === "RESIZE") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === "ADD_ENTRY") {
    const note = cleanNote(msg.note);
    if (!note) { err("Write a note first."); return; }

    const entry: JournalEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      type: msg.entryType as EntryType,
      note,
      ...selectionContext()
    };

    const next = [entry, ...getJournal()];
    setJournal(next);
    sendJournal(next);
    figma.notify("Saved to Jot");
    return;
  }

  if (msg.type === "UPDATE_ENTRY") {
    const note = cleanNote(msg.note);
    if (!note) { err("Write a note first."); return; }

    const entries = getJournal();
    const idx = entries.findIndex((e) => e.id === msg.id);
    if (idx === -1) { err("Entry not found."); return; }

    entries[idx] = {
      ...entries[idx],
      type: msg.entryType as EntryType,
      note,
      updatedAt: new Date().toISOString()
    };

    setJournal(entries);
    sendJournal(entries);
    figma.notify("Updated entry");
    return;
  }

  if (msg.type === "DELETE_ENTRY") {
    const next = getJournal().filter((e) => e.id !== msg.id);
    setJournal(next);
    sendJournal(next);
    figma.notify("Deleted entry");
    return;
  }

  if (msg.type === "GO_TO_ENTRY") {
    if (!msg.nodeId) return;

    const node = figma.getNodeById(msg.nodeId);
    if (!node || node.removed) {
      err("Linked layer/frame no longer exists.");
      return;
    }

    const page = getPageForNode(node);
    if (page) figma.currentPage = page;

    if (isSceneNode(node)) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
    return;
  }

  if (msg.type === "EXPORT_MD") {
    post({ type: "EXPORT_MD_RESULT", markdown: toMarkdown(getJournal(), fileKey()) });
    return;
  }
};
