import { test, expect } from "@playwright/test";

const HARNESS = "/tests/e2e/harness.html";

test.describe("Jot UI e2e", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await page.waitForFunction(() => (window as any).__harnessReady === true, { timeout: 5000 });
  });

  test("renders heading and tabs", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await expect(frame.locator("h1")).toHaveText("Jot");
    await expect(frame.locator(".tagline")).toContainText("Capture design decisions");
    await expect(frame.locator(".tabs-trigger")).toHaveCount(2);
  });

  test("Write tab is active by default", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await expect(frame.locator("#tabWrite")).toHaveAttribute("data-state", "active");
    await expect(frame.locator("#panelWrite")).toHaveClass(/active/);
  });

  test("switches to View tab and requests journal", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#tabView").click();
    await expect(frame.locator("#tabView")).toHaveAttribute("data-state", "active");
    await expect(frame.locator("#panelView")).toHaveClass(/active/);

    const outbound = await page.evaluate(() => (window as any).__harnessOutbound);
    const getJournal = outbound.find((m: { type: string }) => m.type === "GET_JOURNAL");
    expect(getJournal).toBeDefined();
  });

  test("save entry sends ADD_ENTRY", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#note").fill("E2E test note");
    await frame.locator("#save").click();

    const outbound = await page.evaluate(() => (window as any).__harnessOutbound);
    const addEntry = outbound.find((m: { type: string }) => m.type === "ADD_ENTRY");
    expect(addEntry).toBeDefined();
    expect(addEntry.note).toBe("E2E test note");
    expect(addEntry.entryType).toBe("decision");
  });

  test("view tab shows entries when JOURNAL received", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#tabView").click();

    await page.evaluate(() => {
      (window as any).__harnessSend({
        type: "JOURNAL",
        entries: [
          {
            id: "e1",
            createdAt: "2025-01-01T00:00:00Z",
            type: "decision",
            note: "E2E journal entry",
            pageName: "Page 1",
            nodeName: "Frame",
          },
        ],
      });
    });

    await expect(frame.locator(".item")).toHaveCount(1);
    await expect(frame.locator(".item")).toContainText("E2E journal entry");
    await expect(frame.locator(".item")).toContainText("decision");
  });

  test("settings panel and file key", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#tabSettings").click();
    await expect(frame.locator("#panelSettings")).toHaveClass(/active/);

    const outboundBefore = await page.evaluate(() => (window as any).__harnessOutbound.slice());
    const getKey = outboundBefore.find((m: { type: string }) => m.type === "GET_FILE_KEY");
    expect(getKey).toBeDefined();

    await frame.locator("#fileUrlInput").fill("https://www.figma.com/design/ABC123/Project");
    await frame.locator("#saveFileKey").click();

    const outbound = await page.evaluate(() => (window as any).__harnessOutbound);
    const setKey = outbound.find((m: { type: string }) => m.type === "SET_FILE_KEY");
    expect(setKey).toBeDefined();
    expect(setKey.fileKey).toBe("ABC123");
  });

  test("export sends EXPORT_MD", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#tabView").click();
    await frame.locator("#export").click();

    const outbound = await page.evaluate(() => (window as any).__harnessOutbound);
    const exportMd = outbound.find((m: { type: string }) => m.type === "EXPORT_MD");
    expect(exportMd).toBeDefined();
  });

  test("export result shows markdown and copy button", async ({ page }) => {
    const frame = page.frameLocator("#plugin-frame");
    await frame.locator("#tabView").click();
    await page.evaluate(() => {
      (window as any).__harnessSend({
        type: "EXPORT_MD_RESULT",
        markdown: "# Jot\nTest export content",
      });
    });

    await expect(frame.locator("#md")).toBeVisible();
    await expect(frame.locator("#md")).toHaveValue("# Jot\nTest export content");
    await expect(frame.locator("#copyMd")).toBeVisible();
  });
});
