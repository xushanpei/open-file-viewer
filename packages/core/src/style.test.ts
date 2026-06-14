import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylePath = resolve(process.cwd(), "packages/core/src/style.css");
const css = readFileSync(stylePath, "utf8");

describe("core responsive styles", () => {
  it("keeps the preview shell constrained to its host container", () => {
    expect(rule(".ofv-root")).toContain("max-width: 100%");
    expect(rule(".ofv-root")).toContain("min-width: 0");
    expect(rule(".ofv-host")).toContain("min-width: 0");
    expect(rule(".ofv-host")).toContain("overflow: hidden");
    expect(rule(".ofv-viewport")).toContain("min-width: 0");
    expect(rule(".ofv-viewport")).toContain("max-width: 100%");
  });

  it("lets toolbar controls wrap instead of widening narrow containers", () => {
    expect(rule(".ofv-toolbar")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-toolbar")).toContain("min-width: 0");
    expect(rule(".ofv-toolbar-search")).toContain("flex: 1 1 180px");
    expect(rule(".ofv-toolbar-search")).toContain("min-width: 0");
    expect(rule(".ofv-toolbar-search input")).toContain("min-width: 0");
  });

  it("keeps large document, code, markdown, and PDF content inside local scroll regions", () => {
    const docxWrapper = rule(".ofv-docx-document .ofv-docx-wrapper");
    expect(docxWrapper).not.toContain("min-width: max-content");
    expect(docxWrapper).toContain("max-width: 100%");
    expect(rule(".ofv-code-container")).toContain("max-width: 100%");
    expect(rule(".ofv-code-body")).toContain("overflow: auto");
    expect(rule(".ofv-markdown-body")).toContain("overflow: auto");
    expect(rule(".ofv-markdown-body table")).toContain("max-width: 100%");
    expect(rule(".ofv-pdf")).toContain("overflow: auto");
  });

  it("keeps complex preview panels from widening narrow containers", () => {
    expect(rule(".ofv-panel")).toContain("max-width: 100%");
    expect(rule(".ofv-section")).toContain("min-width: 0");
    expect(rule(".ofv-tabs")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-tabs")).toContain("min-width: 0");
    expect(rule(".ofv-table-scroll")).toContain("max-width: 100%");
    expect(rule(".ofv-table-scroll")).toContain("overflow: auto");
    expect(rule(".ofv-sheet-window")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-sheet-window")).toContain("min-width: 0");
    expect(rule(".ofv-chart-card")).toContain("min-width: 0");
    expect(rule(".ofv-presentation-summary")).toContain("min-width: 0");
    expect(rule(".ofv-presentation-slides")).toContain("min-width: 0");
  });

  it("keeps specialized preview surfaces constrained and locally scrollable", () => {
    for (const selector of [
      ".ofv-svg-stage",
      ".ofv-model-stage",
      ".ofv-map-stage",
      ".ofv-archive-layout",
      ".ofv-archive-main",
      ".ofv-epub-reader",
      ".ofv-xps-pages",
      ".ofv-ofd-pages"
    ]) {
      expect(rule(selector), selector).toContain("min-width: 0");
    }

    expect(rule(".ofv-archive-layout")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-archive-sidebar")).toContain("min-width: 0");
    expect(rule(".ofv-archive-tree")).toContain("overflow: auto");
    expect(rule(".ofv-email-attachments")).toContain("min-width: 0");
    expect(rule(".ofv-email-attachment-item")).toContain("max-width: 100%");
    expect(rule(".ofv-email-body-iframe")).toContain("max-width: 100%");
    expect(rule(".ofv-cad-layers")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-cad-layers")).toContain("min-width: 0");
  });
});

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}.`);
  }
  return match.groups.body.replace(/\s+/g, " ").trim();
}
