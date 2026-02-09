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

function getJournal(): JournalEntry[] {
  return parseJournal(figma.root.getPluginData(STORAGE_KEY));
}

function setJournal(entries: JournalEntry[]) {
  figma.root.setPluginData(STORAGE_KEY, JSON.stringify(entries));
}

function getStoredFileKey(): string | undefined {
  const val = figma.root.getPluginData(FILE_KEY_STORAGE);
  return val || undefined;
}

function setStoredFileKey(key: string) {
  figma.root.setPluginData(FILE_KEY_STORAGE, key);
}

function getSelectionContext() {
  const node = figma.currentPage.selection[0];
  const nodeId = node?.id;

  return {
    nodeId,
    nodeName: node?.name,
    nodeUrl: buildNodeUrl(getStoredFileKey(), nodeId),
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name
  };
}

function getPageForNode(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== "PAGE") {
    current = current.parent;
  }
  return current && current.type === "PAGE" ? (current as PageNode) : null;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return (node as any).x !== undefined;
}

figma.showUI(__html__, { width: 360, height: 520 });

// Send stored file key to UI on launch
figma.ui.postMessage({ type: "FILE_KEY", fileKey: getStoredFileKey() || "" });

figma.ui.onmessage = (msg) => {
  if (msg.type === "GET_JOURNAL") {
    figma.ui.postMessage({ type: "JOURNAL", entries: getJournal() });
    return;
  }

  if (msg.type === "GET_FILE_KEY") {
    figma.ui.postMessage({ type: "FILE_KEY", fileKey: getStoredFileKey() || "" });
    return;
  }

  if (msg.type === "SET_FILE_KEY") {
    const { fileKey } = msg as { fileKey: string };
    setStoredFileKey(fileKey);
    figma.notify("File key saved");
    figma.ui.postMessage({ type: "FILE_KEY", fileKey });
    return;
  }

  if (msg.type === "RESIZE") {
    const { width, height } = msg as { width: number; height: number };
    figma.ui.resize(width, height);
    return;
  }

  if (msg.type === "ADD_ENTRY") {
    const { entryType, note } = msg as { entryType: EntryType; note: string };

    const cleanNote = String(note ?? "").trim();
    if (!cleanNote) {
      figma.ui.postMessage({ type: "ERROR", message: "Write a note first." });
      return;
    }

    const ctx = getSelectionContext();

    const entry: JournalEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      type: entryType,
      note: cleanNote,
      ...ctx
    };

    const next = [entry, ...getJournal()];
    setJournal(next);

    figma.ui.postMessage({ type: "JOURNAL", entries: next });
    figma.notify("Saved to Jot");
    return;
  }

  if (msg.type === "UPDATE_ENTRY") {
    const { id, entryType, note } = msg as {
      id: string;
      entryType: EntryType;
      note: string;
    };

    const cleanNote = String(note ?? "").trim();
    if (!cleanNote) {
      figma.ui.postMessage({ type: "ERROR", message: "Write a note first." });
      return;
    }

    const entries = getJournal();
    const idx = entries.findIndex((e) => e.id === id);

    if (idx === -1) {
      figma.ui.postMessage({ type: "ERROR", message: "Entry not found." });
      return;
    }

    entries[idx] = {
      ...entries[idx],
      type: entryType,
      note: cleanNote,
      updatedAt: new Date().toISOString()
    };

    setJournal(entries);
    figma.ui.postMessage({ type: "JOURNAL", entries });
    figma.notify("Updated entry");
    return;
  }

  if (msg.type === "DELETE_ENTRY") {
    const { id } = msg as { id: string };

    const next = getJournal().filter((e) => e.id !== id);
    setJournal(next);

    figma.ui.postMessage({ type: "JOURNAL", entries: next });
    figma.notify("Deleted entry");
    return;
  }

  if (msg.type === "GO_TO_ENTRY") {
    const nodeId = msg.nodeId as string | undefined;
    if (!nodeId) return;

    const node = figma.getNodeById(nodeId);
    if (!node || node.removed) {
      figma.ui.postMessage({
        type: "ERROR",
        message: "Linked layer/frame no longer exists."
      });
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
    figma.ui.postMessage({
      type: "EXPORT_MD_RESULT",
      markdown: toMarkdown(getJournal(), getStoredFileKey())
    });
    return;
  }
};
