import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylePath = resolve(process.cwd(), "packages/core/src/style.css");
const css = readFileSync(stylePath, "utf8");

describe("core responsive styles", () => {
  it("keeps the preview shell constrained to its host container", () => {
    expect(rule(".ofv-root")).toContain("max-width: 100%");
    expect(rule(".ofv-root")).toContain("min-width: 0");
    expect(rule(".ofv-root [hidden]")).toContain("display: none !important");
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
    expect(rule(".ofv-toolbar button")).toContain("min-width: 0");
    expect(rule(".ofv-toolbar button")).toContain("overflow: hidden");
    expect(rule(".ofv-toolbar button")).toContain("text-overflow: ellipsis");
    expect(rule(".ofv-image-controls")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-image-controls button")).toContain("min-width: 0");
    expect(rule(".ofv-image-controls button")).toContain("overflow: hidden");
    expect(rule(".ofv-image-controls button")).toContain("text-overflow: ellipsis");
    expect(rule(".ofv-image-info")).toContain("max-width: 100%");
    expect(rule(".ofv-image-info-item")).toContain("max-width: 100%");
    expect(rule(".ofv-image-info-item")).toContain("overflow-wrap: anywhere");
  });

  it("keeps large document, code, markdown, and PDF content inside local scroll regions", () => {
    const docxWrapper = rule(".ofv-docx-document .ofv-docx-wrapper");
    const docxSection = rule(".ofv-docx-document section.ofv-docx");
    expect(docxWrapper).not.toContain("min-width: max-content");
    expect(docxWrapper).not.toContain("width: max-content");
    expect(docxWrapper).toContain("width: 100%");
    expect(docxWrapper).toContain("max-width: 100%");
    expect(docxWrapper).toContain("overflow: auto");
    expect(docxWrapper).toContain("box-sizing: border-box");
    expect(docxSection).toContain("max-width: 100%");
    expect(docxSection).toContain("overflow: auto");
    expect(docxSection).toContain("overflow-wrap: anywhere");
    expect(
      rule(
        ".ofv-docx-document section.ofv-docx img,\n.ofv-docx-document section.ofv-docx svg,\n.ofv-docx-document section.ofv-docx canvas,\n.ofv-docx-document section.ofv-docx video"
      )
    ).toContain("max-width: 100%");
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
    expect(rule(".ofv-tabs button")).toContain("overflow: hidden");
    expect(rule(".ofv-tabs button")).toContain("overflow-wrap: anywhere");
    expect(rule(".ofv-tabs button")).toContain("text-overflow: ellipsis");
    expect(rule(".ofv-table-scroll")).toContain("max-width: 100%");
    expect(rule(".ofv-table-scroll")).toContain("overflow: auto");
    expect(rule(".ofv-table-scroll td,\n.ofv-table-scroll th")).toContain("text-overflow: ellipsis");
    expect(rule(".ofv-sheet-window")).toContain("flex-wrap: wrap");
    expect(rule(".ofv-sheet-window")).toContain("min-width: 0");
    expect(rule(".ofv-sheet-window-note")).toContain("min-width: 0");
    expect(rule(".ofv-sheet-window-note")).toContain("overflow-wrap: anywhere");
    expect(rule(".ofv-sheet-window button")).toContain("overflow-wrap: anywhere");
    expect(rule(".ofv-chart-card")).toContain("min-width: 0");
    expect(rule(".ofv-presentation-summary")).toContain("min-width: 0");
    expect(rule(".ofv-presentation-slides")).toContain("min-width: 0");
    expect(rule(".ofv-slide")).toContain("overflow-wrap: anywhere");
    expect(rule(".ofv-pptx-viewer")).toContain("overflow: auto");
    expect(rule(".ofv-pptx-viewer > div[data-slide-index]")).toContain("max-width: 100%");
    expect(rule(".ofv-pptx-viewer > div[data-slide-index]")).toContain("overflow: auto");
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
    expect(rule(".ofv-gis-viewer")).toContain("min-height: 320px");
    expect(rule(".ofv-map-stage")).toContain("height: 100%");
    expect(rule(".ofv-map-stage")).toContain("min-height: 280px");
    expect(rule(".ofv-map-stage .leaflet-container,\n.ofv-map-stage.leaflet-container")).toContain("height: 100%");
    expect(rule(".ofv-map-stage .leaflet-pane,\n.ofv-map-stage .leaflet-tile,\n.ofv-map-stage .leaflet-marker-icon,\n.ofv-map-stage .leaflet-marker-shadow,\n.ofv-map-stage .leaflet-tile-container,\n.ofv-map-stage .leaflet-pane > svg,\n.ofv-map-stage .leaflet-pane > canvas,\n.ofv-map-stage.leaflet-container .leaflet-pane,\n.ofv-map-stage.leaflet-container .leaflet-tile,\n.ofv-map-stage.leaflet-container .leaflet-marker-icon,\n.ofv-map-stage.leaflet-container .leaflet-marker-shadow,\n.ofv-map-stage.leaflet-container .leaflet-tile-container,\n.ofv-map-stage.leaflet-container .leaflet-pane > svg,\n.ofv-map-stage.leaflet-container .leaflet-pane > canvas")).toContain("position: absolute");
    expect(rule(".ofv-map-stage .leaflet-overlay-pane svg,\n.ofv-map-stage.leaflet-container .leaflet-overlay-pane svg")).toContain("pointer-events: none");
    expect(rule(".ofv-map-stage .leaflet-interactive,\n.ofv-map-stage.leaflet-container .leaflet-interactive")).toContain("pointer-events: auto");
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
