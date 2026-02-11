import {
  EntryType,
  JournalEntry,
  STORAGE_KEY,
  FILE_KEY_STORAGE,
  parseJournal,
  buildNodeUrl,
  toMarkdown,
  cleanNote,
  generateEntryId,
} from "./logic";

figma.notify("Jot v2.0.0 ready");

const post = (msg: object) => figma.ui.postMessage(msg);
const err = (message: string) => post({ type: "ERROR", message });

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Figma-specific helpers
// ---------------------------------------------------------------------------

function selectionContext() {
  const node = figma.currentPage.selection[0];
  const nodeId = node?.id;
  return {
    nodeId,
    nodeName: node?.name,
    nodeUrl: buildNodeUrl(fileKey(), nodeId),
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
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

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handleGetJournal() {
  sendJournal(getJournal());
}

function handleGetFileKey() {
  sendFileKey();
}

function handleSetFileKey(msg: { fileKey: string }) {
  figma.root.setPluginData(FILE_KEY_STORAGE, msg.fileKey);
  figma.notify("File key saved");
  post({ type: "FILE_KEY", fileKey: msg.fileKey });
}

function handleResize(msg: { width: number; height: number }) {
  figma.ui.resize(msg.width, msg.height);
}

function handleAddEntry(msg: { entryType: string; note: unknown }) {
  const note = cleanNote(msg.note);
  if (!note) { err("Write a note first."); return; }

  const entry: JournalEntry = {
    id: generateEntryId(),
    createdAt: new Date().toISOString(),
    type: msg.entryType as EntryType,
    note,
    ...selectionContext(),
  };

  const next = [entry, ...getJournal()];
  setJournal(next);
  sendJournal(next);
  figma.notify("Saved to Jot");
}

function handleUpdateEntry(msg: { id: string; entryType: string; note: unknown }) {
  const note = cleanNote(msg.note);
  if (!note) { err("Write a note first."); return; }

  const entries = getJournal();
  const idx = entries.findIndex((e) => e.id === msg.id);
  if (idx === -1) { err("Entry not found."); return; }

  entries[idx] = {
    ...entries[idx],
    type: msg.entryType as EntryType,
    note,
    updatedAt: new Date().toISOString(),
  };

  setJournal(entries);
  sendJournal(entries);
  figma.notify("Updated entry");
}

function handleDeleteEntry(msg: { id: string }) {
  const next = getJournal().filter((e) => e.id !== msg.id);
  setJournal(next);
  sendJournal(next);
  figma.notify("Deleted entry");
}

function handleGoToEntry(msg: { nodeId?: string }) {
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
}

function handleExportMd() {
  post({ type: "EXPORT_MD_RESULT", markdown: toMarkdown(getJournal(), fileKey()) });
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

const handlers: Record<string, (msg: any) => void> = {
  GET_JOURNAL: handleGetJournal,
  GET_FILE_KEY: handleGetFileKey,
  SET_FILE_KEY: handleSetFileKey,
  RESIZE: handleResize,
  ADD_ENTRY: handleAddEntry,
  UPDATE_ENTRY: handleUpdateEntry,
  DELETE_ENTRY: handleDeleteEntry,
  GO_TO_ENTRY: handleGoToEntry,
  EXPORT_MD: handleExportMd,
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

figma.showUI(__html__, { width: 360, height: 520 });
sendFileKey();

figma.ui.onmessage = (msg) => {
  const handler = handlers[msg.type];
  if (handler) handler(msg);
};
