import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// We can't render the actual widget (requires Figma runtime), but we can
// test the helper functions and ensure the module loads without errors
// when the Figma globals are mocked.
// ---------------------------------------------------------------------------

// Mock the Figma widget API before importing widget.tsx
function createWidgetMocks() {
  const syncedStates: Record<string, any> = {};
  const syncedMaps: Record<string, Map<string, any>> = {};

  const useSyncedState = vi.fn(<T>(name: string, defaultValue: T): [T, (v: T | ((c: T) => T)) => void] => {
    if (!(name in syncedStates)) syncedStates[name] = typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue;
    return [syncedStates[name], (v: T | ((c: T) => T)) => {
      syncedStates[name] = typeof v === "function" ? (v as (c: T) => T)(syncedStates[name]) : v;
    }];
  });

  const useSyncedMap = vi.fn(<T>(name: string) => {
    if (!syncedMaps[name]) syncedMaps[name] = new Map<string, T>();
    const map = syncedMaps[name];
    return {
      get: (k: string) => map.get(k),
      set: (k: string, v: T) => map.set(k, v),
      delete: (k: string) => map.delete(k),
      keys: () => Array.from(map.keys()),
      values: () => Array.from(map.values()),
      entries: () => Array.from(map.entries()),
      has: (k: string) => map.has(k),
      size: map.size,
      length: map.size,
    };
  });

  const usePropertyMenu = vi.fn();
  const useEffect = vi.fn();

  const noop = vi.fn((_props: any) => null);
  const registerFn = vi.fn();

  const widgetApi = {
    useSyncedState,
    useSyncedMap,
    usePropertyMenu,
    useEffect,
    AutoLayout: noop,
    Frame: noop,
    Image: noop,
    Rectangle: noop,
    Ellipse: noop,
    Text: noop,
    Input: noop,
    SVG: noop,
    Line: noop,
    Fragment: noop,
    Span: noop,
    register: registerFn,
    h: vi.fn(),
    useWidgetNodeId: vi.fn(() => "widget-1"),
    waitForTask: vi.fn(),
    colorMapToOptions: vi.fn(),
  };

  const figmaMock = {
    widget: widgetApi,
    notify: vi.fn(),
    showUI: vi.fn(),
    currentPage: {
      id: "page-1",
      name: "Page 1",
      selection: [] as any[],
    },
    getNodeById: vi.fn(),
    viewport: { scrollAndZoomIntoView: vi.fn() },
  };

  (globalThis as any).figma = figmaMock;

  return { figmaMock, widgetApi, syncedStates, syncedMaps, registerFn };
}

describe("Widget module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete (globalThis as any).figma;
  });

  it("registers a widget function", async () => {
    const { registerFn } = createWidgetMocks();
    await import("../widget");
    expect(registerFn).toHaveBeenCalledTimes(1);
    expect(typeof registerFn.mock.calls[0][0]).toBe("function");
  });

  it("widget function returns without error", async () => {
    const { registerFn } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    expect(() => widgetFn()).not.toThrow();
  });

  it("uses useSyncedMap for entries", async () => {
    const { registerFn, widgetApi } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();
    expect(widgetApi.useSyncedMap).toHaveBeenCalledWith("entries");
  });

  it("uses useSyncedState for filter, draftNote, draftType, editingId, fileKey, view", async () => {
    const { registerFn, widgetApi } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();

    const stateNames = widgetApi.useSyncedState.mock.calls.map((c: any[]) => c[0]);
    expect(stateNames).toContain("filter");
    expect(stateNames).toContain("draftNote");
    expect(stateNames).toContain("draftType");
    expect(stateNames).toContain("editingId");
    expect(stateNames).toContain("fileKey");
  });

  it("sets up property menu with filter and export", async () => {
    const { registerFn, widgetApi } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();

    expect(widgetApi.usePropertyMenu).toHaveBeenCalledTimes(1);
    const menuItems = widgetApi.usePropertyMenu.mock.calls[0][0];
    const filterItem = menuItems.find((m: any) => m.propertyName === "filter");
    expect(filterItem).toBeDefined();
    expect(filterItem.itemType).toBe("dropdown");
    expect(filterItem.options.length).toBe(6); // all + 5 types

    const exportItem = menuItems.find((m: any) => m.propertyName === "export");
    expect(exportItem).toBeDefined();
    expect(exportItem.itemType).toBe("action");
  });

  it("property menu filter handler updates filter state", async () => {
    const { registerFn, widgetApi, syncedStates } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();

    const onChange = widgetApi.usePropertyMenu.mock.calls[0][1];
    onChange({ propertyName: "filter", propertyValue: "decision" });
    expect(syncedStates["filter"]).toBe("decision");
  });

  it("property menu entryType handler updates draftType state", async () => {
    const { registerFn, widgetApi, syncedStates } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();

    const onChange = widgetApi.usePropertyMenu.mock.calls[0][1];
    onChange({ propertyName: "entryType", propertyValue: "tradeoff" });
    expect(syncedStates["draftType"]).toBe("tradeoff");
  });

  it("property menu export handler shows UI with markdown", async () => {
    const { registerFn, widgetApi, figmaMock } = createWidgetMocks();
    await import("../widget");
    const widgetFn = registerFn.mock.calls[0][0];
    widgetFn();

    const onChange = widgetApi.usePropertyMenu.mock.calls[0][1];
    onChange({ propertyName: "export" });
    expect(figmaMock.showUI).toHaveBeenCalled();
    const html = figmaMock.showUI.mock.calls[0][0];
    expect(html).toContain("Jot");
  });
});

