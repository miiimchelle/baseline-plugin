figma.notify("Baseline TS compiled v1.0.1 ✅");

type EntryType = "decision" | "assumption" | "tradeoff" | "feedback" | "debt";

type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  type: EntryType;
  note: string;

  nodeId?: string;
  nodeName?: string;
  nodeUrl?: string;

  pageId?: string;
  pageName?: string;
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

function nodeIdToUrlFormat(nodeId: string) {
  // plugin uses "38:4", Figma URLs use "38-4"
  return nodeId.replace(/:/g, "-");
}

function buildNodeUrl(nodeId?: string) {
  const key = figma.fileKey ?? undefined; // ✅ available with private plugin API
  if (!key || !nodeId) return undefined;

  const nodeIdForUrl = nodeIdToUrlFormat(nodeId);

  return `https://www.figma.com/design/${key}/baseline?node-id=${encodeURIComponent(
    nodeIdForUrl
  )}`;
}

function getSelectionContext() {
  const node = figma.currentPage.selection[0];
  const nodeId = node?.id;

  return {
    nodeId,
    nodeName: node?.name,
    nodeUrl: buildNodeUrl(nodeId),
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

figma.ui.onmessage = (msg) => {
  if (msg.type === "GET_JOURNAL") {
    figma.ui.postMessage({ type: "JOURNAL", entries: getJournal() });
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
    figma.notify("Saved to Baseline");
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
      markdown: toMarkdown(getJournal())
    });
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
    const edited = e.updatedAt
      ? ` (edited ${new Date(e.updatedAt).toLocaleString()})`
      : ``;

    lines.push(`## ${e.type} — ${created}${edited}`);

    // Ensure older entries also get a URL on export (if they have nodeId)
    const url = e.nodeUrl ?? buildNodeUrl(e.nodeId);

    if (e.nodeName && url) {
      lines.push(`Linked layer/frame: [${e.nodeName}](${url})`);
      lines.push(`URL: ${url}`);
      lines.push(``);
    } else if (e.nodeName) {
      lines.push(`Linked layer/frame: ${e.nodeName}`);
      lines.push(``);
    }

    lines.push(e.note);
    lines.push(``);
  }

  return lines.join("\n");
}