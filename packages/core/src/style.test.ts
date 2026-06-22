import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylePath = resolve(process.cwd(), "packages/core/src/style.css");
const css = readFileSync(stylePath, "utf8").replace(/\r\n?/g, "\n");

describe("core responsive styles", () => {
  it("keeps the preview shell constrained to its host container", () => {
    expect(rule(".ofv-root")).toContain("max-width: 100%");
    expect(rule(".ofv-root")).toContain("min-width: 0");
    expect(css).toContain('.ofv-root .ofv-presentation-summary[aria-hidden="true"]');
    expect(css).toContain('.ofv-root .ofv-media-info[aria-hidden="true"]');
    expect(css).not.toContain('.ofv-root [aria-hidden="true"] {\n  display: none !important;');
    expect(rule(".ofv-toolbar-icon")).toContain("display: inline-flex");
    expect(rule(".ofv-host")).toContain("min-width: 0");
    expect(rule(".ofv-host")).toContain("overflow: hidden");
    expect(rule(".ofv-viewport")).toContain("container-type: inline-size");
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
    expect(rule(".ofv-image-stage")).toContain("min-height: min(320px, 55vh)");
    expect(rule(".ofv-image-content")).toContain("width: auto");
    expect(rule(".ofv-image-content")).toContain("height: auto");
    expect(rule(".ofv-image-content")).toContain("max-height: 100%");
  });

  it("keeps large document, code, markdown, and PDF content inside local scroll regions", () => {
    const docxWrapper = rule(".ofv-docx-document .ofv-docx-wrapper");
    const docxSection = rule(".ofv-docx-document section.ofv-docx");
    expect(rule(".ofv-docx-document")).toContain("overflow-x: auto");
    expect(docxWrapper).toContain("width: 100%");
    expect(docxWrapper).toContain("max-width: 100%");
    expect(docxWrapper).toContain("overflow: hidden");
    expect(docxWrapper).toContain("background: transparent");
    expect(docxWrapper).toContain("--ofv-docx-scale: 1");
    expect(docxWrapper).toContain("box-sizing: border-box");
    expect(rule(".ofv-office")).toContain("--ofv-office-zoom: 1");
    expect(rule(".ofv-docx-page-frame")).toContain("max-width: 100%");
    expect(rule(".ofv-docx-page-frame")).toContain("overflow: visible");
    expect(rule(".ofv-docx-textbox-page-flow-layout")).toContain("min-height: 0");
    expect(rule(".ofv-docx-textbox-page-flow-layout")).not.toContain("842pt");
    expect(rule(".ofv-docx-textbox-continuation-flow-layout .ofv-docx-textbox-page-flow-main")).toContain(
      "justify-content: flex-start"
    );
    expect(rule(".ofv-docx-textbox-continuation-flow-layout .ofv-docx-textbox-page-flow-main")).not.toContain(
      "space-between"
    );
    expect(docxSection).toContain("max-width: none");
    expect(docxSection).toContain("background: #fff");
    expect(docxSection).toContain("overflow: visible");
    expect(docxSection).toContain("overflow-wrap: normal");
    expect(docxSection).toContain("transform: scale(calc(var(--ofv-docx-scale) * var(--ofv-office-zoom, 1)))");
    expect(docxSection).toContain("transform-origin: top left");
    expect(rule(".ofv-docx-textbox-page-flow-main .ofv-docx-textbox-block h3::before")).toContain(
      "clip-path: polygon(0 0, 45% 0, 100% 50%, 45% 100%, 0 100%, 55% 50%)"
    );
    expect(rule(".ofv-docx-textbox-page-flow-main .ofv-docx-textbox-block h3::before")).toContain("width: 15px");
    expect(
      rule(
        ".ofv-docx-document section.ofv-docx > section,\n.ofv-docx-document section.ofv-docx .docx,\n.ofv-docx-document section.ofv-docx .docx-wrapper"
      )
    ).toContain("background: #fff");
    expect(
      rule(
        ".ofv-docx-document section.ofv-docx img,\n.ofv-docx-document section.ofv-docx svg,\n.ofv-docx-document section.ofv-docx canvas,\n.ofv-docx-document section.ofv-docx video"
      )
    ).toContain("max-width: 100%");
    expect(rule(".ofv-code-container")).toContain("max-width: 100%");
    expect(rule(".ofv-code-body")).toContain("overflow: auto");
    expect(rule(".ofv-code-body")).toContain("isolation: isolate");
    expect(rule(".ofv-code-gutter")).toContain("position: sticky");
    expect(rule(".ofv-code-gutter")).toContain("z-index: 3");
    expect(rule(".ofv-code-gutter")).toContain("background: var(--ofv-surface)");
    expect(rule(".ofv-code-container pre")).toContain("z-index: 0");
    expect(rule(".ofv-code-actions")).toContain("flex-wrap: nowrap");
    expect(rule(".ofv-code-action")).toContain("white-space: nowrap");
    expect(rule(".ofv-code-status")).toContain("text-overflow: ellipsis");
    expect(rule(".ofv-markdown-body")).toContain("overflow: auto");
    expect(rule(".ofv-markdown-body table")).toContain("max-width: 100%");
    expect(rule(".ofv-pdf")).toContain("overflow-x: hidden");
    expect(rule(".ofv-pdf")).toContain("overflow-y: auto");
    expect(rule(".ofv-pdf-page-wrapper")).toContain("overflow: hidden");
    expect(rule(".ofv-ofd")).toContain("--ofv-ofd-zoom: 1");
    expect(rule(".ofv-ofd")).toContain("--ofv-ofd-rotation: 0deg");
    expect(rule(".ofv-ofd")).toContain("height: 100%");
    expect(rule(".ofv-ofd")).toContain("min-height: 0");
    expect(rule(".ofv-ofd")).toContain("overflow: auto");
    expect(rule(".ofv-ofd-pages")).not.toContain("--ofv-ofd-zoom");
    expect(rule(".ofv-ofd-pages")).toContain("width: max-content");
    expect(rule(".ofv-ofd-pages")).toContain("min-width: 100%");
    expect(rule(".ofv-ofd-page")).toContain(
      "width: min(100%, calc(var(--ofv-ofd-page-width, 210mm) * var(--ofv-ofd-zoom)))"
    );
    expect(rule(".ofv-ofd-page")).toContain(
      "aspect-ratio: var(--ofv-ofd-page-width, 210mm) / var(--ofv-ofd-page-height, 297mm)"
    );
    expect(rule(".ofv-ofd.is-ofd-rotated-sideways .ofv-ofd-page")).toContain(
      "width: min(100%, calc(var(--ofv-ofd-page-height, 297mm) * var(--ofv-ofd-zoom)))"
    );
    expect(rule(".ofv-ofd-page svg")).toContain("transform: rotate(var(--ofv-ofd-rotation))");
    expect(rule(".ofv-ofd-page svg")).toContain("transform-origin: center");
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
    expect(rule(".ofv-table-scroll td,\n.ofv-table-scroll th")).toContain("overflow-wrap: anywhere");
    expect(rule(".ofv-table-scroll td,\n.ofv-table-scroll th")).toContain("overflow: hidden");
    expect(rule(".ofv-table-scroll td,\n.ofv-table-scroll th")).toContain("text-overflow: clip");
    expect(rule(".ofv-column-resize-handle")).toContain("right: 0");
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
    expect(rule(".ofv-pptx-viewer svg")).toContain("width: auto");
    expect(rule(".ofv-pptx-viewer svg")).toContain("stroke-width: initial");
    expect(rule(".ofv-parquet-schema")).toContain("max-width: 100%");
    expect(rule(".ofv-parquet-schema")).toContain("overflow: auto");
    expect(rule(".ofv-parquet-records")).toContain("max-width: 100%");
    expect(rule(".ofv-parquet-records")).toContain("overflow: auto");
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
      ".ofv-ofd"
    ]) {
      expect(rule(selector), selector).toContain("min-width: 0");
    }

    expect(rule(".ofv-archive")).toContain("height: 100%");
    expect(rule(".ofv-archive")).toContain("overflow: hidden");
    expect(rule(".ofv-archive-layout")).toContain("--ofv-archive-sidebar-expanded: 320px");
    expect(rule(".ofv-archive-layout")).toContain("--ofv-archive-sidebar-collapsed: 56px");
    expect(rule(".ofv-archive-layout")).toContain("flex-wrap: nowrap");
    expect(rule(".ofv-archive-layout.is-sidebar-collapsed .ofv-archive-sidebar")).toContain(
      "flex-basis: var(--ofv-archive-sidebar-collapsed)"
    );
    expect(rule(".ofv-archive-sidebar")).toContain("min-width: 0");
    expect(rule(".ofv-archive-sidebar")).toContain("overflow: hidden");
    expect(rule(".ofv-archive-sidebar-panel")).toContain("display: flex");
    expect(rule(".ofv-archive-sidebar-toggle")).toContain("display: inline-flex");
    expect(rule(".ofv-archive-tree")).toContain("overflow: auto");
    expect(rule(".ofv-archive-tree")).toContain("overscroll-behavior: contain");
    expect(rule(".ofv-archive-main")).toContain("overscroll-behavior: contain");
    expect(rule(".ofv-archive-item-icon")).toContain("display: inline-flex");
    expect(rule(".ofv-archive-item-icon")).toContain("justify-content: center");
    expect(rule(".ofv-archive-layout.is-sidebar-collapsed .ofv-archive-item")).toContain(
      "justify-content: center"
    );
    expect(css).toContain("@container (max-width: 520px)");
    expect(css).toContain("--ofv-archive-sidebar-expanded: min(280px, 72cqw)");
    expect(css).toContain("--ofv-archive-sidebar-collapsed: 48px");
    expect(css).toContain("opacity: 0");
    expect(rule(".ofv-email-attachments")).toContain("min-width: 0");
    expect(rule(".ofv-email-attachment-item")).toContain("max-width: 100%");
    expect(rule(".ofv-email-body-iframe")).toContain("max-width: 100%");
    expect(rule(".ofv-layout-grid")).toContain("grid-template-columns");
    expect(rule(".ofv-layout-grid")).toContain("minmax(180px, 260px)");
    expect(rule(".ofv-layout-grid .ofv-layout-cells,\n.ofv-layout-grid .ofv-layout-layers")).toContain("overflow: auto");
    expect(css).toContain(".ofv-layout-grid .ofv-layout-layers {\n  display: grid");
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
  const escaped = selector.replace(/\r\n?/g, "\n").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}.`);
  }
  return match.groups.body.replace(/\s+/g, " ").trim();
}
