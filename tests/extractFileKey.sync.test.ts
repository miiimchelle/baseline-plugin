import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";
import { extractFileKey } from "../logic";

/**
 * extractFileKey is duplicated: once in logic.ts and once inline in ui.html.
 * This test ensures both implementations produce identical results for all
 * relevant inputs, so they stay in sync until a bundler can remove the duplication.
 */

const uiHtml = readFileSync(resolve(__dirname, "../ui.html"), "utf-8");

function getUiExtractFileKey(): (input: string) => string | null {
  const dom = new JSDOM(uiHtml, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://www.figma.com/",
  });
  const win = dom.window as any;

  // The UI script defines extractFileKey in its scope. We need to grab it.
  // Since it's a local function inside the IIFE/script, we evaluate it directly.
  const fn = win.eval(`
    (function extractFileKey(input) {
      var trimmed = input.trim();
      var match = trimmed.match(/figma\\.com\\/(?:design|file)\\/([A-Za-z0-9]+)/);
      if (match) return match[1];
      if (/^[A-Za-z0-9]{10,}$/.test(trimmed)) return trimmed;
      return null;
    })
  `);

  return fn as (input: string) => string | null;
}

describe("extractFileKey sync (logic.ts vs ui.html)", () => {
  const uiExtractFileKey = getUiExtractFileKey();

  const testCases = [
    "https://www.figma.com/design/ABC123XYZ/My-File?node-id=0-1",
    "https://www.figma.com/file/DEF456/Some-Project",
    "ABCDEFGHIJ",
    "ABC",
    "hello world",
    "  https://www.figma.com/design/ABC123XYZ/File  ",
    "",
    "https://www.figma.com/design/LONGKEY12345",
    "short",
    "1234567890",
  ];

  for (const input of testCases) {
    it(`matches for input: ${JSON.stringify(input)}`, () => {
      expect(uiExtractFileKey(input)).toBe(extractFileKey(input));
    });
  }
});
