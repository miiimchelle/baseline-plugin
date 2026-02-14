import {
  EntryType,
  JournalEntry,
  filterEntries,
  toMarkdown,
  buildNodeUrl,
} from "./logic";

const { widget } = figma;
const { useSyncedState, useSyncedMap, usePropertyMenu, useEffect, AutoLayout, Text, Input, SVG, Fragment } = widget;

const ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: "decision", label: "Decision" },
  { value: "assumption", label: "Assumption" },
  { value: "tradeoff", label: "Trade-off" },
  { value: "feedback", label: "Feedback" },
  { value: "debt", label: "Design debt" },
];

const COLORS = {
  bg: "#FFFFFF",
  border: "#E4E4E7",
  text: "#09090B",
  muted: "#71717A",
  subtle: "#F4F4F5",
  accent: "#18181B",
  pill: { decision: "#3B82F6", assumption: "#F59E0B", tradeoff: "#8B5CF6", feedback: "#10B981", debt: "#EF4444" } as Record<string, string>,
};

function typeLabel(t: string): string {
  return ENTRY_TYPES.find((e) => e.value === t)?.label ?? t;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Jot() {
  const entryMap = useSyncedMap<JournalEntry>("entries");
  const [filter, setFilter] = useSyncedState<string>("filter", "all");
  const [draftNote, setDraftNote] = useSyncedState<string>("draftNote", "");
  const [draftType, setDraftType] = useSyncedState<string>("draftType", "decision");
  const [editingId, setEditingId] = useSyncedState<string | null>("editingId", null);
  const [fileKey, setFileKey] = useSyncedState<string>("fileKey", "");
  const [view, setView] = useSyncedState<string>("view", "list");

  const allEntries = entryMap.values().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const filtered = filterEntries(allEntries, filter);

  // Property menu: filter dropdown + actions
  const filterOptions = [
    { option: "all", label: "All types" },
    ...ENTRY_TYPES.map((t) => ({ option: t.value, label: t.label })),
  ];
  const typeOptions = ENTRY_TYPES.map((t) => ({ option: t.value, label: t.label }));

  usePropertyMenu(
    [
      { itemType: "dropdown", propertyName: "filter", tooltip: "Filter entries", options: filterOptions, selectedOption: filter },
      { itemType: "separator" },
      { itemType: "dropdown", propertyName: "entryType", tooltip: "Entry type", options: typeOptions, selectedOption: draftType },
      { itemType: "separator" },
      { itemType: "action", propertyName: "export", tooltip: "Export Markdown" },
    ],
    ({ propertyName, propertyValue }) => {
      if (propertyName === "filter" && propertyValue) setFilter(propertyValue);
      if (propertyName === "entryType" && propertyValue) setDraftType(propertyValue);
      if (propertyName === "export") {
        const fk = fileKey || undefined;
        const md = toMarkdown(allEntries, fk);
        figma.showUI(`<pre style="font:12px/1.5 monospace;white-space:pre-wrap;padding:16px;">${md.replace(/</g, "&lt;")}</pre>`, { width: 480, height: 400, title: "Jot — Markdown Export" });
      }
    },
  );

  function saveEntry() {
    const note = draftNote.trim();
    if (!note) { figma.notify("Write a note first."); return; }

    const sel = figma.currentPage.selection[0];
    const nodeId = sel?.id;
    const fk = fileKey || undefined;

    if (editingId) {
      const existing = entryMap.get(editingId);
      if (existing) {
        entryMap.set(editingId, {
          ...existing,
          type: draftType as EntryType,
          note,
          updatedAt: new Date().toISOString(),
        });
      }
      setEditingId(null);
      figma.notify("Updated entry");
    } else {
      const id = genId();
      const entry: JournalEntry = {
        id,
        createdAt: new Date().toISOString(),
        type: draftType as EntryType,
        note,
        nodeId,
        nodeName: sel?.name,
        nodeUrl: buildNodeUrl(fk, nodeId),
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
      };
      entryMap.set(id, entry);
      figma.notify("Saved to Jot");
    }
    setDraftNote("");
  }

  function deleteEntry(id: string) {
    entryMap.delete(id);
    if (editingId === id) { setEditingId(null); setDraftNote(""); }
    figma.notify("Deleted entry");
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setDraftType(entry.type);
    setDraftNote(entry.note);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftNote("");
  }

  // Navigate to linked node
  function goToNode(nodeId: string) {
    const node = figma.getNodeById(nodeId);
    if (!node || node.removed) { figma.notify("Linked layer no longer exists."); return; }
    let current: BaseNode | null = node;
    while (current && current.type !== "PAGE") current = current.parent;
    if (current) figma.currentPage = current as PageNode;
    if ((node as any).x !== undefined) {
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
  }

  return (
    <AutoLayout
      direction="vertical"
      spacing={12}
      padding={20}
      cornerRadius={12}
      fill={COLORS.bg}
      stroke={COLORS.border}
      strokeWidth={1}
      width={340}
      effect={{ type: "drop-shadow", color: { r: 0, g: 0, b: 0, a: 0.06 }, offset: { x: 0, y: 2 }, blur: 8 }}
    >
      {/* Header */}
      <AutoLayout direction="horizontal" spacing={8} verticalAlignItems="center" width="fill-parent">
        <Text fontSize={16} fontWeight="bold" fill={COLORS.text} width="fill-parent">
          Jot
        </Text>
        <Text fontSize={10} fill={COLORS.muted}>
          {allEntries.length} {allEntries.length === 1 ? "entry" : "entries"}
        </Text>
      </AutoLayout>

      {/* Input area */}
      <AutoLayout
        direction="vertical"
        spacing={8}
        padding={12}
        cornerRadius={8}
        fill={COLORS.subtle}
        width="fill-parent"
      >
        <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" width="fill-parent">
          <AutoLayout
            padding={{ vertical: 3, horizontal: 8 }}
            cornerRadius={999}
            fill={COLORS.pill[draftType] || COLORS.accent}
          >
            <Text fontSize={10} fontWeight="semi-bold" fill="#FFFFFF">
              {typeLabel(draftType)}
            </Text>
          </AutoLayout>
          {editingId && (
            <Text fontSize={10} fill={COLORS.muted}>editing</Text>
          )}
        </AutoLayout>

        <Input
          value={draftNote}
          onTextEditEnd={(e) => setDraftNote(e.characters)}
          placeholder="What decision or assumption are you capturing?"
          fontSize={12}
          fill={COLORS.text}
          width="fill-parent"
          inputBehavior="multiline"
          inputFrameProps={{
            padding: 8,
            cornerRadius: 6,
            fill: COLORS.bg,
            stroke: COLORS.border,
            strokeWidth: 1,
          }}
        />

        <AutoLayout direction="horizontal" spacing={8} width="fill-parent">
          <AutoLayout
            padding={{ vertical: 6, horizontal: 12 }}
            cornerRadius={6}
            fill={COLORS.accent}
            horizontalAlignItems="center"
            width="fill-parent"
            onClick={saveEntry}
            hoverStyle={{ fill: "#333" }}
          >
            <Text fontSize={12} fontWeight="semi-bold" fill="#FFFFFF">
              {editingId ? "Update" : "Save"}
            </Text>
          </AutoLayout>
          {editingId && (
            <AutoLayout
              padding={{ vertical: 6, horizontal: 12 }}
              cornerRadius={6}
              fill={COLORS.bg}
              stroke={COLORS.border}
              strokeWidth={1}
              horizontalAlignItems="center"
              onClick={cancelEdit}
              hoverStyle={{ fill: COLORS.subtle }}
            >
              <Text fontSize={12} fill={COLORS.muted}>Cancel</Text>
            </AutoLayout>
          )}
        </AutoLayout>
      </AutoLayout>

      {/* Entry list */}
      {filtered.length === 0 && allEntries.length === 0 && (
        <AutoLayout direction="vertical" spacing={4} padding={16} horizontalAlignItems="center" width="fill-parent">
          <Text fontSize={12} fontWeight="semi-bold" fill={COLORS.muted} horizontalAlignText="center">
            No entries yet
          </Text>
          <Text fontSize={11} fill={COLORS.muted} horizontalAlignText="center" width="fill-parent">
            Select a layer, type a note above, and save.
          </Text>
        </AutoLayout>
      )}

      {filtered.length === 0 && allEntries.length > 0 && (
        <AutoLayout padding={12} horizontalAlignItems="center" width="fill-parent">
          <Text fontSize={11} fill={COLORS.muted} horizontalAlignText="center">
            No entries match this filter.
          </Text>
        </AutoLayout>
      )}

      {filter !== "all" && filtered.length > 0 && (
        <Text fontSize={10} fill={COLORS.muted}>
          Showing {filtered.length} of {allEntries.length}
        </Text>
      )}

      {filtered.map((entry) => (
        <AutoLayout
          key={entry.id}
          direction="vertical"
          spacing={6}
          padding={10}
          cornerRadius={8}
          fill={COLORS.bg}
          stroke={COLORS.border}
          strokeWidth={1}
          width="fill-parent"
          hoverStyle={{ fill: COLORS.subtle }}
          onClick={() => { if (entry.nodeId) goToNode(entry.nodeId); }}
        >
          <AutoLayout direction="horizontal" spacing={6} verticalAlignItems="center" width="fill-parent">
            <AutoLayout
              padding={{ vertical: 2, horizontal: 6 }}
              cornerRadius={999}
              fill={COLORS.pill[entry.type] || COLORS.accent}
            >
              <Text fontSize={9} fontWeight="semi-bold" fill="#FFFFFF">
                {typeLabel(entry.type)}
              </Text>
            </AutoLayout>
            <Text fontSize={9} fill={COLORS.muted} width="fill-parent">
              {new Date(entry.createdAt).toLocaleDateString()}{entry.updatedAt ? " (edited)" : ""}
            </Text>
          </AutoLayout>

          <Text fontSize={11} fill={COLORS.text} width="fill-parent">
            {entry.note}
          </Text>

          {(entry.pageName || entry.nodeName) && (
            <Text fontSize={9} fill={COLORS.muted}>
              {entry.pageName ?? ""}{entry.nodeName ? ` → ${entry.nodeName}` : ""}
            </Text>
          )}

          <AutoLayout direction="horizontal" spacing={6}>
            <AutoLayout
              padding={{ vertical: 3, horizontal: 8 }}
              cornerRadius={6}
              fill={COLORS.subtle}
              onClick={() => startEdit(entry)}
              hoverStyle={{ fill: COLORS.border }}
            >
              <Text fontSize={10} fill={COLORS.muted}>Edit</Text>
            </AutoLayout>
            <AutoLayout
              padding={{ vertical: 3, horizontal: 8 }}
              cornerRadius={6}
              fill={COLORS.subtle}
              onClick={() => deleteEntry(entry.id)}
              hoverStyle={{ fill: "#FEE2E2" }}
            >
              <Text fontSize={10} fill="#EF4444">Delete</Text>
            </AutoLayout>
          </AutoLayout>
        </AutoLayout>
      ))}

      {/* File key setup (collapsed) */}
      <AutoLayout
        direction="vertical"
        spacing={6}
        padding={10}
        cornerRadius={8}
        fill={COLORS.subtle}
        width="fill-parent"
      >
        <Text fontSize={10} fontWeight="semi-bold" fill={COLORS.muted}>
          File link (for Markdown export)
        </Text>
        <Input
          value={fileKey}
          onTextEditEnd={(e) => {
            const trimmed = e.characters.trim();
            const match = trimmed.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
            setFileKey(match ? match[1] : trimmed);
            if (trimmed) figma.notify("File key saved");
          }}
          placeholder="Paste Figma file URL"
          fontSize={10}
          fill={COLORS.text}
          width="fill-parent"
          inputBehavior="truncate"
          inputFrameProps={{
            padding: 6,
            cornerRadius: 4,
            fill: COLORS.bg,
            stroke: COLORS.border,
            strokeWidth: 1,
          }}
        />
      </AutoLayout>
    </AutoLayout>
  );
}

widget.register(Jot);