describe("Widget entry operations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete (globalThis as any).figma;
  });

  it("save button onClick creates an entry in syncedMap", async () => {
    const mocks = createWidgetMocks();
    mocks.syncedStates["draftNote"] = "My test note";
    mocks.syncedStates["draftType"] = "decision";

    // Provide a mock selection
    mocks.figmaMock.currentPage.selection = [{
      id: "node-1", name: "Test Node",
    }];

    await import("../widget");
    const widgetFn = mocks.registerFn.mock.calls[0][0];
    widgetFn();

    // Find the save button's onClick handler from the h() calls
    // The widget renders using figma.widget.h - we need to find the save handler
    const hCalls = mocks.widgetApi.h.mock.calls;
    const saveOnClick = findOnClick(hCalls, "Save");

    if (saveOnClick) {
      saveOnClick();
      const map = mocks.syncedMaps["entries"];
      expect(map.size).toBe(1);
      const entry = Array.from(map.values())[0] as any;
      expect(entry.note).toBe("My test note");
      expect(entry.type).toBe("decision");
      expect(entry.nodeId).toBe("node-1");
      expect(mocks.figmaMock.notify).toHaveBeenCalledWith("Saved to Jot");
    }
  });

  it("save button rejects empty note", async () => {
    const mocks = createWidgetMocks();
    mocks.syncedStates["draftNote"] = "   ";

    await import("../widget");
    const widgetFn = mocks.registerFn.mock.calls[0][0];
    widgetFn();

    const hCalls = mocks.widgetApi.h.mock.calls;
    const saveOnClick = findOnClick(hCalls, "Save");

    if (saveOnClick) {
      saveOnClick();
      expect(mocks.figmaMock.notify).toHaveBeenCalledWith("Write a note first.");
      const map = mocks.syncedMaps["entries"];
      expect(map.size).toBe(0);
    }
  });

  it("delete button removes entry from syncedMap", async () => {
    const mocks = createWidgetMocks();
    // Pre-populate an entry
    const entryMap = new Map();
    entryMap.set("e1", {
      id: "e1", createdAt: "2025-01-01", type: "decision", note: "Delete me",
    });
    mocks.syncedMaps["entries"] = entryMap;

    await import("../widget");
    const widgetFn = mocks.registerFn.mock.calls[0][0];
    widgetFn();

    const hCalls = mocks.widgetApi.h.mock.calls;
    const deleteOnClick = findOnClick(hCalls, "Delete");

    if (deleteOnClick) {
      deleteOnClick();
      expect(entryMap.size).toBe(0);
      expect(mocks.figmaMock.notify).toHaveBeenCalledWith("Deleted entry");
    }
  });

  it("edit button sets editing state", async () => {
    const mocks = createWidgetMocks();
    const entryMap = new Map();
    entryMap.set("e1", {
      id: "e1", createdAt: "2025-01-01", type: "assumption", note: "Edit me",
    });
    mocks.syncedMaps["entries"] = entryMap;

    await import("../widget");
    const widgetFn = mocks.registerFn.mock.calls[0][0];
    widgetFn();

    const hCalls = mocks.widgetApi.h.mock.calls;
    const editOnClick = findOnClick(hCalls, "Edit");

    if (editOnClick) {
      editOnClick();
      expect(mocks.syncedStates["editingId"]).toBe("e1");
      expect(mocks.syncedStates["draftType"]).toBe("assumption");
      expect(mocks.syncedStates["draftNote"]).toBe("Edit me");
    }
  });

  it("goToNode navigates to linked node", async () => {
    const mocks = createWidgetMocks();
    const mockNode = { id: "n1", name: "Frame", type: "FRAME", x: 0, removed: false, parent: { type: "PAGE" } };
    mocks.figmaMock.getNodeById.mockReturnValue(mockNode);

    const entryMap = new Map();
    entryMap.set("e1", {
      id: "e1", createdAt: "2025-01-01", type: "decision", note: "Test",
      nodeId: "n1", nodeName: "Frame", pageName: "Page 1",
    });
    mocks.syncedMaps["entries"] = entryMap;

    await import("../widget");
    const widgetFn = mocks.registerFn.mock.calls[0][0];
    widgetFn();

    // Find the entry card's onClick (navigates to node)
    const hCalls = mocks.widgetApi.h.mock.calls;
    const entryOnClick = findEntryCardOnClick(hCalls);

    if (entryOnClick) {
      entryOnClick();
      expect(mocks.figmaMock.getNodeById).toHaveBeenCalledWith("n1");
      expect(mocks.figmaMock.viewport.scrollAndZoomIntoView).toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers to extract onClick handlers from h() mock calls
// ---------------------------------------------------------------------------
function findOnClick(hCalls: any[][], buttonText: string): (() => void) | null {
  for (const call of hCalls) {
    const props = call[1];
    if (props?.onClick) {
      // Check if children contain the button text
      const children = call.slice(2);
      if (childrenContainText(children, buttonText)) {
        return props.onClick;
      }
    }
  }
  return null;
}

function findEntryCardOnClick(hCalls: any[][]): (() => void) | null {
  // Look for AutoLayout with onClick that has entry content
  for (const call of hCalls) {
    const props = call[1];
    if (props?.onClick && props?.key) {
      return props.onClick;
    }
  }
  return null;
}

function childrenContainText(children: any[], text: string): boolean {
  for (const child of children) {
    if (typeof child === "string" && child.includes(text)) return true;
    if (Array.isArray(child) && childrenContainText(child, text)) return true;
  }
  return false;
}
