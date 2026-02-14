import { describe, it, expect, beforeEach, vi } from "vitest";
import { STORAGE_KEY, FILE_KEY_STORAGE } from "../logic";

// ---------------------------------------------------------------------------
// Figma API Mock
// ---------------------------------------------------------------------------
function createFigmaMock() {
  const pluginData: Record<string, string> = {};
  const postMessage = vi.fn();
  const notify = vi.fn();
  const resize = vi.fn();

  const mockNode = {
    id: "10:20",
    name: "Test Frame",
    type: "FRAME",
    x: 0,
    removed: false,
    parent: { type: "PAGE", id: "page-1", name: "Page 1" } as any,
  };

  const mockPage = {
    type: "PAGE",
    id: "page-1",
    name: "Page 1",
    selection: [mockNode] as any[],
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
      resize,
      onmessage: null as ((msg: any) => void) | null,
    },
    notify,
    showUI: vi.fn(),
    getNodeById: vi.fn((id: string) => {
      if (id === mockNode.id) return mockNode;
      return null;
    }),
    viewport: {
      scrollAndZoomIntoView: vi.fn(),
    },
  };

  return { figma, pluginData, postMessage, notify, resize, mockNode, mockPage };
}

// ---------------------------------------------------------------------------
// Helper to load the plugin module with mocked figma global
// ---------------------------------------------------------------------------
async function loadPlugin() {
  const mock = createFigmaMock();

  (globalThis as any).figma = mock.figma;
  (globalThis as any).__html__ = "<html></html>";

  vi.resetModules();
  const mod = await import("../code");
  mod.initPlugin();

  const handler = mock.figma.ui.onmessage;
  if (!handler) throw new Error("onmessage handler not set");

  return { ...mock, handler };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Plugin message handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).figma;
    delete (globalThis as any).__html__;
  });

  describe("GET_JOURNAL", () => {
    it("returns empty array when no entries exist", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "GET_JOURNAL" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "JOURNAL",
        entries: [],
      });
    });

    it("returns stored entries", async () => {
      const { handler, postMessage, figma } = await loadPlugin();
      const entries = [
        { id: "1", createdAt: "2025-01-01", type: "decision", note: "Test" },
      ];
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => key === STORAGE_KEY ? JSON.stringify(entries) : ""
      );
      postMessage.mockClear();

      handler({ type: "GET_JOURNAL" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "JOURNAL",
        entries,
      });
    });
  });

  describe("File key management", () => {
    it("stores and retrieves file key", async () => {
      const { handler, postMessage, notify, pluginData } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "SET_FILE_KEY", fileKey: "ABC123" });

      expect(pluginData[FILE_KEY_STORAGE]).toBe("ABC123");
      expect(notify).toHaveBeenCalledWith("File key saved");
      expect(postMessage).toHaveBeenCalledWith({
        type: "FILE_KEY",
        fileKey: "ABC123",
      });
    });

    it("returns empty file key when none set", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "GET_FILE_KEY" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "FILE_KEY",
        fileKey: "",
      });
    });
  });

  describe("ADD_ENTRY", () => {
    it("adds an entry with selection context", async () => {
      const { handler, postMessage, notify } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "ADD_ENTRY", entryType: "decision", note: "We chose X" });

      expect(notify).toHaveBeenCalledWith("Saved to Jot");
      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "JOURNAL"
      );
      expect(call).toBeDefined();
      const entries = call![0].entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("decision");
      expect(entries[0].note).toBe("We chose X");
      expect(entries[0].nodeId).toBe("10:20");
      expect(entries[0].nodeName).toBe("Test Frame");
      expect(entries[0].pageName).toBe("Page 1");
    });

    it("rejects empty note", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "ADD_ENTRY", entryType: "decision", note: "   " });

      expect(postMessage).toHaveBeenCalledWith({
        type: "ERROR",
        message: "Write a note first.",
      });
    });

    it("trims whitespace from note", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "ADD_ENTRY", entryType: "assumption", note: "  trimmed  " });

      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "JOURNAL"
      );
      expect(call![0].entries[0].note).toBe("trimmed");
    });

    it("prepends new entry to existing ones", async () => {
      const { handler, postMessage, figma } = await loadPlugin();
      const existing = [
        { id: "old", createdAt: "2025-01-01", type: "decision", note: "Old" },
      ];
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => key === STORAGE_KEY ? JSON.stringify(existing) : ""
      );
      postMessage.mockClear();

      handler({ type: "ADD_ENTRY", entryType: "debt", note: "New entry" });

      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "JOURNAL"
      );
      const entries = call![0].entries;
      expect(entries).toHaveLength(2);
      expect(entries[0].note).toBe("New entry");
      expect(entries[1].note).toBe("Old");
    });
  });

  describe("UPDATE_ENTRY", () => {
    it("updates an existing entry", async () => {
      const { handler, postMessage, notify, figma } = await loadPlugin();
      const entries = [
        { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Original" },
      ];
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => key === STORAGE_KEY ? JSON.stringify(entries) : ""
      );
      postMessage.mockClear();

      handler({ type: "UPDATE_ENTRY", id: "e1", entryType: "tradeoff", note: "Updated" });

      expect(notify).toHaveBeenCalledWith("Updated entry");
      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "JOURNAL"
      );
      const updated = call![0].entries[0];
      expect(updated.type).toBe("tradeoff");
      expect(updated.note).toBe("Updated");
      expect(updated.updatedAt).toBeDefined();
    });

    it("rejects empty note on update", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "UPDATE_ENTRY", id: "e1", entryType: "decision", note: "" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "ERROR",
        message: "Write a note first.",
      });
    });

    it("returns error for non-existent entry", async () => {
      const { handler, postMessage, figma } = await loadPlugin();
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        () => "[]"
      );
      postMessage.mockClear();

      handler({ type: "UPDATE_ENTRY", id: "missing", entryType: "decision", note: "x" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "ERROR",
        message: "Entry not found.",
      });
    });
  });

  describe("DELETE_ENTRY", () => {
    it("removes the entry by id", async () => {
      const { handler, postMessage, notify, figma } = await loadPlugin();
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => key === STORAGE_KEY ? JSON.stringify([
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Keep" },
          { id: "e2", createdAt: "2025-01-02", type: "debt", note: "Delete me" },
        ]) : ""
      );
      postMessage.mockClear();

      handler({ type: "DELETE_ENTRY", id: "e2" });

      expect(notify).toHaveBeenCalledWith("Deleted entry");
      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "JOURNAL"
      );
      const entries = call![0].entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("e1");
    });
  });

  describe("RESIZE", () => {
    it("calls figma.ui.resize with dimensions", async () => {
      const { handler, resize } = await loadPlugin();

      handler({ type: "RESIZE", width: 400, height: 600 });

      expect(resize).toHaveBeenCalledWith(400, 600);
    });
  });

  describe("GO_TO_ENTRY", () => {
    it("selects and scrolls to the node", async () => {
      const { handler, figma, mockNode } = await loadPlugin();

      handler({ type: "GO_TO_ENTRY", nodeId: "10:20" });

      expect(figma.getNodeById).toHaveBeenCalledWith("10:20");
      expect(figma.viewport.scrollAndZoomIntoView).toHaveBeenCalledWith([mockNode]);
    });

    it("shows error for non-existent node", async () => {
      const { handler, postMessage } = await loadPlugin();
      postMessage.mockClear();

      handler({ type: "GO_TO_ENTRY", nodeId: "99:99" });

      expect(postMessage).toHaveBeenCalledWith({
        type: "ERROR",
        message: "Linked layer/frame no longer exists.",
      });
    });

    it("does nothing when nodeId is missing", async () => {
      const { handler, figma } = await loadPlugin();
      (figma.getNodeById as ReturnType<typeof vi.fn>).mockClear();

      handler({ type: "GO_TO_ENTRY" });

      expect(figma.getNodeById).not.toHaveBeenCalled();
    });
  });

  describe("EXPORT_MD", () => {
    it("returns markdown export", async () => {
      const { handler, postMessage, figma } = await loadPlugin();
      (figma.root.getPluginData as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => key === STORAGE_KEY ? JSON.stringify([
          { id: "1", createdAt: "2025-06-15T10:00:00.000Z", type: "decision", note: "Test export" },
        ]) : ""
      );
      postMessage.mockClear();

      handler({ type: "EXPORT_MD" });

      const call = postMessage.mock.calls.find(
        (c: any[]) => c[0].type === "EXPORT_MD_RESULT"
      );
      expect(call).toBeDefined();
      expect(call![0].markdown).toContain("Jot");
      expect(call![0].markdown).toContain("Test export");
    });
  });

  describe("Plugin initialization", () => {
    it("calls showUI on initPlugin", async () => {
      const { figma } = await loadPlugin();
      expect(figma.showUI).toHaveBeenCalledWith("<html></html>", {
        width: 360,
        height: 520,
      });
    });

    it("sends FILE_KEY on initPlugin", async () => {
      const { postMessage } = await loadPlugin();
      expect(postMessage).toHaveBeenCalledWith({
        type: "FILE_KEY",
        fileKey: "",
      });
    });

    it("notifies on initPlugin", async () => {
      const { notify } = await loadPlugin();
      expect(notify).toHaveBeenCalledWith("Jot v2.0.0 ready");
    });
  });
});
