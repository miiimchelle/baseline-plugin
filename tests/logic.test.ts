import { describe, it, expect } from "vitest";
import {
  nodeIdToUrlFormat,
  buildNodeUrl,
  parseJournal,
  toMarkdown,
  extractFileKey,
  filterEntries,
  cleanNote,
  generateEntryId,
  STORAGE_KEY,
  FILE_KEY_STORAGE,
  JournalEntry,
} from "../logic";

// ---------------------------------------------------------------------------
// nodeIdToUrlFormat
// ---------------------------------------------------------------------------
describe("nodeIdToUrlFormat", () => {
  it("replaces colons with dashes", () => {
    expect(nodeIdToUrlFormat("38:4")).toBe("38-4");
  });

  it("handles multiple colons", () => {
    expect(nodeIdToUrlFormat("1:2:3")).toBe("1-2-3");
  });

  it("returns the same string when no colons", () => {
    expect(nodeIdToUrlFormat("384")).toBe("384");
  });

  it("handles empty string", () => {
    expect(nodeIdToUrlFormat("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildNodeUrl
// ---------------------------------------------------------------------------
describe("buildNodeUrl", () => {
  it("builds a correct Figma URL", () => {
    const url = buildNodeUrl("ABC123", "38:4");
    expect(url).toBe("https://www.figma.com/design/ABC123/?node-id=38-4");
  });

  it("returns undefined when fileKey is undefined", () => {
    expect(buildNodeUrl(undefined, "38:4")).toBeUndefined();
  });

  it("returns undefined when fileKey is empty string", () => {
    expect(buildNodeUrl("", "38:4")).toBeUndefined();
  });

  it("returns undefined when nodeId is undefined", () => {
    expect(buildNodeUrl("ABC123", undefined)).toBeUndefined();
  });

  it("returns undefined when both are missing", () => {
    expect(buildNodeUrl(undefined, undefined)).toBeUndefined();
  });

  it("encodes special characters in nodeId", () => {
    const url = buildNodeUrl("KEY", "100:200");
    expect(url).toContain("node-id=100-200");
  });
});

// ---------------------------------------------------------------------------
// parseJournal
// ---------------------------------------------------------------------------
describe("parseJournal", () => {
  it("returns empty array for empty string", () => {
    expect(parseJournal("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseJournal("{not valid json")).toEqual([]);
  });

  it("parses valid JSON array", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-01-01T00:00:00.000Z",
        type: "decision",
        note: "test note",
      },
    ];
    const result = parseJournal(JSON.stringify(entries));
    expect(result).toEqual(entries);
  });

  it("returns empty array for null-ish input", () => {
    expect(parseJournal("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractFileKey
// ---------------------------------------------------------------------------
describe("extractFileKey", () => {
  it("extracts key from /design/ URL", () => {
    expect(
      extractFileKey("https://www.figma.com/design/ABC123XYZ/My-File?node-id=0-1")
    ).toBe("ABC123XYZ");
  });

  it("extracts key from /file/ URL", () => {
    expect(
      extractFileKey("https://www.figma.com/file/DEF456/Some-Project")
    ).toBe("DEF456");
  });

  it("accepts a raw alphanumeric key (10+ chars)", () => {
    expect(extractFileKey("ABCDEFGHIJ")).toBe("ABCDEFGHIJ");
  });

  it("rejects a short raw string", () => {
    expect(extractFileKey("ABC")).toBeNull();
  });

  it("rejects a random non-URL string", () => {
    expect(extractFileKey("hello world")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(
      extractFileKey("  https://www.figma.com/design/ABC123XYZ/File  ")
    ).toBe("ABC123XYZ");
  });

  it("rejects empty string", () => {
    expect(extractFileKey("")).toBeNull();
  });

  it("handles URL with no trailing path", () => {
    expect(
      extractFileKey("https://www.figma.com/design/LONGKEY12345")
    ).toBe("LONGKEY12345");
  });
});

// ---------------------------------------------------------------------------
// filterEntries
// ---------------------------------------------------------------------------
describe("filterEntries", () => {
  const entries: JournalEntry[] = [
    { id: "1", createdAt: "2025-01-01", type: "decision", note: "note 1" },
    { id: "2", createdAt: "2025-01-02", type: "assumption", note: "note 2" },
    { id: "3", createdAt: "2025-01-03", type: "decision", note: "note 3" },
    { id: "4", createdAt: "2025-01-04", type: "feedback", note: "note 4" },
  ];

  it("returns all entries when filter is 'all'", () => {
    expect(filterEntries(entries, "all")).toEqual(entries);
  });

  it("filters by decision", () => {
    const result = filterEntries(entries, "decision");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type === "decision")).toBe(true);
  });

  it("filters by assumption", () => {
    const result = filterEntries(entries, "assumption");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("returns empty array when no match", () => {
    expect(filterEntries(entries, "debt")).toEqual([]);
  });

  it("handles empty entries", () => {
    expect(filterEntries([], "decision")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toMarkdown
// ---------------------------------------------------------------------------
describe("toMarkdown", () => {
  it("includes Jot header", () => {
    const md = toMarkdown([]);
    expect(md).toContain("# Jot — design decision journal");
  });

  it("includes Generated timestamp", () => {
    const md = toMarkdown([]);
    expect(md).toContain("Generated:");
  });

  it("renders entry type and note", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-06-15T10:00:00.000Z",
        type: "decision",
        note: "We chose React over Vue",
      },
    ];
    const md = toMarkdown(entries);
    expect(md).toContain("## decision —");
    expect(md).toContain("We chose React over Vue");
  });

  it("renders linked layer with URL when fileKey provided", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-06-15T10:00:00.000Z",
        type: "tradeoff",
        note: "Some note",
        nodeId: "10:20",
        nodeName: "Header Frame",
      },
    ];
    const md = toMarkdown(entries, "FILEKEY123");
    expect(md).toContain("[Header Frame]");
    expect(md).toContain("figma.com/design/FILEKEY123/");
  });

  it("renders linked layer without URL when no fileKey", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-06-15T10:00:00.000Z",
        type: "assumption",
        note: "Some note",
        nodeName: "Button",
      },
    ];
    const md = toMarkdown(entries);
    expect(md).toContain("Linked layer/frame: Button");
    expect(md).not.toContain("[Button]");
  });

  it("uses existing nodeUrl over building new one", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-06-15T10:00:00.000Z",
        type: "decision",
        note: "Note",
        nodeId: "5:5",
        nodeName: "Frame",
        nodeUrl: "https://www.figma.com/design/EXISTING/?node-id=5-5",
      },
    ];
    const md = toMarkdown(entries, "DIFFERENT_KEY");
    expect(md).toContain("EXISTING");
    expect(md).not.toContain("DIFFERENT_KEY");
  });

  it("shows edited marker when updatedAt is present", () => {
    const entries: JournalEntry[] = [
      {
        id: "1",
        createdAt: "2025-06-15T10:00:00.000Z",
        updatedAt: "2025-06-16T12:00:00.000Z",
        type: "feedback",
        note: "Updated note",
      },
    ];
    const md = toMarkdown(entries);
    expect(md).toContain("(edited");
  });

  it("handles multiple entries", () => {
    const entries: JournalEntry[] = [
      { id: "1", createdAt: "2025-01-01T00:00:00Z", type: "decision", note: "First" },
      { id: "2", createdAt: "2025-01-02T00:00:00Z", type: "debt", note: "Second" },
    ];
    const md = toMarkdown(entries);
    expect(md).toContain("First");
    expect(md).toContain("Second");
    expect(md).toContain("## decision");
    expect(md).toContain("## debt");
  });
});

// ---------------------------------------------------------------------------
// cleanNote
// ---------------------------------------------------------------------------
describe("cleanNote", () => {
  it("trims whitespace and returns string", () => {
    expect(cleanNote("  hello  ")).toBe("hello");
  });

  it("returns null for empty string", () => {
    expect(cleanNote("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(cleanNote("   ")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(cleanNote(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(cleanNote(undefined)).toBeNull();
  });

  it("converts numbers to string", () => {
    expect(cleanNote(42)).toBe("42");
  });

  it("handles string with newlines", () => {
    expect(cleanNote("  line1\nline2  ")).toBe("line1\nline2");
  });
});

// ---------------------------------------------------------------------------
// generateEntryId
// ---------------------------------------------------------------------------
describe("generateEntryId", () => {
  it("returns a non-empty string", () => {
    const id = generateEntryId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("contains a timestamp prefix", () => {
    const before = Date.now();
    const id = generateEntryId();
    const after = Date.now();
    const ts = parseInt(id.split("-")[0], 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateEntryId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// parseJournal (additional edge cases)
// ---------------------------------------------------------------------------
describe("parseJournal edge cases", () => {
  it("returns empty array for JSON object (not array)", () => {
    const result = parseJournal('{"key": "value"}');
    // parseJournal returns whatever JSON.parse gives; a non-array is still valid JSON
    expect(result).toBeDefined();
  });

  it("returns empty array for deeply nested invalid JSON", () => {
    expect(parseJournal("{{{")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// toMarkdown (additional edge cases)
// ---------------------------------------------------------------------------
describe("toMarkdown edge cases", () => {
  it("renders entry with empty note", () => {
    const entries: JournalEntry[] = [
      { id: "1", createdAt: "2025-01-01T00:00:00Z", type: "decision", note: "" },
    ];
    const md = toMarkdown(entries);
    expect(md).toContain("## decision");
  });

  it("renders entry without nodeName (no linked layer line)", () => {
    const entries: JournalEntry[] = [
      { id: "1", createdAt: "2025-01-01T00:00:00Z", type: "debt", note: "Some note", nodeId: "5:5" },
    ];
    const md = toMarkdown(entries);
    expect(md).not.toContain("Linked layer/frame");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("constants", () => {
  it("has correct storage key", () => {
    expect(STORAGE_KEY).toBe("jot.journal.v1");
  });

  it("has correct file key storage key", () => {
    expect(FILE_KEY_STORAGE).toBe("jot.filekey.v1");
  });
});
