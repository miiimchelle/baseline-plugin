import {
  JournalEntry,
  STORAGE_KEY,
  parseJournal,
} from "./logic";

import {
  getJournal,
  setJournal,
  fileKey,
  sendFileKey,
  sendJournal,
  selectionContext,
  getPageForNode,
  isSceneNode,
  handlers,
  handleAddEntry,
} from "./code";

const { widget } = figma;
const {
  AutoLayout,
  Text,
  useSyncedState,
  usePropertyMenu,
  useEffect,
  useWidgetId,
} = widget;

// ---------------------------------------------------------------------------
// Color map for entry type pills
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  decision:   { bg: "#DBEAFE", text: "#1E40AF" },
  assumption: { bg: "#FEF9C3", text: "#854D0E" },
  tradeoff:   { bg: "#FCE7F3", text: "#9D174D" },
  feedback:   { bg: "#D1FAE5", text: "#065F46" },
  debt:       { bg: "#FEE2E2", text: "#991B1B" },
};

const TYPE_LABELS: Record<string, string> = {
  decision:   "Decision",
  assumption: "Assumption",
  tradeoff:   "Trade-off",
  feedback:   "Feedback",
  debt:       "Debt",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const mon = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${mon} ${day}, ${time}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Find existing Jot widget instances on the current page
// ---------------------------------------------------------------------------

function findWidgetForNode(targetNodeId: string): WidgetNode | null {
  for (const child of figma.currentPage.children) {
    if (child.type === "WIDGET" && child.widgetId === figma.widgetId) {
      const stored = child.widgetSyncedState["targetNodeId"];
      if (stored === targetNodeId) return child;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Position a widget above a target frame
// ---------------------------------------------------------------------------

function positionWidgetAboveNode(widgetNode: WidgetNode, targetNode: SceneNode) {
  widgetNode.x = targetNode.x;
  widgetNode.y = targetNode.y - widgetNode.height - 16;
}

// ---------------------------------------------------------------------------
// Open the plugin UI and wire up message handling
// ---------------------------------------------------------------------------

function openPluginUI(widgetId: string, onEntryAdded?: () => void) {
  return new Promise<void>((resolve) => {
    figma.showUI(__html__, { width: 360, height: 520 });
    sendFileKey();

    figma.ui.onmessage = (msg) => {
      // Use the shared handler from code.ts
      const handler = handlers[msg.type];
      if (handler) {
        // For ADD_ENTRY, also handle widget creation
        if (msg.type === "ADD_ENTRY") {
          const entry = handleAddEntry(msg);
          if (entry && entry.nodeId) {
            createOrUpdateWidgetForEntry(entry, widgetId);
          }
          if (onEntryAdded) onEntryAdded();
          return;
        }
        handler(msg);
        // Trigger widget re-render on data changes
        if (["UPDATE_ENTRY", "DELETE_ENTRY"].includes(msg.type)) {
          if (onEntryAdded) onEntryAdded();
        }
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Create or update a widget instance for a newly added entry
// ---------------------------------------------------------------------------

function createOrUpdateWidgetForEntry(entry: JournalEntry, sourceWidgetId: string) {
  if (!entry.nodeId) return;

  // Check if a widget already exists for this node
  const existing = findWidgetForNode(entry.nodeId);
  if (existing) return; // Widget exists, it will re-render from pluginData

  // Find the target node to position the widget
  const targetNode = figma.getNodeById(entry.nodeId);
  if (!targetNode || !isSceneNode(targetNode)) return;

  // Clone the source widget with the target node ID
  const sourceWidget = figma.getNodeById(sourceWidgetId);
  if (!sourceWidget || sourceWidget.type !== "WIDGET") return;

  const newWidget = sourceWidget.cloneWidget({
    targetNodeId: entry.nodeId,
    lastSync: Date.now(),
  });

  positionWidgetAboveNode(newWidget, targetNode);
}

// ---------------------------------------------------------------------------
// Widget component
// ---------------------------------------------------------------------------

function JotWidget() {
  const widgetId = useWidgetId();
  const [targetNodeId, setTargetNodeId] = useSyncedState<string>("targetNodeId", "");
  const [lastSync, setLastSync] = useSyncedState<number>("lastSync", 0);

  // Read entries from shared plugin data
  const allEntries = getJournal();
  const entries = targetNodeId
    ? allEntries.filter((e) => e.nodeId === targetNodeId)
    : allEntries.filter((e) => !e.nodeId);

  // Resolve target node name
  let targetName = "Jot — Decision Log";
  if (targetNodeId) {
    const node = figma.getNodeById(targetNodeId);
    if (node && !node.removed) {
      targetName = node.name;
    } else {
      targetName = "Linked frame removed";
    }
  }

  // Property menu
  usePropertyMenu(
    [
      { itemType: "action", propertyName: "openJot", tooltip: "Open Jot" },
      { itemType: "separator" },
      { itemType: "action", propertyName: "refresh", tooltip: "Refresh" },
    ],
    ({ propertyName }) => {
      if (propertyName === "openJot") {
        return openPluginUI(widgetId, () => {
          setLastSync(Date.now());
        });
      }
      if (propertyName === "refresh") {
        setLastSync(Date.now());
      }
    }
  );

  // Empty state
  if (entries.length === 0) {
    return (
      <AutoLayout
        direction="vertical"
        spacing={8}
        padding={16}
        cornerRadius={12}
        fill="#FFFFFF"
        stroke="#E4E4E7"
        strokeWidth={1}
        width={280}
        effect={{
          type: "drop-shadow",
          color: { r: 0, g: 0, b: 0, a: 0.06 },
          offset: { x: 0, y: 1 },
          blur: 3,
        }}
      >
        <Text fontSize={13} fontWeight={600} fill="#09090B">
          {targetName}
        </Text>
        <Text fontSize={11} fill="#A1A1AA">
          {targetNodeId ? "No entries for this frame yet." : "No unlinked entries."}
        </Text>
        <AutoLayout
          padding={{ top: 4, bottom: 4, left: 12, right: 12 }}
          cornerRadius={6}
          fill="#F4F4F5"
          hoverStyle={{ fill: "#E4E4E7" }}
          onClick={() =>
            openPluginUI(widgetId, () => setLastSync(Date.now()))
          }
        >
          <Text fontSize={11} fontWeight={600} fill="#52525B">
            Open Jot
          </Text>
        </AutoLayout>
      </AutoLayout>
    );
  }

  // Entries list
  return (
    <AutoLayout
      direction="vertical"
      spacing={0}
      padding={0}
      cornerRadius={12}
      fill="#FFFFFF"
      stroke="#E4E4E7"
      strokeWidth={1}
      width={280}
      effect={{
        type: "drop-shadow",
        color: { r: 0, g: 0, b: 0, a: 0.06 },
        offset: { x: 0, y: 1 },
        blur: 3,
      }}
    >
      {/* Header */}
      <AutoLayout
        direction="horizontal"
        spacing={8}
        padding={{ top: 12, bottom: 8, left: 16, right: 16 }}
        width="fill-parent"
        verticalAlignItems="center"
      >
        <AutoLayout width="fill-parent">
          <Text fontSize={13} fontWeight={600} fill="#09090B">
            {targetName}
          </Text>
        </AutoLayout>
        <Text fontSize={11} fill="#A1A1AA">
          {entries.length}
        </Text>
      </AutoLayout>

      {/* Entry rows */}
      {entries.map((entry, i) => {
        const colors = TYPE_COLORS[entry.type] || { bg: "#F4F4F5", text: "#52525B" };
        const label = TYPE_LABELS[entry.type] || entry.type;

        return (
          <AutoLayout
            key={entry.id}
            direction="vertical"
            spacing={4}
            padding={{ top: 8, bottom: 8, left: 16, right: 16 }}
            width="fill-parent"
            stroke={i > 0 ? "#F4F4F5" : undefined}
            strokeWidth={i > 0 ? 1 : 0}
            strokeAlign="inside"
          >
            {/* Type pill + date */}
            <AutoLayout direction="horizontal" spacing={8} verticalAlignItems="center" width="fill-parent">
              <AutoLayout
                padding={{ top: 2, bottom: 2, left: 8, right: 8 }}
                cornerRadius={999}
                fill={colors.bg}
              >
                <Text fontSize={10} fontWeight={600} fill={colors.text}>
                  {label}
                </Text>
              </AutoLayout>
              <Text fontSize={10} fill="#A1A1AA">
                {formatDate(entry.createdAt)}
                {entry.updatedAt ? " (edited)" : ""}
              </Text>
            </AutoLayout>

            {/* Note */}
            <Text fontSize={11} fill="#3F3F46" width="fill-parent">
              {truncate(entry.note, 120)}
            </Text>

            {/* Linked info */}
            {entry.nodeName && !targetNodeId ? (
              <Text fontSize={10} fill="#A1A1AA">
                Linked to: {entry.pageName ? `${entry.pageName} → ` : ""}{entry.nodeName}
              </Text>
            ) : null}
          </AutoLayout>
        );
      })}

      {/* Footer action */}
      <AutoLayout
        direction="horizontal"
        padding={{ top: 8, bottom: 12, left: 16, right: 16 }}
        width="fill-parent"
      >
        <AutoLayout
          padding={{ top: 4, bottom: 4, left: 12, right: 12 }}
          cornerRadius={6}
          fill="#F4F4F5"
          hoverStyle={{ fill: "#E4E4E7" }}
          onClick={() =>
            openPluginUI(widgetId, () => setLastSync(Date.now()))
          }
        >
          <Text fontSize={11} fontWeight={600} fill="#52525B">
            Open Jot
          </Text>
        </AutoLayout>
      </AutoLayout>
    </AutoLayout>
  );
}

// ---------------------------------------------------------------------------
// Register widget
// ---------------------------------------------------------------------------

widget.register(JotWidget);

// ---------------------------------------------------------------------------
// Plugin menu command handler
// ---------------------------------------------------------------------------

if (figma.command === "open-jot") {
  figma.showUI(__html__, { width: 360, height: 520 });
  sendFileKey();

  figma.ui.onmessage = (msg) => {
    const handler = handlers[msg.type];
    if (handler) handler(msg);
  };
}
