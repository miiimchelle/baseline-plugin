figma.notify("Baseline TS compiled ✅");

type EntryType = "decision" | "assumption" | "tradeoff" | "feedback" | "debt";

type JournalEntry = {
  id: string;
  createdAt: string; // ISO
  updatedAt?: string; // ISO (set when edited)
  type: EntryType;
  note: string;

  nodeId?: string;
  nodeName?: string;
  pageId: string;
  pageName: string;
};

const STORAGE_KEY = "baseline.journal.v1";

function getJournal(): JournalEntry[] {
  const raw = figma.root.getPluginData(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as JournalEntry[];
  } catch {
    return [];
  }
}

function setJournal(entries: JournalEntry[]) {
  figma.root.setPluginData(STORAGE_KEY, JSON.stringify(entries));
}

function getSelectionContext() {
  const node = figma.currentPage.selection[0];
  return {
    nodeId: node?.id,
    nodeName: node?.name,
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
  // SceneNodes have positional properties like x/y
  return (node as any).x !== undefined && (node as any).y !== undefined;
}

figma.showUI(__html__, { width: 360, height: 520 });

figma.ui.onmessage = (msg) => {
  // Read
  if (msg.type === "GET_JOURNAL") {
    figma.ui.postMessage({ type: "JOURNAL", entries: getJournal() });
    return;
  }

  // Create
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
      pageId: ctx.pageId,
      pageName: ctx.pageName,
      nodeId: ctx.nodeId,
      nodeName: ctx.nodeName
    };

    const next = [entry, ...getJournal()];
    setJournal(next);

    figma.ui.postMessage({ type: "JOURNAL", entries: next });
    figma.notify("Saved to Baseline");
    return;
  }

  // Filter by selection
  if (msg.type === "FILTER_BY_SELECTION") {
    const ctx = getSelectionContext();
    const entries = getJournal();
    const filtered = ctx.nodeId ? entries.filter((e) => e.nodeId === ctx.nodeId) : [];
    figma.ui.postMessage({ type: "SELECTION_ENTRIES", entries: filtered, ctx });
    return;
  }

  // Export
  if (msg.type === "EXPORT_MD") {
    const entries = getJournal();
    const md = toMarkdown(entries);
    figma.ui.postMessage({ type: "EXPORT_MD_RESULT", markdown: md });
    return;
  }

  // Navigate to entry’s node
  if (msg.type === "GO_TO_ENTRY") {
    const nodeId = msg.nodeId as string | undefined;

    if (!nodeId) {
      figma.ui.postMessage({ type: "ERROR", message: "This entry isn’t linked to a layer/frame." });
      return;
    }

    const node = figma.getNodeById(nodeId);

    if (!node || node.removed) {
      figma.ui.postMessage({
        type: "ERROR",
        message: "That layer/frame no longer exists (maybe it was deleted)."
      });
      return;
    }

    const page = getPageForNode(node as BaseNode);
    if (page) figma.currentPage = page;

    if (isSceneNode(node as BaseNode)) {
      const scene = node as SceneNode;
      figma.currentPage.selection = [scene];
      figma.viewport.scrollAndZoomIntoView([scene]);
    } else {
      figma.ui.postMessage({ type: "ERROR", message: "Can’t zoom to that node type." });
    }
    return;
  }

  // Update
  if (msg.type === "UPDATE_ENTRY") {
    const { id, entryType, note } = msg as { id: string; entryType: EntryType; note: string };

    const cleanNote = String(note ?? "").trim();
    if (!cleanNote) {
      figma.ui.postMessage({ type: "ERROR", message: "Write a note first." });
      return;
    }

    const entries = getJournal();
    const idx = entries.findIndex((e) => e.id === id);

    if (idx === -1) {
      figma.ui.postMessage({ type: "ERROR", message: "Entry not found (maybe it was deleted)." });
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

  // Delete
  if (msg.type === "DELETE_ENTRY") {
    const { id } = msg as { id: string };

    const entries = getJournal();
    const next = entries.filter((e) => e.id !== id);

    setJournal(next);
    figma.ui.postMessage({ type: "JOURNAL", entries: next });
    figma.notify("Deleted entry");
    return;
  }

  // Clear all
  if (msg.type === "CLEAR_ALL") {
    setJournal([]);
    figma.ui.postMessage({ type: "JOURNAL", entries: [] });
    figma.notify("Baseline cleared");
    return;
  }
};

function toMarkdown(entries: JournalEntry[]) {
  const lines: string[] = [];
  lines.push(`# Baseline — design decision journal`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);

  for (const e of entries) {
    const created = new Date(e.createdAt).toLocaleString();
    const edited = e.updatedAt ? new Date(e.updatedAt).toLocaleString() : null;

    const where =
      e.nodeName && e.pageName ? `(${e.pageName} → ${e.nodeName})` :
      e.pageName ? `(${e.pageName})` :
      ``;

    const editedLabel = edited ? ` (edited ${edited})` : ``;

    lines.push(`## ${e.type} — ${created}${editedLabel} ${where}`.trim());
    lines.push(e.note);
    lines.push(``);
  }

  return lines.join("\n");
}
