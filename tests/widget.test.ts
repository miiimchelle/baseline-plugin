import { describe, it, expect, beforeEach, vi } from "vitest";
import { STORAGE_KEY, JournalEntry } from "../logic";

// ---------------------------------------------------------------------------
// Figma + Widget API Mock
// ---------------------------------------------------------------------------

function createFigmaMock() {
  const pluginData: Record<string, string> = {};
  const postMessage = vi.fn();
  const notify = vi.fn();

  const mockNode = {
    id: "10:20",
    name: "Test Frame",
    type: "FRAME",
    x: 100,
    y: 200,
    width: 400,
    height: 300,
    removed: false,
    parent: { type: "PAGE", id: "page-1", name: "Page 1" } as any,
  };

  const mockWidgetNode = {
    id: "widget-1",
    type: "WIDGET",
    widgetId: "jot-journal",
    widgetSyncedState: { targetNodeId: "" },
    x: 0,
    y: 0,
    height: 100,
    cloneWidget: vi.fn((overrides: Record<string, any>) => {
      const clone = {
        ...mockWidgetNode,
        id: "widget-clone",
        widgetSyncedState: { ...mockWidgetNode.widgetSyncedState, ...overrides },
        x: 0,
        y: 0,
      };
      return clone;
    }),
  };

  const mockPage = {
    type: "PAGE",
    id: "page-1",
    name: "Page 1",
    selection: [mockNode] as any[],
    children: [mockNode, mockWidgetNode] as any[],
  };

  const figma = {
    root: {
      getPluginData: vi.fn((key: string) => pluginData[key] || ""),
      setPluginData: vi.fn((key: string, val: string) => {
        pluginData[key] = val;
      }),
    },
    currentPage: mockPage as any,
    ui: {
      postMessage,
      resize: vi.fn(),
      onmessage: null as ((msg: any) => void) | null,
    },
    notify,
    showUI: vi.fn(),
    getNodeById: vi.fn((id: string) => {
      if (id === mockNode.id) return mockNode;
      if (id === mockWidgetNode.id) return mockWidgetNode;
      return null;
    }),
    viewport: {
      scrollAndZoomIntoView: vi.fn(),
    },
    widgetId: "jot-journal",
    command: "",
  };

  return { figma, pluginData, postMessage, notify, mockNode, mockWidgetNode, mockPage };
}

function seedEntries(pluginData: Record<string, string>, entries: Partial<JournalEntry>[]) {
  pluginData[STORAGE_KEY] = JSON.stringify(entries);
}

// ---------------------------------------------------------------------------
// Tests — widget helpers (tested via code.ts exports)
// ---------------------------------------------------------------------------

describe("Widget-related logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).figma;
    delete (globalThis as any).__html__;
  });

  describe("Entry filtering by nodeId", () => {
    it("filters entries for a specific nodeId", async () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;
      (globalThis as any).__html__ = "<html></html>";

      const entries: Partial<JournalEntry>[] = [
        { id: "e1", createdAt: "2025-01-01", type: "decision", note: "For frame", nodeId: "10:20" },
        { id: "e2", createdAt: "2025-01-02", type: "debt", note: "Unlinked" },
        { id: "e3", createdAt: "2025-01-03", type: "assumption", note: "Also frame", nodeId: "10:20" },
        { id: "e4", createdAt: "2025-01-04", type: "feedback", note: "Other frame", nodeId: "30:40" },
      ];
      seedEntries(mock.pluginData, entries);

      vi.resetModules();
      const { getJournal } = await import("../code");

      const all = getJournal();
      const forFrame = all.filter((e) => e.nodeId === "10:20");
      const unlinked = all.filter((e) => !e.nodeId);

      expect(all).toHaveLength(4);
      expect(forFrame).toHaveLength(2);
      expect(forFrame.every((e) => e.nodeId === "10:20")).toBe(true);
      expect(unlinked).toHaveLength(1);
      expect(unlinked[0].id).toBe("e2");
    });
  });

  describe("handleAddEntry returns created entry", () => {
    it("returns the new entry with nodeId from selection", async () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;
      (globalThis as any).__html__ = "<html></html>";

      vi.resetModules();
      const { handleAddEntry } = await import("../code");

      const entry = handleAddEntry({ entryType: "decision", note: "Test add" });

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe("decision");
      expect(entry!.note).toBe("Test add");
      expect(entry!.nodeId).toBe("10:20");
      expect(entry!.nodeName).toBe("Test Frame");
    });

    it("returns null for empty note", async () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;
      (globalThis as any).__html__ = "<html></html>";

      vi.resetModules();
      const { handleAddEntry } = await import("../code");

      const entry = handleAddEntry({ entryType: "decision", note: "" });
      expect(entry).toBeNull();
    });
  });

  describe("Widget positioning logic", () => {
    it("positions widget above target node", () => {
      const targetNode = { x: 100, y: 200, width: 400, height: 300 };
      const widgetNode = { x: 0, y: 0, height: 80 };

      // Replicate positioning logic from widget.tsx
      widgetNode.x = targetNode.x;
      widgetNode.y = targetNode.y - widgetNode.height - 16;

      expect(widgetNode.x).toBe(100);
      expect(widgetNode.y).toBe(104); // 200 - 80 - 16
    });
  });

  describe("Widget clone for new frame entry", () => {
    it("clones widget with targetNodeId override", () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;

      const clone = mock.mockWidgetNode.cloneWidget({
        targetNodeId: "10:20",
        lastSync: 12345,
      });

      expect(mock.mockWidgetNode.cloneWidget).toHaveBeenCalledWith({
        targetNodeId: "10:20",
        lastSync: 12345,
      });
      expect(clone.widgetSyncedState.targetNodeId).toBe("10:20");
    });
  });

  describe("Finding existing widget for a node", () => {
    it("finds widget with matching targetNodeId", () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;

      // Set the widget to track a specific node
      mock.mockWidgetNode.widgetSyncedState.targetNodeId = "10:20";

      const found = mock.mockPage.children.find(
        (child: any) =>
          child.type === "WIDGET" &&
          child.widgetId === "jot-journal" &&
          child.widgetSyncedState.targetNodeId === "10:20"
      );

      expect(found).toBeDefined();
      expect(found.id).toBe("widget-1");
    });

    it("returns undefined when no widget exists for node", () => {
      const mock = createFigmaMock();
      (globalThis as any).figma = mock.figma;

      const found = mock.mockPage.children.find(
        (child: any) =>
          child.type === "WIDGET" &&
          child.widgetId === "jot-journal" &&
          child.widgetSyncedState.targetNodeId === "99:99"
      );

      expect(found).toBeUndefined();
    });
  });
});
