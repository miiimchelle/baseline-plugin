import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";

const uiHtml = readFileSync(resolve(__dirname, "../ui.html"), "utf-8");

function createUI() {
  const dom = new JSDOM(uiHtml, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://www.figma.com/",
  });
  const win = dom.window as any;
  const doc = win.document as Document;

  // Capture messages sent to parent
  const messages: any[] = [];
  win.parent = {
    postMessage: (data: any, _origin: string) => {
      messages.push(data.pluginMessage);
    },
  };

  return { dom, doc, win, messages };
}

function simulatePluginMessage(win: any, msg: any) {
  // Use MessageEvent to properly set .data
  const event = new win.MessageEvent("message", {
    data: { pluginMessage: msg },
  });
  win.dispatchEvent(event);
}

function triggerLoad(win: any) {
  win.dispatchEvent(new win.Event("load"));
}

// ---------------------------------------------------------------------------
// UI Tests
// ---------------------------------------------------------------------------
describe("UI", () => {
  let doc: Document;
  let win: any;
  let messages: any[];

  beforeEach(() => {
    ({ doc, win, messages } = createUI());
    triggerLoad(win);
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------
  describe("Rendering", () => {
    it("renders the Jot heading", () => {
      const h1 = doc.querySelector("h1");
      expect(h1?.textContent).toBe("Jot");
    });

    it("renders the tagline", () => {
      const tagline = doc.querySelector(".tagline");
      expect(tagline?.textContent).toContain("Capture design decisions");
    });

    it("has two tab buttons in the tab bar", () => {
      const tabs = doc.querySelectorAll(".tabs-trigger");
      expect(tabs).toHaveLength(2);
    });

    it("has a settings icon button", () => {
      const settingsBtn = doc.getElementById("tabSettings") as HTMLElement;
      expect(settingsBtn).toBeDefined();
      expect(settingsBtn.classList.contains("settings-btn")).toBe(true);
    });

    it("Write tab is active by default", () => {
      const tabWrite = doc.getElementById("tabWrite") as HTMLElement;
      expect(tabWrite?.dataset.state).toBe("active");
    });

    it("View and Settings are inactive by default", () => {
      const tabView = doc.getElementById("tabView") as HTMLElement;
      const tabSettings = doc.getElementById("tabSettings") as HTMLElement;
      expect(tabView?.dataset.state).toBe("inactive");
      expect(tabSettings?.dataset.state).toBe("inactive");
    });
  });

  // -----------------------------------------------------------------------
  // Tab switching
  // -----------------------------------------------------------------------
  describe("Tab switching", () => {
    it("switches to View tab", () => {
      const tabView = doc.getElementById("tabView") as HTMLElement;
      tabView.click();

      expect(tabView.dataset.state).toBe("active");
      expect(doc.getElementById("panelView")?.classList.contains("active")).toBe(true);
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(false);
    });

    it("opens settings panel via icon button", () => {
      const tabSettings = doc.getElementById("tabSettings") as HTMLElement;
      tabSettings.click();

      expect(tabSettings.dataset.state).toBe("active");
      expect(doc.getElementById("panelSettings")?.classList.contains("active")).toBe(true);
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(false);
    });

    it("toggles settings off on second click", () => {
      const tabSettings = doc.getElementById("tabSettings") as HTMLElement;
      tabSettings.click(); // open
      tabSettings.click(); // close — returns to previous tab (write)

      expect(tabSettings.dataset.state).toBe("inactive");
      expect(doc.getElementById("panelSettings")?.classList.contains("active")).toBe(false);
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(true);
    });

    it("returns to View tab when toggling settings off from View", () => {
      (doc.getElementById("tabView") as HTMLElement).click();
      const tabSettings = doc.getElementById("tabSettings") as HTMLElement;
      tabSettings.click(); // open settings from view
      tabSettings.click(); // close — should return to view

      expect(doc.getElementById("panelView")?.classList.contains("active")).toBe(true);
      expect(doc.getElementById("panelSettings")?.classList.contains("active")).toBe(false);
    });

    it("switches back to Write tab", () => {
      const tabView = doc.getElementById("tabView") as HTMLElement;
      const tabWrite = doc.getElementById("tabWrite") as HTMLElement;

      tabView.click();
      tabWrite.click();

      expect(tabWrite.dataset.state).toBe("active");
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(true);
    });

    it("sends GET_JOURNAL when switching to View tab", () => {
      messages.length = 0;
      const tabView = doc.getElementById("tabView") as HTMLElement;
      tabView.click();

      const journalMsg = messages.find((m) => m.type === "GET_JOURNAL");
      expect(journalMsg).toBeDefined();
    });

    it("sends GET_FILE_KEY when clicking settings button", () => {
      messages.length = 0;
      const tabSettings = doc.getElementById("tabSettings") as HTMLElement;
      tabSettings.click();

      const keyMsg = messages.find((m) => m.type === "GET_FILE_KEY");
      expect(keyMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Write entry form
  // -----------------------------------------------------------------------
  describe("Write entry form", () => {
    it("has entry type dropdown with 5 options", () => {
      const select = doc.getElementById("type") as HTMLSelectElement;
      expect(select.options).toHaveLength(5);
    });

    it("defaults to 'decision' type", () => {
      const select = doc.getElementById("type") as HTMLSelectElement;
      expect(select.value).toBe("decision");
    });

    it("sends ADD_ENTRY on save click", () => {
      const note = doc.getElementById("note") as HTMLTextAreaElement;
      note.value = "Test note";
      messages.length = 0;

      const save = doc.getElementById("save") as HTMLElement;
      save.click();

      const addMsg = messages.find((m) => m.type === "ADD_ENTRY");
      expect(addMsg).toBeDefined();
      expect(addMsg.entryType).toBe("decision");
      expect(addMsg.note).toBe("Test note");
    });

    it("sends correct entry type", () => {
      const select = doc.getElementById("type") as HTMLSelectElement;
      select.value = "tradeoff";
      const note = doc.getElementById("note") as HTMLTextAreaElement;
      note.value = "Trade-off note";
      messages.length = 0;

      const save = doc.getElementById("save") as HTMLElement;
      save.click();

      const addMsg = messages.find((m) => m.type === "ADD_ENTRY");
      expect(addMsg.entryType).toBe("tradeoff");
    });
  });

  // -----------------------------------------------------------------------
  // Journal rendering
  // -----------------------------------------------------------------------
  describe("Journal rendering", () => {
    it("renders empty state when no entries", () => {
      simulatePluginMessage(win, { type: "JOURNAL", entries: [] });

      const emptyTitle = doc.querySelector(".empty-state-title");
      expect(emptyTitle?.textContent).toBe("No entries yet");
    });

    it("shows onboarding text in empty state", () => {
      simulatePluginMessage(win, { type: "JOURNAL", entries: [] });

      const emptyText = doc.querySelector(".empty-state-text");
      expect(emptyText?.textContent).toContain("Write entry");
    });

    it("renders entries in the list", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01T00:00:00Z", type: "decision", note: "My note", pageName: "Page 1", nodeName: "Frame" },
        ],
      });

      const items = doc.querySelectorAll(".item");
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain("My note");
      expect(items[0].textContent).toContain("decision");
    });

    it("shows entry count", () => {
      (doc.getElementById("tabView") as HTMLElement).click();

      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "A" },
          { id: "2", createdAt: "2025-01-02", type: "assumption", note: "B" },
        ],
      });

      const count = doc.getElementById("entryCount");
      expect(count?.textContent).toBe("2 entries");
    });

    it("shows singular entry count for 1 entry", () => {
      (doc.getElementById("tabView") as HTMLElement).click();

      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "A" },
        ],
      });

      const count = doc.getElementById("entryCount");
      expect(count?.textContent).toBe("1 entry");
    });

    it("updates tab count badge", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "A" },
          { id: "2", createdAt: "2025-01-02", type: "debt", note: "B" },
          { id: "3", createdAt: "2025-01-03", type: "feedback", note: "C" },
        ],
      });

      const tabCount = doc.getElementById("tabCount");
      expect(tabCount?.textContent).toBe("(3)");
    });
  });

  // -----------------------------------------------------------------------
  // Filter
  // -----------------------------------------------------------------------
  describe("Entry filter", () => {
    beforeEach(() => {
      (doc.getElementById("tabView") as HTMLElement).click();
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "D1" },
          { id: "2", createdAt: "2025-01-02", type: "assumption", note: "A1" },
          { id: "3", createdAt: "2025-01-03", type: "decision", note: "D2" },
        ],
      });
    });

    it("shows all entries by default", () => {
      const items = doc.querySelectorAll(".item");
      expect(items).toHaveLength(3);
    });

    it("filters by type when changed", () => {
      const filter = doc.getElementById("filterType") as HTMLSelectElement;
      filter.value = "decision";
      filter.dispatchEvent(new win.Event("change"));

      const items = doc.querySelectorAll(".item");
      expect(items).toHaveLength(2);
    });

    it("shows filtered count", () => {
      const filter = doc.getElementById("filterType") as HTMLSelectElement;
      filter.value = "assumption";
      filter.dispatchEvent(new win.Event("change"));

      const count = doc.getElementById("entryCount");
      expect(count?.textContent).toBe("1 of 3 entries");
    });

    it("shows no match message when filter has no results", () => {
      const filter = doc.getElementById("filterType") as HTMLSelectElement;
      filter.value = "debt";
      filter.dispatchEvent(new win.Event("change"));

      const emptyText = doc.querySelector(".empty-state-text");
      expect(emptyText?.textContent).toContain("No entries match this filter");
    });
  });

  // -----------------------------------------------------------------------
  // Edit mode
  // -----------------------------------------------------------------------
  describe("Edit mode", () => {
    it("enters edit mode when edit button clicked", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "assumption", note: "Edit me" },
        ],
      });

      const editBtn = doc.querySelector(".action-btn") as HTMLElement;
      editBtn.click();

      const save = doc.getElementById("save") as HTMLElement;
      expect(save.textContent).toBe("Update entry");

      const note = doc.getElementById("note") as HTMLTextAreaElement;
      expect(note.value).toBe("Edit me");

      const type = doc.getElementById("type") as HTMLSelectElement;
      expect(type.value).toBe("assumption");
    });

    it("shows cancel button in edit mode", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Test" },
        ],
      });

      const editBtn = doc.querySelector(".action-btn") as HTMLElement;
      editBtn.click();

      const cancelBtn = doc.getElementById("cancelEdit") as HTMLElement;
      expect(cancelBtn.style.display).toBe("block");
    });

    it("sends UPDATE_ENTRY when saving in edit mode", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Original" },
        ],
      });

      const editBtn = doc.querySelector(".action-btn") as HTMLElement;
      editBtn.click();

      const note = doc.getElementById("note") as HTMLTextAreaElement;
      note.value = "Updated note";
      messages.length = 0;

      const save = doc.getElementById("save") as HTMLElement;
      save.click();

      const updateMsg = messages.find((m) => m.type === "UPDATE_ENTRY");
      expect(updateMsg).toBeDefined();
      expect(updateMsg.id).toBe("e1");
      expect(updateMsg.note).toBe("Updated note");
    });

    it("exits edit mode on cancel", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Test" },
        ],
      });

      const editBtn = doc.querySelector(".action-btn") as HTMLElement;
      editBtn.click();

      const cancelBtn = doc.getElementById("cancelEdit") as HTMLElement;
      cancelBtn.click();

      const save = doc.getElementById("save") as HTMLElement;
      expect(save.textContent).toBe("Save entry");
    });
  });

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------
  describe("Delete entry", () => {
    it("sends DELETE_ENTRY when confirmed", () => {
      win.confirm = () => true;

      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Delete me" },
        ],
      });

      const buttons = doc.querySelectorAll(".action-btn");
      const deleteBtn = buttons[1] as HTMLElement;
      messages.length = 0;
      deleteBtn.click();

      const delMsg = messages.find((m) => m.type === "DELETE_ENTRY");
      expect(delMsg).toBeDefined();
      expect(delMsg.id).toBe("e1");
    });

    it("does not send DELETE_ENTRY when cancelled", () => {
      win.confirm = () => false;

      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "e1", createdAt: "2025-01-01", type: "decision", note: "Keep me" },
        ],
      });

      const buttons = doc.querySelectorAll(".action-btn");
      const deleteBtn = buttons[1] as HTMLElement;
      messages.length = 0;
      deleteBtn.click();

      const delMsg = messages.find((m) => m.type === "DELETE_ENTRY");
      expect(delMsg).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  describe("Markdown export", () => {
    it("sends EXPORT_MD on button click", () => {
      messages.length = 0;
      const exportBtn = doc.getElementById("export") as HTMLElement;
      exportBtn.click();

      const exportMsg = messages.find((m) => m.type === "EXPORT_MD");
      expect(exportMsg).toBeDefined();
    });

    it("shows markdown textarea when result received", () => {
      simulatePluginMessage(win, {
        type: "EXPORT_MD_RESULT",
        markdown: "# Jot\nSome content",
      });

      const md = doc.getElementById("md") as HTMLTextAreaElement;
      expect(md.style.display).toBe("block");
      expect(md.value).toBe("# Jot\nSome content");
    });

    it("shows copy button when export result received", () => {
      simulatePluginMessage(win, {
        type: "EXPORT_MD_RESULT",
        markdown: "test",
      });

      const copyBtn = doc.getElementById("copyMd") as HTMLElement;
      expect(copyBtn.style.display).toBe("block");
    });
  });

  // -----------------------------------------------------------------------
  // Setup tab (file key)
  // -----------------------------------------------------------------------
  describe("Setup tab", () => {
    it("has file URL input", () => {
      const input = doc.getElementById("fileUrlInput") as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.placeholder).toContain("figma.com/design");
    });

    it("shows saved file key status", () => {
      simulatePluginMessage(win, { type: "FILE_KEY", fileKey: "ABC123" });

      const status = doc.getElementById("setupStatus") as HTMLElement;
      expect(status?.style.display).toBe("block");
      expect(status?.textContent).toContain("ABC123");
    });

    it("hides status when no file key", () => {
      // First send a key to mark as initialized, then clear
      simulatePluginMessage(win, { type: "FILE_KEY", fileKey: "INIT" });
      simulatePluginMessage(win, { type: "FILE_KEY", fileKey: "" });

      const status = doc.getElementById("setupStatus") as HTMLElement;
      expect(status?.style.display).toBe("none");
    });

    it("auto-opens settings when no file key on first launch", () => {
      // Create a fresh UI to test first-launch behavior
      const fresh = createUI();
      triggerLoad(fresh.win);

      // Simulate plugin responding with empty file key
      simulatePluginMessage(fresh.win, { type: "FILE_KEY", fileKey: "" });

      const panelSettings = fresh.doc.getElementById("panelSettings") as HTMLElement;
      expect(panelSettings.classList.contains("active")).toBe(true);
    });

    it("does not auto-open settings when file key exists", () => {
      const fresh = createUI();
      triggerLoad(fresh.win);

      simulatePluginMessage(fresh.win, { type: "FILE_KEY", fileKey: "KEY123" });

      const panelSettings = fresh.doc.getElementById("panelSettings") as HTMLElement;
      expect(panelSettings.classList.contains("active")).toBe(false);
    });

    it("sends SET_FILE_KEY with extracted key from URL", () => {
      const input = doc.getElementById("fileUrlInput") as HTMLInputElement;
      input.value = "https://www.figma.com/design/XYZ789/My-Project";
      messages.length = 0;

      const saveBtn = doc.getElementById("saveFileKey") as HTMLElement;
      saveBtn.click();

      const setMsg = messages.find((m) => m.type === "SET_FILE_KEY");
      expect(setMsg).toBeDefined();
      expect(setMsg.fileKey).toBe("XYZ789");
    });

    it("shows error for invalid URL", () => {
      const input = doc.getElementById("fileUrlInput") as HTMLInputElement;
      input.value = "not a valid url";
      messages.length = 0;

      const saveBtn = doc.getElementById("saveFileKey") as HTMLElement;
      saveBtn.click();

      const error = doc.getElementById("error") as HTMLElement;
      expect(error?.textContent).toContain("Could not find a file key");
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe("Error handling", () => {
    it("displays error message from plugin", () => {
      simulatePluginMessage(win, {
        type: "ERROR",
        message: "Something went wrong",
      });

      const error = doc.getElementById("error") as HTMLElement;
      expect(error?.textContent).toBe("Something went wrong");
    });
  });

  // -----------------------------------------------------------------------
  // Tab switch (RESIZE is only sent when content height grows, not on every switch)
  // -----------------------------------------------------------------------
  describe("Tab switch", () => {
    it("shows View panel when switching to View tab", () => {
      (doc.getElementById("tabView") as HTMLElement).click();
      expect(doc.getElementById("panelView")?.classList.contains("active")).toBe(true);
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(false);
    });

    it("shows Settings panel when clicking settings", () => {
      (doc.getElementById("tabSettings") as HTMLElement).click();
      expect(doc.getElementById("panelSettings")?.classList.contains("active")).toBe(true);
    });

    it("shows Write panel when switching back to Write tab", () => {
      (doc.getElementById("tabView") as HTMLElement).click();
      (doc.getElementById("tabWrite") as HTMLElement).click();
      expect(doc.getElementById("panelWrite")?.classList.contains("active")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Error clear on successful action
  // -----------------------------------------------------------------------
  describe("Error clear on actions", () => {
    it("clears error when save is clicked", () => {
      // Set an error first
      simulatePluginMessage(win, { type: "ERROR", message: "Some error" });
      expect((doc.getElementById("error") as HTMLElement).textContent).toBe("Some error");

      // Click save (should clear the error via setError(""))
      const note = doc.getElementById("note") as HTMLTextAreaElement;
      note.value = "A note";
      (doc.getElementById("save") as HTMLElement).click();

      const error = doc.getElementById("error") as HTMLElement;
      expect(error.textContent).toBe("");
    });

    it("clears error when export is clicked", () => {
      simulatePluginMessage(win, { type: "ERROR", message: "Some error" });

      (doc.getElementById("export") as HTMLElement).click();

      const error = doc.getElementById("error") as HTMLElement;
      expect(error.textContent).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // GO_TO_ENTRY from view
  // -----------------------------------------------------------------------
  describe("Go to entry", () => {
    it("sends GO_TO_ENTRY when clicking a linked entry", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "Test", nodeId: "10:20", pageName: "Page", nodeName: "Frame" },
        ],
      });

      messages.length = 0;
      const item = doc.querySelector(".item.clickable") as HTMLElement;
      item.click();

      const goMsg = messages.find((m) => m.type === "GO_TO_ENTRY");
      expect(goMsg).toBeDefined();
      expect(goMsg.nodeId).toBe("10:20");
    });

    it("does not send GO_TO_ENTRY for unlinked entry", () => {
      simulatePluginMessage(win, {
        type: "JOURNAL",
        entries: [
          { id: "1", createdAt: "2025-01-01", type: "decision", note: "No link" },
        ],
      });

      messages.length = 0;
      const item = doc.querySelector(".item") as HTMLElement;
      item.click();

      const goMsg = messages.find((m) => m.type === "GO_TO_ENTRY");
      expect(goMsg).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------
  describe("Initialization", () => {
    it("sends RESIZE on load", () => {
      const resizeMsg = messages.find((m) => m?.type === "RESIZE");
      expect(resizeMsg).toBeDefined();
    });

    it("sends GET_JOURNAL on load", () => {
      const journalMsg = messages.find((m) => m?.type === "GET_JOURNAL");
      expect(journalMsg).toBeDefined();
    });

    it("sends GET_FILE_KEY on load", () => {
      const keyMsg = messages.find((m) => m?.type === "GET_FILE_KEY");
      expect(keyMsg).toBeDefined();
    });
  });
});
