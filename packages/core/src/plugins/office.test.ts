import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import JSZip from "jszip";
import { createViewer } from "../viewer";
import { renderLegacyWordDocument, type LegacyWordDocument } from "./msdoc";
import { officePlugin } from "./office";

const shouldFailDocxPreview = vi.hoisted(() => ({ value: false }));
const shouldHangDocxPreview = vi.hoisted(() => ({ value: false }));
const shouldFailMammoth = vi.hoisted(() => ({ value: false }));
const shouldHangMammoth = vi.hoisted(() => ({ value: false }));
const shouldRenderBlankDocxPreview = vi.hoisted(() => ({ value: false }));
const docxPreviewImageSrc = vi.hoisted(() => ({ value: "" }));
const shouldRenderVerticalDocxTable = vi.hoisted(() => ({ value: false }));
const renderDocxAsync = vi.hoisted(() =>
  vi.fn(async (_data: unknown, bodyContainer: HTMLElement, _styleContainer?: HTMLElement, _options?: unknown) => {
    if (shouldHangDocxPreview.value) {
      return new Promise<void>(() => undefined);
    }
    if (shouldFailDocxPreview.value) {
      throw new Error("docx-preview failed");
    }
    if (_styleContainer) {
      const style = document.createElement("style");
      style.textContent = `.docx-internal-style { color: red; }
        table.ofv-docx-table p { margin-inline: 0pt; }
        p.ofv-docx-num-1-0:before { content: "-\\9"; font-family: 宋体; }
        p.ofv-docx-num-1-0 { display: list-item; text-indent: -18pt; margin-inline-start: 18pt; }`;
      _styleContainer.append(style);
    }
    const wrapper = document.createElement("div");
    wrapper.className = "ofv-docx-wrapper";
    const page = document.createElement("section");
    page.className = "ofv-docx";
    page.style.width = "794px";
    page.style.height = "1123px";
    if (shouldRenderBlankDocxPreview.value) {
      wrapper.append(page);
      bodyContainer.append(wrapper);
      return;
    }
    const compactParagraph = document.createElement("p");
    compactParagraph.style.lineHeight = "0.06";
    compactParagraph.textContent = "DOCX compact paragraph";
    const percentParagraph = document.createElement("p");
    percentParagraph.style.lineHeight = "50%";
    percentParagraph.textContent = "DOCX percent paragraph";
    const normalParagraph = document.createElement("p");
    normalParagraph.style.lineHeight = "1.5";
    normalParagraph.textContent = "DOCX layout page";
    page.append(compactParagraph, percentParagraph, normalParagraph);
    if (docxPreviewImageSrc.value) {
      const image = document.createElement("img");
      image.src = docxPreviewImageSrc.value;
      page.append(image);
    }
    if (shouldRenderVerticalDocxTable.value) {
      const table = document.createElement("table");
      const row = table.insertRow();
      const cell = row.insertCell();
      cell.style.writingMode = "vertical-rl";
      const paragraph = document.createElement("p");
      paragraph.style.writingMode = "vertical-rl";
      paragraph.textContent = "采购字段名";
      cell.append(paragraph);
      page.append(table);
    }
    wrapper.append(page);
    bodyContainer.append(wrapper);
  })
);
const openPptx = vi.hoisted(() =>
  vi.fn(async (_data: unknown, container: HTMLElement) => {
    const wrapper = document.createElement("div");
    wrapper.dataset.slideIndex = "0";
    const viewport = document.createElement("div");
    viewport.style.position = "relative";
    viewport.style.width = "960px";
    viewport.style.height = "540px";
    viewport.style.overflow = "hidden";
    const page = document.createElement("div");
    page.className = "pptx-rendered";
    page.style.position = "relative";
    page.style.width = "1280px";
    page.style.height = "720px";
    page.style.transform = "scale(0.75)";
    page.textContent = "PPTX rendered";
    page.style.backgroundColor = "rgb(32, 33, 36)";
    const mirroredTextGroup = document.createElement("div");
    mirroredTextGroup.className = "pptx-mirrored-text-group";
    mirroredTextGroup.style.position = "absolute";
    mirroredTextGroup.style.left = "800px";
    mirroredTextGroup.style.top = "120px";
    mirroredTextGroup.style.width = "300px";
    mirroredTextGroup.style.height = "120px";
    mirroredTextGroup.style.transform = "scaleX(-1)";
    const title = document.createElement("div");
    title.textContent = "Mirrored title";
    const body = document.createElement("div");
    body.textContent = "Mirrored body";
    mirroredTextGroup.append(title, body);
    const inheritedPlaceholder = document.createElement("div");
    inheritedPlaceholder.className = "pptx-inherited-placeholder";
    inheritedPlaceholder.style.position = "absolute";
    inheritedPlaceholder.style.left = "98.1368px";
    inheritedPlaceholder.style.top = "454.223px";
    inheritedPlaceholder.style.width = "453.207px";
    inheritedPlaceholder.style.height = "132.222px";
    const inheritedText = document.createElement("span");
    inheritedText.style.fontSize = "37.35pt";
    inheritedText.textContent = "2027.11.30";
    inheritedPlaceholder.append(inheritedText);
    const autofitBody = document.createElement("div");
    autofitBody.className = "pptx-autofit-body";
    autofitBody.style.position = "absolute";
    autofitBody.style.left = "49.1307px";
    autofitBody.style.top = "188.964px";
    autofitBody.style.width = "952.381px";
    autofitBody.style.height = "345.2px";
    const autofitTextLayer = document.createElement("div");
    for (const text of [
      "• 不使用 复杂类型定义（泛型、方法重载、条件类型等）",
      "• 尽量使用常量枚举来定义多个相关常量",
      "• 显式行距保持不变"
    ]) {
      const paragraph = document.createElement("div");
      const run = document.createElement("span");
      run.style.fontSize = "32pt";
      run.textContent = text;
      paragraph.append(run);
      autofitTextLayer.append(paragraph);
    }
    autofitBody.append(autofitTextLayer);
    const circleCallout = document.createElement("div");
    circleCallout.style.position = "absolute";
    circleCallout.style.left = "12px";
    circleCallout.style.top = "140px";
    circleCallout.style.width = "138px";
    circleCallout.style.height = "130px";
    const circleShape = document.createElement("div");
    circleShape.className = "pptx-circle-shape";
    const circleText = document.createElement("div");
    circleText.style.position = "absolute";
    circleText.style.left = "0px";
    circleText.style.top = "0px";
    circleText.style.width = "138px";
    circleText.style.height = "130px";
    circleText.textContent = "代表性定义";
    circleCallout.append(circleShape, circleText);
    const redCircleCallout = document.createElement("div");
    redCircleCallout.style.position = "absolute";
    redCircleCallout.style.left = "12px";
    redCircleCallout.style.top = "320px";
    redCircleCallout.style.width = "136px";
    redCircleCallout.style.height = "130px";
    const redCircleShape = document.createElement("div");
    redCircleShape.className = "pptx-circle-shape";
    const redCircleText = document.createElement("div");
    redCircleText.style.position = "absolute";
    redCircleText.style.left = "0px";
    redCircleText.style.top = "0px";
    redCircleText.style.width = "136px";
    redCircleText.style.height = "130px";
    redCircleText.textContent = "包含的要素";
    redCircleCallout.append(redCircleShape, redCircleText);
    const diagramGroup = document.createElement("div");
    diagramGroup.className = "pptx-diagram-cycle-group";
    diagramGroup.style.position = "absolute";
    diagramGroup.style.left = "180px";
    diagramGroup.style.top = "100px";
    diagramGroup.style.width = "640px";
    diagramGroup.style.height = "480px";
    const diagramTexts = [
      "①有胜任能力的独立人员",
      "②对经济活动和事项的认定",
      "③确定与既定标准的符合程度",
      "④充分适当的审计证据",
      "⑤传递给预期使用者的报告",
      "⑥系统化的过程"
    ];
    for (const [index, text] of diagramTexts.entries()) {
      const box = document.createElement("div");
      box.style.position = "absolute";
      box.style.left = `${120 + index * 3}px`;
      box.style.top = `${40 + index * 2}px`;
      box.style.width = "433px";
      box.style.height = "433px";
      const inner = document.createElement("div");
      inner.style.position = "absolute";
      inner.style.left = "0px";
      inner.style.top = "0px";
      inner.style.width = "433px";
      inner.style.height = "433px";
      inner.style.display = "flex";
      inner.textContent = text;
      box.append(inner);
      diagramGroup.append(box);
    }
    page.append(mirroredTextGroup, inheritedPlaceholder, autofitBody, circleCallout, redCircleCallout, diagramGroup);
    viewport.append(page);
    wrapper.append(viewport);
    container.append(wrapper);
  })
);
const pptxRenderMode = vi.hoisted(() => ({ value: "normal" as "normal" | "hang" }));

vi.mock("docx-preview", () => ({
  renderAsync: renderDocxAsync
}));

vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn(async () => {
      if (shouldHangMammoth.value) {
        return new Promise(() => undefined);
      }
      if (shouldFailMammoth.value) {
        throw new Error("mammoth failed");
      }
      return { value: "<p>Mammoth content</p>", messages: [] };
    }),
    images: {
      imgElement: vi.fn((callback) => callback)
    }
  },
  convertToHtml: vi.fn(async () => {
    if (shouldHangMammoth.value) {
      return new Promise(() => undefined);
    }
    if (shouldFailMammoth.value) {
      throw new Error("mammoth failed");
    }
    return { value: "<p>Mammoth content</p>", messages: [] };
  }),
  images: {
    imgElement: vi.fn((callback) => callback)
  }
}));

vi.mock("@aiden0z/pptx-renderer", () => ({
  PptxViewer: {
    open: vi.fn((data: unknown, container: HTMLElement) => {
      if (pptxRenderMode.value === "hang") {
        return new Promise(() => undefined);
      }
      return openPptx(data, container);
    })
  }
}));

describe("officePlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll(".ofv-docx-style-container").forEach((element) => element.remove());
    vi.restoreAllMocks();
    shouldFailDocxPreview.value = false;
    shouldHangDocxPreview.value = false;
    shouldFailMammoth.value = false;
    shouldHangMammoth.value = false;
    shouldRenderBlankDocxPreview.value = false;
    docxPreviewImageSrc.value = "";
    shouldRenderVerticalDocxTable.value = false;
    pptxRenderMode.value = "normal";
    delete (globalThis as { __OFV_DOCX_RENDER_TIMEOUT_MS__?: number }).__OFV_DOCX_RENDER_TIMEOUT_MS__;
    delete (globalThis as { __OFV_PPTX_RENDER_TIMEOUT_MS__?: number }).__OFV_PPTX_RENDER_TIMEOUT_MS__;
  });

  it("renders workbook sheets with formula metadata", async () => {
    const xlsx = await import("xlsx");
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["A", 2],
      ["B", 3],
      ["Total", { f: "SUM(B2:B3)", v: 5 }]
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Summary");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "report.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector(".ofv-tabs button")?.classList.contains("is-active")).toBe(true);
    expect(container.querySelector(".ofv-tabs")?.getAttribute("role")).toBe("tablist");
    expect(container.querySelector(".ofv-tabs button")?.getAttribute("role")).toBe("tab");
    expect(container.querySelector(".ofv-tabs button")?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("role")).toBe("tabpanel");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("aria-label")).toBe("Summary");
    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("4 行 x 2 列");
    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("1 个公式单元格");
    expect(container.querySelector(".ofv-cell-formula")?.getAttribute("title")).toBe("=SUM(B2:B3)");
    expect(container.querySelector(".ofv-formula-list")?.textContent).toContain("B4: =SUM(B2:B3)");
    expect(container.querySelector<HTMLElement>(".ofv-formula-list")?.hidden).toBe(true);
    expect(visibleText(container)).not.toContain("公式明细");
    expect(visibleText(container)).not.toContain("B4: =SUM(B2:B3)");
  });

  it("renders embedded XLSX drawing images in their anchored cells", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithImage(),
      fileName: "image-cell.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-image img")));

    const imageCell = container.querySelector<HTMLTableCellElement>('[data-cell="A1"]');
    const image = imageCell?.querySelector<HTMLImageElement>("img");
    expect(imageCell?.classList.contains("ofv-cell-image")).toBe(true);
    expect(imageCell?.textContent).not.toContain("#VALUE!");
    expect(image?.src).toContain("data:image/png;base64,");
    expect(image?.alt).toBe("Inserted logo");
  });

  it("renders embedded XLSX drawing images when the sheet has no populated cells", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithImage({
        sheetDataXml: "",
        fromColumn: 4,
        fromRow: 5,
        toColumn: 6,
        toRow: 8,
        title: "Image-only logo"
      }),
      fileName: "image-only.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    const summary = container.querySelector(".ofv-sheet-summary");
    const imageCell = container.querySelector<HTMLTableCellElement>('[data-cell="E6"]');
    const image = imageCell?.querySelector<HTMLImageElement>("img");
    expect(summary?.textContent).toContain("4 行 x 3 列");
    expect(imageCell?.classList.contains("ofv-cell-image")).toBe(true);
    expect(image?.src).toContain("data:image/png;base64,");
    expect(image?.alt).toBe("Image-only logo");
  });

  it("renders embedded XLSX drawing images stored under the drawing folder", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithImage({
        fromColumn: 9,
        fromRow: 2,
        toColumn: 9,
        toRow: 2,
        mediaTarget: "media/image1.png",
        mediaFilePath: "xl/drawings/media/image1.png",
        title: "Drawing folder logo"
      }),
      fileName: "drawing-folder-media.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    const imageCell = container.querySelector<HTMLTableCellElement>('[data-cell="J3"]');
    const image = imageCell?.querySelector<HTMLImageElement>("img");
    expect(imageCell?.classList.contains("ofv-cell-image")).toBe(true);
    expect(image?.src).toContain("data:image/png;base64,");
    expect(image?.alt).toBe("Drawing folder logo");
  });

  it("renders WPS cell-embedded images referenced by DISPIMG formulas", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithWpsCellImage(),
      fileName: "wps-cell-image.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-image img")));

    const imageCell = container.querySelector<HTMLTableCellElement>('[data-cell="B2"]');
    const image = imageCell?.querySelector<HTMLImageElement>("img");
    expect(imageCell?.classList.contains("ofv-cell-image")).toBe(true);
    expect(imageCell?.textContent).not.toContain("#VALUE!");
    expect(image?.src).toContain("data:image/png;base64,");
    expect(image?.alt).toBe("WPS cell image");
  });

  it("renders rich-value in-cell images stored under xl/richData", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithRichValueCellImage(),
      fileName: "rich-value-cell-image.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-image img")));

    const imageCell = container.querySelector<HTMLTableCellElement>('[data-cell="C3"]');
    const image = imageCell?.querySelector<HTMLImageElement>("img");
    expect(imageCell?.classList.contains("ofv-cell-image")).toBe(true);
    expect(imageCell?.textContent).not.toContain("#VALUE!");
    expect(image?.src).toContain("data:image/png;base64,");
  });

  it("responds to shared toolbar zoom for workbook previews", async () => {
    const xlsx = await import("xlsx");
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Name", "Value"],
      ["A", 2]
    ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, "Summary");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "toolbar.xlsx",
      toolbar: true,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet")));

    const panel = container.querySelector<HTMLElement>(".ofv-office");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(zoomOut?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(true);

    zoomIn?.click();
    expect(panel?.style.getPropertyValue("--ofv-office-zoom")).toBe("1.12");
    zoomOut?.click();
    expect(panel?.style.getPropertyValue("--ofv-office-zoom")).toBe("1");
  });

  it("preserves workbook merges, dimensions and basic cell styling", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createStyledWorkbook(),
      fileName: "styled.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    const titleCell = container.querySelector<HTMLTableCellElement>('[data-cell="A1"]');
    const mergedNote = container.querySelector<HTMLTableCellElement>('[data-cell="B2"]');
    const table = container.querySelector<HTMLTableElement>(".ofv-workbook-table");
    expect(titleCell?.colSpan).toBe(3);
    expect(titleCell?.style.backgroundColor).toBe("rgb(217, 245, 214)");
    expect(titleCell?.style.color).toBe("rgb(31, 41, 55)");
    const darkFillCell = container.querySelector<HTMLTableCellElement>('[data-cell="A4"]');
    expect(darkFillCell?.style.backgroundColor).toBe("rgb(30, 58, 138)");
    expect(darkFillCell?.style.color).toBe("rgb(248, 250, 252)");
    const inkCell = container.querySelector<HTMLTableCellElement>('[data-cell="C4"]');
    const sourceWrappedCell = container.querySelector<HTMLTableCellElement>('[data-cell="A3"]');
    expect(inkCell?.textContent).toBe("Black ink");
    expect(inkCell?.style.color).toBe("rgb(0, 0, 0)");
    expect(inkCell?.style.fontWeight).toBe("700");
    expect(container.querySelector<HTMLTableCellElement>('[data-cell="C3"]')?.classList.contains("ofv-cell-number")).toBe(true);
    expect(container.querySelector('[data-cell="B1"]')).toBeNull();
    expect(mergedNote?.rowSpan).toBe(2);
    expect(mergedNote?.classList.contains("ofv-cell-multiline")).toBe(true);
    expect(mergedNote?.textContent).toBe("Multiline\nnote");
    expect(sourceWrappedCell?.classList.contains("ofv-cell-multiline")).toBe(true);
    expect(titleCell?.classList.contains("ofv-cell-multiline")).toBe(false);
    expect(table?.style.width).toBe("380px");
    expect(container.querySelector<HTMLTableRowElement>("tr")?.style.height).toBe("21px");
    expect(container.querySelector(".ofv-column-resize-handle")).not.toBeNull();
  });

  it("preserves Excel rich text runs inside sheet cells", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createRichTextWorkbook(),
      fileName: "rich-text.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-table")));

    const sharedCell = container.querySelector<HTMLTableCellElement>('[data-cell="A1"]');
    const inlineCell = container.querySelector<HTMLTableCellElement>('[data-cell="B1"]');
    const sharedRuns = sharedCell?.querySelectorAll<HTMLElement>(".ofv-rich-text-run");
    const inlineRuns = inlineCell?.querySelectorAll<HTMLElement>(".ofv-rich-text-run");

    expect(sharedCell?.textContent).toBe("Bold red normal");
    expect(sharedCell?.classList.contains("ofv-cell-rich-text")).toBe(true);
    expect(sharedRuns?.[0]?.textContent).toBe("Bold red");
    expect(sharedRuns?.[0]?.style.fontWeight).toBe("700");
    expect(sharedRuns?.[0]?.style.color).toBe("rgb(255, 0, 0)");
    expect(sharedRuns?.[1]?.textContent).toBe(" normal");
    expect(sharedRuns?.[1]?.style.fontWeight).toBe("");

    expect(inlineCell?.textContent).toBe("Italic blue and underlined");
    expect(inlineRuns?.[0]?.style.fontStyle).toBe("italic");
    expect(inlineRuns?.[0]?.style.color).toBe("rgb(0, 112, 192)");
    expect(inlineRuns?.[2]?.style.textDecoration).toContain("underline");
  });

  it("preserves wide Excel column widths from worksheet metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWideColumnWorkbook(),
      fileName: "wide-columns.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-table")));

    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="0"]')?.style.width).toBe("480px");
    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="1"]')?.style.width).toBe("60px");
    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="2"]')?.style.width).toBe("84px");
    expect(container.querySelector<HTMLTableElement>(".ofv-workbook-table")?.style.width).toBe("624px");
  });

  it("uses per-column max digit width when converting Excel widths", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createVariableMdwColumnWorkbook(),
      fileName: "variable-mdw-columns.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-workbook-table")));

    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="0"]')?.style.width).toBe("117px");
    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="1"]')?.style.width).toBe("623px");
    expect(container.querySelector<HTMLTableElement>(".ofv-workbook-table")?.style.width).toBe("740px");

    const mdwFourTab = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-tabs button")).find(
      (button) => button.textContent === "MDW Four"
    );
    mdwFourTab?.click();

    await waitFor(() => container.querySelector<HTMLTableColElement>('col[data-column-index="0"]')?.style.width === "139px");

    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="0"]')?.style.width).toBe("139px");
    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="1"]')?.style.width).toBe("331px");
    expect(container.querySelector<HTMLTableElement>(".ofv-workbook-table")?.style.width).toBe("470px");
  });

  it("allows workbook columns to be resized from cell edges", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createStyledWorkbook(),
      fileName: "resizable.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-column-resize-handle")));

    const resizeHandles = Array.from(container.querySelectorAll<HTMLElement>(".ofv-column-resize-handle"));
    expect(resizeHandles.map((handle) => handle.dataset.columnIndex)).toEqual(["2", "0", "1"]);

    const firstColumnCell = container.querySelector<HTMLTableCellElement>('[data-cell="A2"]');
    const handle = firstColumnCell?.querySelector<HTMLElement>('.ofv-column-resize-handle[data-column-index="0"]');
    firstColumnCell!.getBoundingClientRect = () =>
      ({ width: 120, height: 24, top: 0, right: 120, bottom: 24, left: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    handle!.setPointerCapture = vi.fn();

    handle!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, pointerId: 1 }));
    handle!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 170, pointerId: 1 }));

    await waitFor(() => container.querySelector<HTMLTableElement>(".ofv-workbook-table")?.style.width === "450px");

    expect(container.querySelector<HTMLTableElement>(".ofv-workbook-table")?.style.width).toBe("450px");
    expect(container.querySelector<HTMLTableColElement>('col[data-column-index="0"]')?.style.width).toBe("190px");
  });

  it("decodes GBK CSV files before rendering sheet cells", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(
        [
          Uint8Array.from([
            0xca, 0xd3, 0xc6, 0xb5, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xbf, 0xaa, 0xca, 0xbc, 0xca, 0xb1, 0xbc,
            0xe4, 0x28, 0xc3, 0xeb, 0x29, 0x2c, 0xbd, 0xe1, 0xca, 0xf8, 0xca, 0xb1, 0xbc, 0xe4, 0x28, 0xc3,
            0xeb, 0x29, 0x2c, 0xb6, 0xaf, 0xd7, 0xf7, 0xc3, 0xfb, 0xb3, 0xc6, 0x0a, 0xb0, 0xb2, 0xc8, 0xab,
            0xb7, 0xc0, 0xbb, 0xa4, 0xd3, 0xeb, 0xca, 0xb5, 0xb2, 0xd9, 0xbc, 0xec, 0xb2, 0xe9, 0x2e, 0x6d,
            0x70, 0x34, 0x2c, 0x30, 0x2c, 0x31, 0x30, 0x2c, 0xc6, 0xe4, 0xcb, 0xfb, 0x0a
          ])
        ],
        { type: "text/csv" }
      ),
      fileName: "action.csv",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector('[data-cell="A1"]')?.textContent).toBe("视频名称");
    expect(container.querySelector('[data-cell="B1"]')?.textContent).toBe("开始时间(秒)");
    expect(container.querySelector('[data-cell="A2"]')?.textContent).toBe("安全防护与实操检查.mp4");
    expect(container.querySelector('[data-cell="D2"]')?.textContent).toBe("其他");
    expect(container.textContent).not.toContain("��");
  });

  it("renders legacy .xls files when the workbook parser can read them", async () => {
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["Item", "Value"], ["Revenue", 42]]), "Legacy");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xls" }) as ArrayBuffer;

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "legacy.xls",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("2 行 x 2 列");
    expect(container.querySelector('[data-cell="A2"]')?.textContent).toBe("Revenue");
    expect(container.querySelector(".ofv-office-conversion")).toBeNull();
  });

  it("keeps invalid workbook parsing failures local to the Office panel", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }),
      fileName: "broken.xlsx",
      plugins: [officePlugin()],
      onError
    });

    await waitFor(() => container.textContent?.includes("表格解析失败") === true);

    expect(container.querySelector(".ofv-office")?.textContent).toContain(".xlsx 文件无法解析");
    expect(container.querySelector(".ofv-status")?.textContent).toBe("");
    expect(onError).not.toHaveBeenCalled();
  });

  it("uses stable sheet table ids for sheet names with special characters", async () => {
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["值"], [1]]), "销售 汇总 (2026)");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "sales.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector(".ofv-sheet")?.getAttribute("aria-label")).toBe("销售 汇总 (2026)");
    expect(container.querySelector(".ofv-table-scroll table")?.id).toBe("ofv-sheet-1");
  });

  it("keeps long workbook labels and cells inside a narrow host", async () => {
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ["ExtremelyLongHeaderThatShouldRemainInsideTheScrollableTable"],
        ["ExtremelyLongCellValueThatShouldNotExpandTheOuterViewerContainer"]
      ]),
      "VeryLongSheetNameForNarrowUI"
    );
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const container = document.createElement("div");
    container.style.width = "240px";
    container.style.height = "260px";
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "long.xlsx",
      width: "240px",
      height: "260px",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-table-scroll")));

    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector(".ofv-tabs button")?.getAttribute("title")).toBe("VeryLongSheetNameForNarrowUI");
    expect(container.querySelector(".ofv-table-scroll table")).not.toBeNull();
    expect(container.querySelector('[data-cell="A2"]')?.getAttribute("title")).toBe(
      "ExtremelyLongCellValueThatShouldNotExpandTheOuterViewerContainer"
    );
    expect(container.textContent).toContain("VeryLongSheetNameForNarrowUI");
  });

  it("window-renders large workbook sheets and can page rows and columns", async () => {
    const xlsx = await import("xlsx");
    const rows = Array.from({ length: 205 }, (_row, rowIndex) =>
      Array.from({ length: 82 }, (_column, columnIndex) => `R${rowIndex + 1}C${columnIndex + 1}`)
    );
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), "Large");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "large.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-window")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("205 行 x 82 列");
    expect(container.querySelector(".ofv-sheet-window-note")?.textContent).toContain("当前 1-200 行，1-80 列");
    expect(container.querySelectorAll(".ofv-table-scroll tr")).toHaveLength(200);
    expect(container.querySelector(".ofv-table-scroll [data-cell='A1']")?.textContent).toBe("R1C1");
    expect(container.querySelector(".ofv-table-scroll [data-cell='CC1']")).toBeNull();
    expect(container.querySelector(".ofv-table-scroll [data-cell='A201']")).toBeNull();

    const rowNext = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-sheet-window button")).find(
      (button) => button.textContent === "下 200 行"
    );
    rowNext?.click();

    await waitFor(() => container.querySelector(".ofv-sheet-window-note")?.textContent?.includes("当前 6-205 行") || false);
    expect(container.querySelector(".ofv-table-scroll [data-cell='A6']")?.textContent).toBe("R6C1");
    expect(container.querySelector(".ofv-table-scroll [data-cell='A205']")?.textContent).toBe("R205C1");

    const colNext = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-sheet-window button")).find(
      (button) => button.textContent === "右 80 列"
    );
    colNext?.click();

    await waitFor(() => container.querySelector(".ofv-sheet-window-note")?.textContent?.includes("3-82 列") || false);
    expect(container.querySelector(".ofv-table-scroll [data-cell='C6']")?.textContent).toBe("R6C3");
    expect(container.querySelector(".ofv-table-scroll [data-cell='CD6']")?.textContent).toBe("R6C82");
  }, 45000);

  it("renders workbook chart previews from embedded OOXML chart parts", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithChart(),
      fileName: "chart.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-chart-card")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("3 行 x 2 列");
    expect(container.querySelector(".ofv-chart-card h4")?.textContent).toBe("Quarterly Revenue");
    expect(container.querySelector(".ofv-chart-card header span")?.textContent).toContain("bar");
    expect(container.querySelector(".ofv-chart-card header span")?.textContent).toContain("1 个系列");
    expect(container.querySelector(".ofv-chart-svg")?.getAttribute("role")).toBe("img");
    expect(container.querySelector(".ofv-chart-svg")?.getAttribute("text-rendering")).toBe("geometricPrecision");
    expect(container.querySelectorAll(".ofv-chart-svg rect[data-index]")).toHaveLength(3);
    expect(container.querySelector(".ofv-chart-title")?.textContent).toBe("Quarterly Revenue");
    expect(Array.from(container.querySelectorAll(".ofv-chart-label")).some((label) => label.textContent === "Q1")).toBe(true);
    expect(container.querySelectorAll(".ofv-chart-gridline").length).toBeGreaterThan(0);
    expect(container.querySelector(".ofv-chart-data")?.textContent).toContain("Revenue: 12, 18, 30");
    expect(container.querySelector<HTMLElement>(".ofv-chart-data")?.hidden).toBe(true);
    expect(visibleText(container)).not.toContain("数据摘要");
    expect(visibleText(container)).not.toContain("Revenue: 12, 18, 30");
  });

  it("renders category labels on the horizontal axis of line charts", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createWorkbookWithChart("line"),
      fileName: "line-chart.xlsx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-chart-card")));

    const labels = Array.from(container.querySelectorAll('[data-axis="category"]')).map((label) => label.textContent);
    expect(labels).toEqual(["Q1", "Q2", "Q3"]);
    expect(container.querySelectorAll(".ofv-chart-svg polyline")).toHaveLength(1);
  });

  it("renders DOCX embedded chart placeholders from OOXML chart parts", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.innerHTML = `<p><span><div style="display:inline-block;position:relative;width:320pt;height:180pt"></div></span></p>`;
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createDocxWithChart(),
      fileName: "chart.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg")));

    expect(container.querySelector(".ofv-docx-chart-preview")?.getAttribute("data-ofv-docx-chart-preview")).toBe("true");
    expect(container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg")?.getAttribute("role")).toBe("img");
    expect(container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg")?.getAttribute("aria-label")).toBe("Quarterly Revenue");
    expect(container.querySelectorAll(".ofv-docx-chart-preview .ofv-chart-svg rect[data-index]")).toHaveLength(3);
    expect(container.querySelector(".ofv-docx-chart-preview .ofv-chart-title")?.textContent).toBe("Quarterly Revenue");
    expect(container.querySelectorAll(".ofv-docx-chart-preview .ofv-chart-gridline").length).toBeGreaterThan(0);
  });

  it("preserves DOCX chart axis bounds, date labels, and mixed bar-line series", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.innerHTML = `<p><span><div style="display:inline-block;position:relative;width:320pt;height:180pt"></div></span></p>`;
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createDocxWithChart("combo"),
      fileName: "combo-chart.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg")));

    const chart = container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg");
    const labels = Array.from(chart?.querySelectorAll('[data-axis="category"]') || []).map((label) => label.textContent);
    const ticks = Array.from(chart?.querySelectorAll(".ofv-chart-label") || []).map((label) => label.textContent);
    expect(labels).toEqual(["2022/6", "2022/7"]);
    expect(chart?.querySelectorAll("rect[data-index]")).toHaveLength(3);
    expect(chart?.querySelectorAll("polyline")).toHaveLength(1);
    expect(chart?.querySelectorAll(".ofv-chart-secondary-axis-label")).toHaveLength(4);
    expect(ticks).toContain("-60%");
    expect(ticks).toContain("14");
    expect(chart?.querySelector(".ofv-chart-axis-title")?.textContent).toBe("(万辆)");
    expect(chart?.querySelector(".ofv-chart-title")).toBeNull();
  });

  it("positions sparse DOCX category labels using their cached point indexes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.innerHTML = `<p><span><div style="display:inline-block;position:relative;width:320pt;height:180pt"></div></span></p>`;
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createDocxWithChart("sparse-line"),
      fileName: "sparse-line-chart.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-chart-preview .ofv-chart-svg")));

    const labels = Array.from(container.querySelectorAll<SVGTextElement>('[data-axis="category"]'));
    expect(labels.map((label) => label.textContent)).toEqual(["1日", "5日", "9日", "13日", "17日", "21日", "25日", "29日"]);
    expect(labels.map((label) => Number(label.getAttribute("x")))).toEqual([
      74,
      141.9,
      209.7,
      277.6,
      345.5,
      413.4,
      481.2,
      549.1
    ]);
  });

  it("renders flat ODS spreadsheets with repeated cells and formulas", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([createMinimalFods()], { type: "application/vnd.oasis.opendocument.spreadsheet" }),
      fileName: "budget.fods",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector(".ofv-tabs button")?.textContent).toBe("Budget");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("aria-label")).toBe("Budget");
    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("3 行 x 3 列");
    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("1 个公式单元格");
    expect(container.querySelector('[data-cell="A1"]')?.textContent).toBe("Item");
    expect(container.querySelector('[data-cell="B1"]')?.textContent).toBe("Month");
    expect(container.querySelector('[data-cell="C1"]')?.textContent).toBe("Month");
    expect(container.querySelector('[data-cell="B2"]')?.textContent).toBe("42");
    expect(container.querySelector('[data-cell="C2"]')?.textContent).toBe("2026-06-14");
    expect(container.querySelector(".ofv-cell-formula")?.getAttribute("title")).toBe("of:=SUM([.B2:.B3])");
    expect(container.querySelector(".ofv-formula-list")?.textContent).toContain("B3: of:=SUM([.B2:.B3])");
  });

  it("uses the layout DOCX renderer before falling back to content extraction", async () => {
    const container = document.createElement("div");
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "letter.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-document")?.parentElement?.classList.contains("ofv-office")).toBe(true);
    expect(container.querySelector(".ofv-office > section > h3")).toBeNull();
    expect(renderDocxAsync.mock.calls.at(-1)?.[3]).toMatchObject({
      className: "ofv-docx",
      breakPages: true,
      renderHeaders: true,
      renderFooters: true
    });
    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
  });

  it("prefers an embedded SVG alternative over its lossy DOCX fallback image", async () => {
    const container = document.createElement("div");
    const fixture = await createDocxWithSvgImageAlternative();
    docxPreviewImageSrc.value = fixture.fallbackDataUrl;
    document.body.append(container);

    createViewer({
      container,
      file: fixture.file,
      fileName: "flowchart.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelector("img")?.dataset.ofvDocxSvgAlternative === "true");

    const image = container.querySelector<HTMLImageElement>(".ofv-docx-document img");
    expect(image?.src).toBe(fixture.svgDataUrl);
    expect(image?.src).toContain("data:image/svg+xml;base64,");
  });

  it("repairs unexpected vertical table text when the DOCX does not declare it", async () => {
    const container = document.createElement("div");
    shouldRenderVerticalDocxTable.value = true;
    document.body.append(container);

    createViewer({
      container,
      file: await createDocxWithTableTextDirection(false),
      fileName: "horizontal-table.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelector<HTMLTableCellElement>(".ofv-docx-document td")?.style.writingMode === "horizontal-tb");

    expect(container.querySelector<HTMLTableCellElement>(".ofv-docx-document td")?.style.writingMode).toBe("horizontal-tb");
    expect(container.querySelector<HTMLParagraphElement>(".ofv-docx-document td p")?.style.writingMode).toBe("horizontal-tb");
  });

  it("preserves table text direction when the DOCX explicitly declares vertical text", async () => {
    const container = document.createElement("div");
    shouldRenderVerticalDocxTable.value = true;
    document.body.append(container);

    createViewer({
      container,
      file: await createDocxWithTableTextDirection(true),
      fileName: "vertical-table.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document td")));

    expect(container.querySelector<HTMLTableCellElement>(".ofv-docx-document td")?.style.writingMode).toBe("vertical-rl");
    expect(container.querySelector<HTMLParagraphElement>(".ofv-docx-document td p")?.style.writingMode).toBe("vertical-rl");
  });

  it("sniffs OOXML Word packages even when they use a legacy .doc extension", async () => {
    const container = document.createElement("div");
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalDocx("Mislabeled docx"),
      fileName: "template.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-office-package-note")).toBeNull();
    expect(container.textContent).not.toContain("兼容包识别");
    expect(container.querySelector(".ofv-office-conversion")).toBeNull();
    expect(container.querySelector(".ofv-office")?.classList.contains("ofv-office-docx")).toBe(true);
    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
  });

  it("renders UTF-16 Word HTML saved with a legacy .doc extension", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const html = `<!doctype html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office">
        <head><meta name="ProgId" content="Word.Document"></head>
        <body lang="ZH-CN">
          <p class="MsoNormal" style="text-indent:28pt;line-height:22pt" onclick="alert('x')">
            <span style="font-size:14pt">四、到货时间：2026-06-22。</span>
          </p>
          <script>document.body.textContent = 'unsafe';</script>
        </body>
      </html>`;
    const utf16Html = new Uint8Array([0xff, 0xfe, ...encodeUtf16Le(html)]);

    createViewer({
      container,
      file: new Blob([toBlobPart(utf16Html)], { type: "application/msword" }),
      fileName: "测试.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-word-html-document")));

    const paragraph = container.querySelector<HTMLParagraphElement>(".ofv-word-html-document p");
    expect(paragraph?.textContent).toContain("四、到货时间：2026-06-22。");
    expect(paragraph?.style.textIndent).toBe("28pt");
    expect(paragraph?.hasAttribute("onclick")).toBe(false);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".ofv-office-conversion")).toBeNull();
    expect(container.textContent).not.toContain("legacy Microsoft Office binary format");
  });

  it("normalizes impossible DOCX line heights that would overlap text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "compressed-line-height.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const paragraphs = Array.from(container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p"));

    expect(paragraphs[0]?.style.lineHeight).toBe("1.2");
    expect(paragraphs[1]?.style.lineHeight).toBe("1.2");
    expect(paragraphs[2]?.style.lineHeight).toBe("1.5");
  });

  it("uses the DOCX complex-script size when no regular font size is present", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      for (const text of ["仅复杂脚本字号", "普通字号优先"]) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        page.append(paragraph);
      }
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:pPr><w:rPr><w:szCs w:val="21"/></w:rPr></w:pPr>
          <w:r><w:rPr><w:szCs w:val="21"/></w:rPr><w:t>仅复杂脚本字号</w:t></w:r>
        </w:p>
        <w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="21"/></w:rPr></w:pPr>
          <w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="21"/></w:rPr><w:t>普通字号优先</w:t></w:r>
        </w:p>
      </w:body></w:document>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "complex-script-size.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx p").length === 2);

    const paragraphs = Array.from(container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p"));
    expect(paragraphs[0]?.style.fontSize).toBe("10pt");
    expect(paragraphs[1]?.style.fontSize).toBe("");
  });

  it("preserves condensed DOCX title text on one line like WPS", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.height = "800pt";
      const article = document.createElement("article");
      article.className = "ofv-docx-document";
      const paragraph = document.createElement("p");
      paragraph.style.textAlign = "right";
      paragraph.textContent = "中共玉门市委办公室文件";
      article.append(paragraph);
      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:rPr><w:w w:val="55"/></w:rPr><w:t>中共玉门市委办公室文件</w:t></w:r></w:p>
      </w:body></w:document>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "condensed-title.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("[data-ofv-docx-character-scaled='true']")));

    const paragraph = container.querySelector<HTMLParagraphElement>("section.ofv-docx p");
    const scaled = paragraph?.querySelector<HTMLElement>(".ofv-docx-character-scale");
    expect(paragraph?.style.whiteSpace).toBe("nowrap");
    expect(scaled?.style.transform).toBe("scaleX(0.55)");
    expect(scaled?.style.transformOrigin).toBe("left center");
  });

  it("aligns right-tab DOCX text to the OOXML tab position", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      const paragraph = document.createElement("p");
      const start = document.createElement("span");
      start.textContent = "青岛市刘致远街道";
      const tabRun = document.createElement("span");
      const tabStop = document.createElement("span");
      tabStop.className = "ofv-docx-tab-stop";
      tabStop.textContent = "\u00a0";
      tabRun.append(tabStop);
      const end = document.createElement("span");
      end.textContent = "2026年06月19日印发";
      paragraph.append(start, tabRun, end);
      page.append(paragraph);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:p><w:pPr><w:framePr w:yAlign="bottom"/><w:tabs><w:tab w:val="right" w:pos="8500"/></w:tabs></w:pPr>
            <w:r><w:t>青岛市刘致远街道</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>2026年06月19日印发</w:t></w:r>
          </w:p></w:body>
        </w:document>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "right-tab.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-right-tab-line")));

    const line = container.querySelector<HTMLElement>(".ofv-docx-right-tab-line");
    expect(line?.style.getPropertyValue("--ofv-docx-right-tab-position")).toBe("425pt");
    expect(line?.querySelector(".ofv-docx-right-tab-start")?.textContent).toBe("青岛市刘致远街道");
    expect(line?.querySelector(".ofv-docx-right-tab-end")?.textContent).toBe("2026年06月19日印发");
    expect(container.querySelector(".ofv-docx-right-tab-source .ofv-docx-tab-stop")).not.toBeNull();
    expect(line?.closest(".ofv-docx-page-bottom-frame")?.parentElement?.classList.contains("ofv-docx")).toBe(true);
  });

  it("keeps a bottom-anchored right-tab frame on the final DOCX page", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "600px";
      page.style.minHeight = "200px";
      page.style.padding = "20px";
      const article = document.createElement("article");
      const body = document.createElement("p");
      body.textContent = "Body content";
      const frame = document.createElement("p");
      const start = document.createElement("span");
      start.textContent = "Left";
      const tabRun = document.createElement("span");
      const tabStop = document.createElement("span");
      tabStop.className = "ofv-docx-tab-stop";
      tabStop.textContent = "\u00a0";
      tabRun.append(tabStop);
      const end = document.createElement("span");
      end.textContent = "Right";
      frame.append(start, tabRun, end);
      article.append(body, frame);
      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const bottom = this.classList.contains("ofv-docx-page-bottom-frame") ? 220 : this.tagName === "P" ? 100 : 0;
      return { x: 0, y: 0, top: 0, right: 600, bottom, left: 0, width: 600, height: bottom, toJSON: () => ({}) };
    });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>Body content</w:t></w:r></w:p>
        <w:p><w:pPr><w:framePr w:yAlign="bottom"/><w:tabs><w:tab w:val="right" w:pos="3000"/></w:tabs></w:pPr>
          <w:r><w:t>Left</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Right</w:t></w:r>
        </w:p>
      </w:body></w:document>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "bottom-frame.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-page-bottom-frame")));

    const pages = container.querySelectorAll("section.ofv-docx");
    const frame = container.querySelector<HTMLElement>(".ofv-docx-page-bottom-frame");
    expect(pages).toHaveLength(1);
    expect(frame?.parentElement).toBe(pages[0]);
    expect(frame?.style.left).toBe("20px");
    expect(frame?.style.right).toBe("20px");
    expect(frame?.style.bottom).toBe("20px");
  });

  it("normalizes DOCX atLeast line heights against the largest child font", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "794px";
      page.style.minHeight = "1123px";
      const article = document.createElement("article");

      for (const [lineHeight, fontSize, text] of [
        ["calc(100% + 2.4px)", "21pt", "DOCX title with an undersized atLeast line box"],
        ["calc(100% + 2.4px)", "15pt", "DOCX body with an undersized atLeast line box"],
        ["calc(100% + 40px)", "15pt", "DOCX body with an intentional wide minimum line box"]
      ]) {
        const paragraph = document.createElement("p");
        paragraph.style.lineHeight = lineHeight;
        const run = document.createElement("span");
        run.style.fontSize = fontSize;
        run.textContent = text;
        paragraph.append(run);
        article.append(paragraph);
      }

      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      fileName: "at-least-line-height.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const paragraphs = Array.from(container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p"));
    expect(paragraphs[0]?.style.lineHeight).toBe("1.2");
    expect(paragraphs[1]?.style.lineHeight).toBe("1.2");
    expect(paragraphs[2]?.style.lineHeight).toBe("40px");
  });

  it("adds the DOCX East Asian theme font after the Latin theme font", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement, styleContainer?: HTMLElement) => {
      if (styleContainer) {
        styleContainer.textContent = `.ofv-docx-wrapper { --docx-minorHAnsi-font: Calibri; }
          .ofv-docx p span { font-family: var(--docx-minorHAnsi-font); font-size: 10.5pt; }`;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "794px";
      page.style.minHeight = "1123px";
      const article = document.createElement("article");
      const paragraph = document.createElement("p");
      const run = document.createElement("span");
      run.textContent = "中文主题字体需要使用宋体回退以保留原始文档的换行和分页布局。";
      paragraph.append(run);
      article.append(paragraph);
      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`
    );
    zip.file(
      "word/styles.xml",
      `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsiaTheme="minorEastAsia"/></w:rPr></w:rPrDefault></w:docDefaults>
      </w:styles>`
    );
    zip.file(
      "word/theme/theme1.xml",
      `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/>
          <a:font script="Hans" typeface="宋体"/>
        </a:minorFont></a:fontScheme></a:themeElements>
      </a:theme>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "east-asian-theme.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const css = document.head.querySelector<HTMLStyleElement>(".ofv-docx-style-container")?.textContent || "";
    expect(css).toContain(
      "font-family: var(--docx-minorHAnsi-font), var(--ofv-docx-east-asia-font);"
    );
    expect(css).toContain('--ofv-docx-east-asia-font: "宋体"');
    expect(css).toContain('--docx-majorEastAsia-font: "宋体"');
    expect(css).toContain('--docx-minorEastAsia-font: "宋体"');
  });

  it("moves overflowing DOCX flow blocks onto continuation pages", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "600px";
      page.style.minHeight = "400px";
      page.style.padding = "50px";
      const header = document.createElement("header");
      header.textContent = "Repeated header";
      const article = document.createElement("article");

      for (let index = 1; index <= 5; index += 1) {
        const paragraph = document.createElement("div");
        paragraph.textContent = `Overflow paragraph ${index}`;
        paragraph.getBoundingClientRect = () => {
          const position = Array.from(paragraph.parentElement?.children || []).indexOf(paragraph);
          const top = 50 + Math.max(0, position) * 120;
          return { x: 0, y: top, top, right: 500, bottom: top + 100, left: 0, width: 500, height: 100, toJSON: () => ({}) };
        };
        article.append(paragraph);
      }

      const footer = document.createElement("footer");
      const footerParagraph = document.createElement("p");
      for (const text of ["-", "2", "-"]) {
        const span = document.createElement("span");
        span.textContent = text;
        footerParagraph.append(span);
      }
      footer.append(footerParagraph);
      page.append(header, article, footer);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`
    );
    zip.file(
      "word/footer1.xml",
      `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>
        <w:r><w:t>-</w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>-</w:t></w:r>
      </w:p></w:ftr>`
    );
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "overflowing-flow.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 3);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    expect(pages[0]?.querySelector("article")?.textContent).toBe("Overflow paragraph 1Overflow paragraph 2");
    expect(pages[1]?.querySelector("article")?.textContent).toBe("Overflow paragraph 3Overflow paragraph 4");
    expect(pages[2]?.querySelector("article")?.textContent).toBe("Overflow paragraph 5");
    expect(pages[1]?.querySelector("header")?.textContent).toBe("Repeated header");
    expect(pages[1]?.dataset.ofvDocxFlowContinuation).toBe("true");
    expect(pages.map((page) => page.querySelector("footer")?.textContent)).toEqual(["-2-", "-3-", "-4-"]);
  });

  it("removes an empty continuation page after restoring the closing date to the cover", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";

      const cover = document.createElement("section");
      cover.className = "ofv-docx";
      cover.style.width = "595.3pt";
      cover.style.height = "800pt";
      cover.style.padding = "36pt";
      cover.innerHTML = `<article><p>中共玉门市委办公室</p></article><footer><p>—1—</p></footer>`;

      const emptyContinuation = document.createElement("section");
      emptyContinuation.className = "ofv-docx";
      emptyContinuation.dataset.ofvDocxFlowContinuation = "true";
      emptyContinuation.style.width = "595.3pt";
      emptyContinuation.style.height = "800pt";
      emptyContinuation.style.padding = "36pt";
      emptyContinuation.innerHTML = `<article><p>2 0 2 5 年 7 月 7 日</p></article><footer><p>—1—</p></footer>`;

      const bodyPage = document.createElement("section");
      bodyPage.className = "ofv-docx";
      bodyPage.style.width = "595.3pt";
      bodyPage.style.height = "800pt";
      bodyPage.style.padding = "36pt";
      bodyPage.innerHTML = `<article><p>玉门市党政机关差旅费管理办法</p></article><footer><p>—2—</p></footer>`;

      wrapper.append(cover, emptyContinuation, bodyPage);
      bodyContainer.append(wrapper);
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await createMinimalDocx(),
      fileName: "closing-date-empty-continuation.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 2);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    expect(pages[0]?.querySelector("article")?.textContent).toContain("中共玉门市委办公室");
    expect(pages[0]?.querySelector("article")?.textContent).toContain("2 0 2 5 年 7 月 7 日");
    expect(pages[1]?.querySelector("article")?.textContent).toContain("玉门市党政机关差旅费管理办法");
    expect(pages.map((page) => page.querySelector("footer")?.textContent)).toEqual(["—1—", "—2—"]);
  });

  it("preserves a continuation page that still contains meaningful content", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const cover = document.createElement("section");
      cover.className = "ofv-docx";
      cover.style.width = "595.3pt";
      cover.style.height = "800pt";
      cover.style.padding = "36pt";
      cover.innerHTML = `<article><p>中共玉门市委办公室</p></article>`;
      const continuation = document.createElement("section");
      continuation.className = "ofv-docx";
      continuation.dataset.ofvDocxFlowContinuation = "true";
      continuation.style.width = "595.3pt";
      continuation.style.height = "800pt";
      continuation.style.padding = "36pt";
      continuation.innerHTML = `<article><p>2 0 2 5 年 7 月 7 日</p><p>附注内容</p></article>`;
      wrapper.append(cover, continuation);
      bodyContainer.append(wrapper);
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: await createMinimalDocx(),
      fileName: "closing-date-nonempty-continuation.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 2);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    expect(pages[0]?.querySelector("article")?.textContent).toContain("2 0 2 5 年 7 月 7 日");
    expect(pages[1]?.querySelector("article")?.textContent).toContain("附注内容");
  });

  it("moves a short overflowing DOCX paragraph to the next page without splitting it", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "600px";
      page.style.minHeight = "200px";
      page.style.padding = "20px";
      const article = document.createElement("article");
      const heading = document.createElement("p");
      heading.textContent = "Page heading";
      const paragraph = document.createElement("p");
      paragraph.textContent = "This short paragraph should move to the next page as one intact block.";
      article.append(heading, paragraph);
      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);

      heading.getBoundingClientRect = () => ({
        x: 20, y: 20, top: 20, right: 580, bottom: 150, left: 20, width: 560, height: 130, toJSON: () => ({})
      });
      paragraph.getBoundingClientRect = () => {
        const firstOnPage = paragraph.parentElement?.firstElementChild === paragraph;
        const top = firstOnPage ? 20 : 150;
        return { x: 20, y: top, top, right: 580, bottom: top + 60, left: 20, width: 560, height: 60, toJSON: () => ({}) };
      };
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      fileName: "short-paragraph.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 2);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    expect(pages[0]?.querySelector("article")?.textContent).toBe("Page heading");
    expect(pages[1]?.querySelector("article p")?.textContent).toBe(
      "This short paragraph should move to the next page as one intact block."
    );
    expect(pages[1]?.querySelector<HTMLElement>("article p")?.dataset.ofvDocxParagraphContinuation).toBeUndefined();
  });

  it("splits an overflowing DOCX paragraph across pages without losing rich text", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "600px";
      page.style.minHeight = "200px";
      page.style.padding = "20px";
      const article = document.createElement("article");
      const heading = document.createElement("p");
      heading.textContent = "Section heading";
      const paragraph = document.createElement("p");
      paragraph.className = "ofv-docx-num-1-0";
      paragraph.style.marginTop = "12px";
      paragraph.style.marginBottom = "12px";
      paragraph.style.textIndent = "24px";
      const bold = document.createElement("span");
      bold.style.fontWeight = "bold";
      bold.textContent = "Rich heading";
      const lineBreak = document.createElement("br");
      const body = document.createElement("span");
      body.textContent = "abcdefghijklmnopqrstuvwxyz".repeat(4);
      paragraph.append(bold, lineBreak, body);
      article.append(heading, paragraph);
      page.append(article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.tagName !== "P") {
        return { x: 0, y: 0, top: 0, right: 600, bottom: 0, left: 0, width: 600, height: 0, toJSON: () => ({}) };
      }
      const siblings = Array.from(this.parentElement?.children || []) as HTMLElement[];
      let top = 20;
      for (const sibling of siblings) {
        if (sibling === this) {
          break;
        }
        top += Math.ceil((sibling.textContent?.length || 0) / 10) * 20;
      }
      const height = Math.max(20, Math.ceil((this.textContent?.length || 0) / 10) * 20);
      return { x: 20, y: top, top, right: 580, bottom: top + height, left: 20, width: 560, height, toJSON: () => ({}) };
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      fileName: "split-paragraph.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 2);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    const firstPart = pages[0]?.querySelectorAll("article p")[1] as HTMLElement | undefined;
    const continuation = pages[1]?.querySelector<HTMLElement>("article p");
    expect(`${firstPart?.textContent}${continuation?.textContent}`).toBe(`Rich heading${"abcdefghijklmnopqrstuvwxyz".repeat(4)}`);
    expect(firstPart?.textContent?.length).toBeGreaterThan(20);
    expect(continuation?.dataset.ofvDocxParagraphContinuation).toBe("true");
    expect(continuation?.classList.contains("ofv-docx-num-1-0")).toBe(false);
    expect(continuation?.style.textIndent).toBe("0px");
    expect(firstPart?.querySelector("span[style*='font-weight: bold']")?.textContent).toBe("Rich heading");
    expect((firstPart?.querySelectorAll("br").length || 0) + (continuation?.querySelectorAll("br").length || 0)).toBe(1);
  });

  it("splits overflowing DOCX tables between complete rowspan groups without adding a blank page", async () => {
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "600px";
      page.style.minHeight = "300px";
      page.style.padding = "20px";
      const header = document.createElement("header");
      header.textContent = "Repeated header";
      const article = document.createElement("article");
      const heading = document.createElement("p");
      heading.textContent = "Fees";
      const table = document.createElement("table");
      const colgroup = document.createElement("colgroup");
      colgroup.append(document.createElement("col"));
      table.append(colgroup);

      for (let index = 1; index <= 5; index += 1) {
        const row = table.insertRow();
        const cell = row.insertCell();
        cell.textContent = `Row ${index}`;
        if (index === 1) {
          cell.rowSpan = 2;
        }
        row.getBoundingClientRect = () => {
          const currentTable = row.closest("table")!;
          const rowIndex = Array.from(currentTable.rows).indexOf(row);
          const top = (currentTable.previousElementSibling ? 70 : 20) + rowIndex * 80;
          return { x: 20, y: top, top, right: 580, bottom: top + 80, left: 20, width: 560, height: 80, toJSON: () => ({}) };
        };
      }

      table.getBoundingClientRect = () => ({
        x: 20,
        y: 70,
        top: 70,
        right: 580,
        bottom: 470,
        left: 20,
        width: 560,
        height: 400,
        toJSON: () => ({})
      });
      const trailingEmptyParagraph = document.createElement("p");
      trailingEmptyParagraph.getBoundingClientRect = () => ({
        x: 20,
        y: 290,
        top: 290,
        right: 580,
        bottom: 310,
        left: 20,
        width: 560,
        height: 20,
        toJSON: () => ({})
      });
      article.append(heading, table, trailingEmptyParagraph);
      page.append(header, article);
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
      fileName: "split-table.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("section.ofv-docx").length === 2);
    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
    const firstTable = pages[0]?.querySelector<HTMLTableElement>("article table");
    const continuationTable = pages[1]?.querySelector<HTMLTableElement>("article table");
    expect(Array.from(firstTable?.rows || []).map((row) => row.textContent)).toEqual(["Row 1", "Row 2"]);
    expect(Array.from(continuationTable?.rows || []).map((row) => row.textContent)).toEqual(["Row 3", "Row 4", "Row 5"]);
    expect(firstTable?.rows[0]?.cells[0]?.rowSpan).toBe(2);
    expect(firstTable?.querySelectorAll(":scope > colgroup")).toHaveLength(1);
    expect(continuationTable?.querySelectorAll(":scope > colgroup")).toHaveLength(1);
    expect(continuationTable?.dataset.ofvDocxTableContinuation).toBe("true");
    expect(pages[1]?.querySelector("header")?.textContent).toBe("Repeated header");
    expect(pages[1]?.querySelectorAll("article p")).toHaveLength(0);
  });

  it("keeps DOCX page width stable inside narrow containers", async () => {
    const container = document.createElement("div");
    container.style.width = "220px";
    container.style.height = "360px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "narrow.docx",
      width: "220px",
      height: "360px",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const docxDocument = container.querySelector<HTMLElement>(".ofv-docx-document");
    Object.defineProperty(docxDocument, "clientWidth", { configurable: true, value: 220 });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelector<HTMLElement>(".ofv-docx-wrapper")?.className).toContain("ofv-docx-wrapper");
    expect(container.querySelector<HTMLElement>(".ofv-docx-page-frame")).not.toBeNull();
    expect(viewer.goToPage(1)).toBe(true);
    expect(container.querySelector<HTMLElement>("section.ofv-docx")?.style.width).toBe("794px");
    expect(container.querySelector<HTMLElement>(".ofv-docx-wrapper")?.style.getPropertyValue("--ofv-docx-scale")).toBe(
      "0.2166"
    );

    viewer.destroy();
  });

  it.each([
    { fit: "actual" as const, scale: "1" },
    { fit: "width" as const, scale: "0.4433" },
    { fit: "height" as const, scale: "0.2244" },
    { fit: "contain" as const, scale: "0.2244" },
    { fit: "cover" as const, scale: "0.4433" },
    { fit: "scale-down" as const, scale: "0.2244" }
  ])("applies DOCX PreviewFit=$fit to the page scale", async ({ fit, scale }) => {
    const container = document.createElement("div");
    container.style.width = "400px";
    container.style.height = "300px";
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: `fit-${fit}.docx`,
      width: "400px",
      height: "300px",
      fit,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const docxDocument = container.querySelector<HTMLElement>(".ofv-docx-document");
    Object.defineProperty(docxDocument, "clientWidth", { configurable: true, value: 400 });
    Object.defineProperty(docxDocument, "clientHeight", { configurable: true, value: 300 });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelector<HTMLElement>(".ofv-docx-wrapper")?.style.getPropertyValue("--ofv-docx-scale")).toBe(
      scale
    );

    viewer.destroy();
  });

  it("responds to shared toolbar zoom for DOCX previews without enabling rotation", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "toolbar.docx",
      toolbar: true,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    const panel = container.querySelector<HTMLElement>(".ofv-office");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(true);

    zoomIn?.click();
    expect(panel?.style.getPropertyValue("--ofv-office-zoom")).toBe("1.12");
    expect(zoomReset?.textContent).toBe("112%");

    zoomReset?.click();
    expect(panel?.style.getPropertyValue("--ofv-office-zoom")).toBe("1");
  });

  it("keeps contain-fit DOCX scaling stable when zooming out a single page", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "single-page.docx",
      width: "940px",
      height: "620px",
      fit: "contain",
      toolbar: true,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));
    const viewport = container.querySelector<HTMLElement>(".ofv-viewport");
    const panel = container.querySelector<HTMLElement>(".ofv-office");
    const docxDocument = container.querySelector<HTMLElement>(".ofv-docx-document");
    const wrapper = container.querySelector<HTMLElement>(".ofv-docx-wrapper");
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 571 });
    Object.defineProperty(docxDocument, "clientWidth", { configurable: true, value: 906 });
    Object.defineProperty(docxDocument, "clientHeight", { configurable: true, value: 1185 });
    panel!.style.padding = "16px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(wrapper?.style.getPropertyValue("--ofv-docx-scale")).toBe("0.4372");

    Object.defineProperty(docxDocument, "clientHeight", { configurable: true, value: 306 });
    container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(panel?.style.getPropertyValue("--ofv-office-zoom")).toBe("0.88");
    expect(wrapper?.style.getPropertyValue("--ofv-docx-scale")).toBe("0.4372");

    viewer.destroy();
  });

  it("keeps the DOCX layout preview without rendering supplemental footer code", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalDocx("Body paragraph", "Footer field code"),
      fileName: "letter.docx",
      plugins: [officePlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
    expect(container.querySelector(".ofv-document-extra")).toBeNull();
    expect(container.textContent).not.toContain("Footer field code");
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps docx-preview internal styles outside the visible document text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "styled.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
    expect(container.querySelector(".ofv-docx-document")?.textContent).not.toContain("docx-internal-style");
    const styleContainer = document.head.querySelector(".ofv-docx-style-container");
    expect(styleContainer).toBeInstanceOf(HTMLStyleElement);
    expect(styleContainer?.textContent).toContain("docx-internal-style");

    viewer.destroy();

    await waitFor(() => document.head.querySelector(".ofv-docx-style-container") === null);
  });

  it("normalizes DOCX list marker spacing generated by docx-preview", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "numbering.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    const generatedCss = document.head.querySelector(".ofv-docx-style-container")?.textContent || "";
    expect(generatedCss).toContain('content: "-\\00a0";');
    expect(generatedCss).not.toContain('content: "-\\9";');
    expect(generatedCss).toContain(".ofv-docx p.ofv-docx-num-1-0 {");
    expect(generatedCss).toContain("margin-inline-start: 18pt;");

    viewer.destroy();
  });

  it("uses MIME type to route extensionless DOCX blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(renderDocxAsync).toHaveBeenCalled();
    expect(container.textContent).toContain("DOCX layout page");
  });

  it("routes macro-enabled Word MIME types through the DOCX renderer", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["docm"], {
        type: "application/vnd.ms-word.document.macroenabled.12"
      }),
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-document")));

    expect(renderDocxAsync).toHaveBeenCalled();
    expect(container.textContent).toContain("DOCX layout page");
  });

  it("falls back to raw OpenXML text when both DOCX renderers fail", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldFailDocxPreview.value = true;
    shouldFailMammoth.value = true;
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalDocx("Raw paragraph"),
      fileName: "letter.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Raw paragraph") || false);

    const fallbackNote = container.querySelector<HTMLElement>(".ofv-docx-fallback-note");
    expect(fallbackNote?.textContent).toContain("基础内容预览");
    expect(fallbackNote?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("Raw paragraph");
  });

  it("stops loading and falls back when the DOCX renderer hangs", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldHangDocxPreview.value = true;
    shouldHangMammoth.value = true;
    (globalThis as { __OFV_DOCX_RENDER_TIMEOUT_MS__?: number }).__OFV_DOCX_RENDER_TIMEOUT_MS__ = 50;
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalDocx("Qiankun fallback paragraph with enough readable text"),
      fileName: "qiankun.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Qiankun fallback paragraph") || false, 1000);

    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("Qiankun fallback paragraph");
    expect(container.textContent).not.toContain("Loading preview");
  });

  it("falls back to OpenXML text when DOCX layout renderer succeeds with blank textbox content", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldRenderBlankDocxPreview.value = true;
    shouldFailMammoth.value = true;
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: await createTextboxDocx("徐善培", "Web前端工程师", "项目经验"),
      fileName: "resume.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false, 15000);

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-fallback-note")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ofv-document")?.textContent).toContain("徐善培");
    expect(container.querySelector(".ofv-document")?.textContent).toContain("项目经验");
    expect(Array.from(container.querySelectorAll(".ofv-document p")).map((item) => item.textContent)).toEqual([
      "徐善培",
      "Web前端工程师",
      "项目经验"
    ]);
  });

  it("uses the high fidelity DOCX renderer before falling back for textbox-heavy files", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: await createTextboxDocx("徐善培", "Web前端工程师", "项目经验"),
      fileName: "resume.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("DOCX layout page") || false);

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-wrapper")?.textContent).toContain("DOCX layout page");
    expect(container.querySelector(".ofv-document")).toBeNull();
  });

  it("prefers textbox layout fallback for multi-page anchored resume templates", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: await createAnchoredResumeDocx(),
      fileName: "anchored-resume.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("项目经验") || false, 5000);

    const pages = Array.from(container.querySelectorAll<HTMLElement>(".ofv-docx-textbox-page"));
    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-wrapper")).toBeNull();
    expect(container.querySelector(".ofv-docx-fallback-note")?.getAttribute("aria-hidden")).toBe("true");
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0].textContent).toContain("教育背景");
    expect(pages[0].textContent).toContain("专业技能");
    expect(pages[1].textContent).toContain("自我评价");
    expect(pages[1].textContent).toContain("项目经验");
  });

  it("can delegate complex anchored DOCX templates to an Office conversion service", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const container = document.createElement("div");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({})
    } as DOMRect);
    const pdfjs = createPdfJsMock();
    const convert = vi.fn(() => new Blob(["%PDF"], { type: "application/pdf" }));
    document.body.append(container);

    createViewer({
      container,
      file: await createAnchoredResumeDocx(),
      fileName: "anchored-resume.docx",
      plugins: [officePlugin({ convert, pdf: { pdfjs } })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 1, 5000);

    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: "docx",
        reason: "complex-docx",
        file: expect.objectContaining({ name: "anchored-resume.docx" })
      })
    );
    expect(container.querySelector(".ofv-pdf-viewer-title")?.textContent).toBe("High-fidelity Office conversion preview");
    expect(container.querySelector(".ofv-docx-textbox-page")).toBeNull();
    expect(pdfjs.getDocument).toHaveBeenCalled();
  });

  it("falls back when the high fidelity DOCX renderer misses rich textbox content", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const callsBefore = renderDocxAsync.mock.calls.length;
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "794px";
      page.textContent = "项目经验";
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });
    document.body.append(container);

    createViewer({
      container,
      file: await createTextboxDocx("徐善培", "Web前端工程师", "教育背景", "项目经验"),
      fileName: "resume.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false);

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-fallback-note")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ofv-document")?.textContent).toContain("徐善培");
    expect(container.querySelector(".ofv-document")?.textContent).toContain("教育背景");
  });

  it("keeps real textbox-heavy resume DOCX files readable when the layout renderer is blank", async () => {
    const fs = await import("node:fs/promises");
    const resumePath = "/Users/kuangkuang/Desktop/徐善培-web前端 .docx";
    try {
      await fs.access(resumePath);
    } catch {
      return;
    }
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldRenderBlankDocxPreview.value = true;
    const callsBefore = renderDocxAsync.mock.calls.length;
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([await fs.readFile(resumePath)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "徐善培-web前端 .docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false, 15000);

    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(container.querySelector(".ofv-docx-fallback-note")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".ofv-docx-textbox-page")?.textContent).toContain("徐善培");
    expect(container.querySelector(".ofv-docx-textbox-page")?.textContent).toContain("Web前端工程师");
    const pages = Array.from(container.querySelectorAll(".ofv-docx-textbox-page")).map((page) => page.textContent || "");
    expect(pages[0]).toContain("教育背景");
    expect(pages[0]).toContain("专业技能");
    expect(pages[0]).toContain("工作经历");
    expect(pages[0]).not.toContain("自我评价");
    expect(pages.some((page) => page.includes("自我评价"))).toBe(true);
    expect(pages.some((page) => page.includes("项目经验"))).toBe(true);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[1]).toContain("自我评价");
    expect(pages[2]).toContain("南京云帐房");
    expect(pages[1]).not.toContain("南京云帐房");
  });

  it("repairs DOCX floating pictures and shape fills emitted by the layout renderer", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const callsBefore = renderDocxAsync.mock.calls.length;
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.padding = "36pt";
      page.innerHTML = `
        <p><span><div style="display:inline-block;position:relative;width:68pt;height:95.25pt;float:left"><img src="data:image/jpeg;base64,AA==" /></div></span></p>
        <p><span style="font-weight:bold">颜琪</span></p>
        <p><span><svg width="0" height="0" style="position:absolute;left:0pt;margin-left:29.4pt;margin-top:1.65pt;height:29.05pt;width:493pt;"><image width="100%" height="100%" fill="#38449A" stroke="null"></image></svg></span><span style="background-color: rgb(255, 255, 255);">工作经</span><span style="background-color: rgb(255, 255, 255);">历</span></p>
      `;
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createFloatingShapeDocx(),
      fileName: "floating-shape.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("rect[data-ofv-docx-shape-fill]")));

    const rect = container.querySelector("rect[data-ofv-docx-shape-fill]");
    const headingShape = container.querySelector<SVGSVGElement>(".ofv-docx-document p svg");
    const headingSpans = container.querySelectorAll<HTMLElement>(".ofv-docx-document p span");
    const imageWrapper = container.querySelector<HTMLElement>(".ofv-docx-document img")?.parentElement as HTMLElement;
    expect(renderDocxAsync).toHaveBeenCalledTimes(callsBefore + 1);
    expect(rect?.getAttribute("fill")).toBe("#3f4aa3");
    expect(headingShape?.style.marginLeft).toBe("48pt");
    expect(headingShape?.style.marginTop).toBe("-2.35pt");
    expect(headingSpans[headingSpans.length - 1]?.style.paddingRight).toBe("3pt");
    expect(headingSpans[headingSpans.length - 1]?.style.paddingTop).toBe("2pt");
    expect(headingSpans[headingSpans.length - 1]?.style.paddingBottom).toBe("2pt");
    expect(imageWrapper.dataset.ofvDocxFloatRepaired).toBe("true");
    expect(imageWrapper.style.position).toBe("absolute");
    expect(imageWrapper.style.float).toBe("none");
    expect(imageWrapper.style.left).toBe("490.35pt");
    expect(imageWrapper.style.width).toBe("68pt");
  });

  it("repairs multiple DOCX floating pictures without collapsing them into one image", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.padding = "36pt";
      page.innerHTML = `
        <p><span><div style="display:inline-block;position:relative;width:36pt;height:36pt;float:left"><img src="data:image/png;base64,AA==" /></div></span></p>
        <p><span><div style="display:inline-block;position:relative;width:48pt;height:48pt;float:left"><img src="data:image/png;base64,BB==" /></div></span></p>
      `;
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createMultipleFloatingPicturesDocx(),
      fileName: "multi-picture.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll(".ofv-docx-document img").length === 2);

    const imageWrappers = Array.from(container.querySelectorAll<HTMLImageElement>(".ofv-docx-document img")).map(
      (image) => image.parentElement as HTMLElement
    );
    expect(imageWrappers).toHaveLength(2);
    expect(imageWrappers[0].dataset.ofvDocxFloatRepaired).toBe("true");
    expect(imageWrappers[1].dataset.ofvDocxFloatRepaired).toBe("true");
    expect(imageWrappers[0].style.left).toBe("108pt");
    expect(imageWrappers[0].style.width).toBe("36pt");
    expect(imageWrappers[1].style.left).toBe("216pt");
    expect(imageWrappers[1].style.width).toBe("48pt");
  });

  it("repairs wrapNone pictures without mistaking inline images for seals", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.padding = "36pt";
      page.innerHTML = `
        <p><span><div style="display:inline-block;position:relative;width:439pt;height:9pt"><img src="data:image/png;base64,BANNER" /></div></span></p>
        <p><span><div style="display:block;position:relative;width:0;height:0;left:87pt;top:9pt"><img src="data:image/png;base64,AA==" /></div></span></p>
      `;
      const secondPage = document.createElement("section");
      secondPage.className = "ofv-docx";
      secondPage.style.width = "595.3pt";
      secondPage.style.padding = "36pt";
      secondPage.innerHTML = `<p><span><div style="display:block;position:relative;width:0;height:0;left:249pt;top:-47pt"><img src="data:image/png;base64,BB==" /></div></span></p>`;
      wrapper.append(page, secondPage);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createMultipleFloatingPicturesDocx("none"),
      fileName: "wrap-none-pictures.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("[data-ofv-docx-float-repaired='true']").length === 2);

    const repaired = Array.from(container.querySelectorAll<HTMLElement>("[data-ofv-docx-float-repaired='true']"));
    expect(repaired).toHaveLength(2);
    expect(repaired[0]?.style.left).toBe("108pt");
    expect(repaired[1]?.style.left).toBe("216pt");
    expect(container.querySelector("img[src*='BANNER']")?.parentElement?.dataset.ofvDocxFloatRepaired).toBeUndefined();
  });

  it("restores nested floating textbox content and positions header images from their OOXML anchors", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.padding = "72pt 90pt";
      page.innerHTML = `
        <header style="margin-top:calc(-28px);min-height:calc(28px)">
          <p><span><div style="display:inline-block;position:relative;width:49.95pt;height:31.65pt;float:left"><img src="data:image/png;base64,AA==" /></div></span></p>
        </header>
        <article>
          <p><span><svg width="0" height="0" style="position:absolute;left:0pt;margin-left:-16.45pt;margin-top:131.05pt;height:50.7pt;width:449.4pt"><image width="100%" height="100%"><foreignObject width="100%" height="100%"><p>Floating textbox title should remain visible</p></foreignObject></image></svg></span></p>
        </article>`;
      const headerParagraph = page.querySelector("header p")!;
      const headerImageWrapper = page.querySelector("header img")!.parentElement!;
      headerParagraph.append(headerImageWrapper, document.createTextNode("宏观周报"));
      wrapper.append(page);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createFloatingTextboxAndHeaderDocx(),
      fileName: "floating-textbox.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("svg[data-ofv-docx-textbox-repaired='true']")));

    const shape = container.querySelector<SVGSVGElement>("svg[data-ofv-docx-textbox-repaired='true']");
    const foreignObject = shape?.querySelector("foreignObject");
    const headerImageWrapper = container.querySelector<HTMLImageElement>("header img")?.parentElement as HTMLElement;
    expect(foreignObject?.parentElement).toBe(shape);
    expect(shape?.style.marginLeft).toBe("73.55pt");
    expect(shape?.style.top).toBe("131.05pt");
    expect(shape?.style.marginTop).toBe("0pt");
    expect(headerImageWrapper.dataset.ofvDocxFloatRepaired).toBe("true");
    expect(headerImageWrapper.style.position).toBe("absolute");
    expect(headerImageWrapper.style.left).toBe("90.4pt");
    expect(headerImageWrapper.style.top).toBe("35.65pt");
    expect(headerImageWrapper.style.width).toBe("49.95pt");
    expect(headerImageWrapper.closest("p")?.style.paddingLeft).toBe("50.35pt");
    expect(headerImageWrapper.closest("p")?.style.minHeight).toBe("31.65pt");
  });

  it("aligns a DOCX cover title background and paired floating text panels", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    renderDocxAsync.mockImplementationOnce(async (_data: unknown, bodyContainer: HTMLElement) => {
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-docx-wrapper";
      const page = document.createElement("section");
      page.className = "ofv-docx";
      page.style.width = "595.3pt";
      page.style.padding = "72pt 90pt";
      const shape = (text: string, width: number, height: number) =>
        `<p><svg width="0" height="0" style="position:absolute;width:${width}pt;height:${height}pt"><image><foreignObject width="100%" height="100%"><p>${text}</p></foreignObject></image></svg></p>`;
      page.innerHTML = `<article>${shape("", 452, 79.3)}${shape("Cover title", 449.4, 50.7)}${shape("Left summary", 245.55, 474.95)}${shape("Right details", 193.1, 393.3)}</article>`;
      const imagePage = document.createElement("section");
      imagePage.className = "ofv-docx";
      imagePage.innerHTML = `<article><p><span><div style="display:inline-block;position:relative;width:413.5pt;height:392pt"><img class="cover-layout-inline-image" src="data:image/png;base64,AA==" /></div></span></p></article>`;
      wrapper.append(page, imagePage);
      bodyContainer.append(wrapper);
    });

    createViewer({
      container,
      file: await createDocxCoverPageFloatingLayout(),
      fileName: "cover-layout.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("svg[data-ofv-docx-textbox-repaired='true']").length === 4);

    const shapes = Array.from(container.querySelectorAll<SVGSVGElement>("svg[data-ofv-docx-textbox-repaired='true']"));
    expect(shapes[0]?.style.top).toBe("116.75pt");
    expect(shapes[0]?.style.marginTop).toBe("0pt");
    expect(shapes[1]?.style.top).toBe("131.05pt");
    expect(shapes[2]?.style.top).toBe("246.75pt");
    expect(shapes[3]?.style.top).toBe("246.75pt");
    const inlineImageWrapper = container.querySelector<HTMLImageElement>(".cover-layout-inline-image")?.parentElement as HTMLElement;
    expect(inlineImageWrapper.dataset.ofvDocxFloatRepaired).toBeUndefined();
    expect(inlineImageWrapper.style.position).toBe("relative");
    expect(inlineImageWrapper.style.width).toBe("413.5pt");
  });

  it("deduplicates textbox DOCX fallback paragraphs from compatibility markup", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldRenderBlankDocxPreview.value = true;
    document.body.append(container);

    createViewer({
      container,
      file: await createDuplicatedTextboxDocx("徐善培", "求职意向：Web前端工程师", "基本信息"),
      fileName: "duplicated-textbox.docx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false);

    const paragraphs = Array.from(container.querySelectorAll(".ofv-document p")).map((item) => item.textContent);
    expect(paragraphs).toEqual(["徐善培", "求职意向：Web前端工程师", "基本信息"]);
  });

  it("shows a local DOCX corruption message when every content fallback fails", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    shouldFailDocxPreview.value = true;
    shouldFailMammoth.value = true;
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["not a zip"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }),
      fileName: "broken.docx",
      plugins: [officePlugin()],
      onError
    });

    await waitFor(() => container.textContent?.includes("文件可能已损坏") || false);

    expect(container.querySelector(".ofv-docx-fallback-note")?.getAttribute("aria-hidden")).toBe("true");
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders PPTX structure insight with layout, media, notes, transitions and animations", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalPptx(),
      fileName: "deck.pptx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-presentation-summary")));

    expect(openPptx).toHaveBeenCalledTimes(1);
    const summary = container.querySelector<HTMLElement>(".ofv-presentation-summary");
    expect(summary?.hidden).toBe(true);
    expect(summary?.dataset.slideCount).toBe("1");
    expect(summary?.dataset.imageCount).toBe("1");
    expect(summary?.dataset.notesCount).toBe("1");
    expect(summary?.dataset.transitionCount).toBe("1");
    expect(summary?.dataset.animationCount).toBe("1");
    expect(container.querySelector(".ofv-presentation-slides")).toBeNull();
    expect(container.querySelector(".ofv-pptx-viewer")?.textContent).toContain("PPTX rendered");
    expect(visibleText(container)).not.toContain("PPTX 演示文稿结构");
    expect(container.querySelector<HTMLElement>(".pptx-rendered")?.style.backgroundColor).toBe("rgb(32, 33, 36)");
    expect(container.querySelector<HTMLElement>(".pptx-mirrored-text-group > div")?.style.transform).toBe("scaleX(-1)");
    expect(container.querySelector<HTMLElement>(".pptx-mirrored-text-group > div")?.dataset.ofvPptxCounterMirror).toBe("x");
    const cycleTexts = Array.from(container.querySelectorAll<HTMLElement>("[data-ofv-pptx-diagram-cycle-text]"));
    expect(cycleTexts).toHaveLength(6);
    expect(new Set(cycleTexts.map((element) => element.style.left)).size).toBeGreaterThan(3);
    expect(cycleTexts[0]?.style.width).not.toBe("433px");
    expect(Number.parseFloat(cycleTexts.find((element) => element.dataset.ofvPptxDiagramCycleText === "2")?.style.left || "")).toBeGreaterThan(0);
    expect(cycleTexts[0]?.parentElement?.className).toBe("pptx-diagram-cycle-group");
    expect(container.querySelector<HTMLElement>(".pptx-diagram-cycle-group > div")?.style.width).toBe("433px");
    const circleCallouts = Array.from(container.querySelectorAll<HTMLElement>(".ofv-pptx-circle-callout-text"));
    expect(circleCallouts.map((element) => element.textContent)).toEqual(["代表性\n定义", "包含的\n要素"]);
    expect(container.querySelectorAll(".pptx-circle-shape")).toHaveLength(2);
    expect(container.querySelector<HTMLElement>(".pptx-circle-shape")?.parentElement?.classList.contains("ofv-pptx-circle-callout-text")).toBe(false);
  });

  it("responds to shared toolbar zoom for PPTX previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalPptx(),
      fileName: "toolbar.pptx",
      toolbar: true,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-pptx-viewer > div[data-slide-index]")));

    const slide = container.querySelector<HTMLElement>(".ofv-pptx-viewer > div[data-slide-index]");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(true);

    zoomIn?.click();
    expect(slide?.style.zoom).toBe("1.12");
    expect(slide?.style.width).toBe("max-content");
    expect(slide?.style.transform).toBe("");
    expect(zoomReset?.textContent).toBe("112%");

    zoomReset?.click();
    expect(slide?.style.zoom).toBe("");
    expect(slide?.style.width).toBe("");
  });

  it("matches inherited placeholder font sizes by layout placeholder index", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createPptxPlaceholderInheritanceFixture(),
      fileName: "placeholder-font.pptx",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector('[data-ofv-pptx-placeholder-font="24"]')));

    const placeholder = container.querySelector<HTMLElement>(".pptx-inherited-placeholder");
    expect(placeholder?.dataset.ofvPptxPlaceholderFont).toBe("24");
    expect(placeholder?.querySelector<HTMLElement>("span")?.style.fontSize).toBe("24pt");
  });

  it("uses PowerPoint default line height for autofit paragraphs without explicit spacing", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createPptxAutofitLineHeightFixture(),
      fileName: "autofit-line-height.pptx",
      plugins: [officePlugin()]
    });

    await waitFor(() => container.querySelectorAll("[data-ofv-pptx-default-line-height='true']").length === 2);

    const paragraphs = container.querySelectorAll<HTMLElement>(".pptx-autofit-body div > div");
    expect(paragraphs[0]?.style.lineHeight).toBe("1");
    expect(paragraphs[1]?.style.lineHeight).toBe("1");
    expect(paragraphs[2]?.style.lineHeight).toBe("");
  });

  it("falls back to extracted slide text when PPTX rendering times out", async () => {
    pptxRenderMode.value = "hang";
    (globalThis as { __OFV_PPTX_RENDER_TIMEOUT_MS__?: number }).__OFV_PPTX_RENDER_TIMEOUT_MS__ = 80;
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalPptx(),
      fileName: "slow.pptx",
      toolbar: true,
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-presentation-slides .ofv-slide")), 1000);

    expect(container.querySelector(".ofv-presentation-slides .ofv-slide")?.textContent).toContain("Quarter Plan");
    expect(container.querySelector<HTMLElement>(".ofv-presentation-summary")?.hidden).toBe(true);
    expect(visibleText(container)).not.toContain("PPTX 演示文稿结构");
    expect(container.textContent).not.toContain("Loading preview");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(false);
  });

  it("renders OpenDocument presentation insight for FODP layout and animation markers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([createMinimalFodp()], { type: "application/vnd.oasis.opendocument.presentation" }),
      fileName: "deck.fodp",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-presentation-summary")));

    const summary = container.querySelector<HTMLElement>(".ofv-presentation-summary");
    expect(summary?.hidden).toBe(true);
    expect(summary?.dataset.slideCount).toBe("2");
    expect(summary?.dataset.transitionCount).toBe("1");
    expect(summary?.dataset.animationCount).toBe("1");
    expect(container.querySelector(".ofv-presentation-slides")).toBeNull();
    expect(container.querySelector(".ofv-slide")?.textContent).toContain("Overview");
    expect(visibleText(container)).not.toContain("ODP 演示文稿结构");
  });

  it("extracts readable text fingerprints from legacy Word binary formats", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob(["Quarterly roadmap", "Budget 2026"]),
      fileName: "legacy.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office")));

    expect(container.textContent).toContain(".doc");
    expect(container.textContent).toContain("Office conversion guidance");
    expect(container.textContent).toContain("Word Binary File Format");
    expect(container.textContent).toContain("OLE Compound File");
    expect(container.querySelector(".ofv-office-conversion")).not.toBeNull();
    expect(container.textContent).toContain("Readable text fragments");
    expect(container.textContent).toContain("Quarterly roadmap");
    expect(container.textContent).toContain("Budget 2026");
  });

  it("localizes legacy Office conversion guidance", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob(["Quarterly roadmap", "Budget 2026"]),
      fileName: "legacy.doc",
      locale: "en-US",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office")));

    expect(container.textContent).toContain("Office conversion guidance");
    expect(container.textContent).toContain("belongs to a legacy Microsoft Office binary format");
    expect(container.textContent).toContain("Readable text fragments");
    expect(container.textContent).toContain("Quarterly roadmap");
    expect(container.textContent).not.toContain("Office 转换提示");
  });

  it("renders real Word 97-2003 .doc files through the built-in parser when a sample is available", async () => {
    const samplePath = "/Users/kuangkuang/Desktop/sample5.doc";
    if (!existsSync(samplePath)) {
      return;
    }

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([readFileSync(samplePath)], { type: "application/msword" }),
      fileName: "sample5.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-msdoc-document")), 2000);

    expect(container.querySelector(".ofv-office-conversion")).toBeNull();
    expect(container.textContent).toContain("Word Specification Sample");
    expect(container.textContent).toContain("Working Draft 04");
    expect(container.querySelector(".ofv-msdoc-document")?.textContent).toContain("Table of Contents");
    expect(container.querySelectorAll(".ofv-msdoc-page").length).toBeGreaterThan(1);
    expect(container.querySelectorAll(".ofv-msdoc-page")).toHaveLength(9);
    expect(container.querySelector(".ofv-msdoc-page")?.textContent).not.toContain("Table of Contents");
    expect(container.querySelector(".ofv-msdoc-meta")?.textContent).toContain("样式表");
    expect(container.querySelector(".ofv-msdoc-meta")?.textContent).toContain("Heading 1");
    expect(container.querySelector(".ofv-msdoc-page-footer")?.textContent).toContain("wd-spectools-word-sample-04");
    expect(container.querySelector(".ofv-msdoc-page-footer")?.textContent).toContain("Page 1 of 9");
    const bodyParagraphTexts = Array.from(container.querySelectorAll(".ofv-msdoc-page > p")).map((element) => element.textContent?.trim());
    expect(bodyParagraphTexts).not.toContain("PAGE");
    expect(bodyParagraphTexts).not.toContain("NUMPAGES");
    expect(container.querySelector(".ofv-msdoc-instruction")?.textContent).toContain("List your editors");
    expect(container.querySelector(".ofv-msdoc-instruction")?.classList.contains("ofv-msdoc-indent")).toBe(true);
    expect(container.querySelector(".ofv-msdoc-title")?.textContent).toContain("Word Specification Sample");
    expect(container.querySelector<HTMLImageElement>(".ofv-msdoc-oasis-header img")?.alt).toBe("OASIS");
    expect(container.querySelector<HTMLImageElement>(".ofv-msdoc-oasis-header img")?.src).toContain("data:image/png;base64,");
    expect(container.querySelectorAll(".ofv-msdoc-oasis-header")).toHaveLength(1);
    expect(container.querySelector(".ofv-msdoc-line-numbered")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".ofv-msdoc-title")?.dataset.line).toBe("2");
    expect(container.querySelectorAll<HTMLElement>(".ofv-msdoc-page")[1]?.querySelector<HTMLElement>("[data-line]")?.dataset.line).toBe("37");
    expect(container.querySelectorAll(".ofv-msdoc-toc").length).toBeGreaterThan(5);
    expect(container.querySelector(".ofv-msdoc-code-ruler")?.textContent).toBe("1234567");
    expect(Array.from(container.querySelectorAll(".ofv-msdoc-heading-level-2")).some((element) => element.textContent === "2.7 Code Examples")).toBe(true);
    expect(container.querySelectorAll(".ofv-msdoc-table tr").length).toBeGreaterThan(1);
    const revisionTable = container.querySelector<HTMLTableElement>(".ofv-msdoc-revision-table");
    expect(revisionTable).not.toBeNull();
    expect(Array.from(revisionTable?.querySelectorAll("col") || []).map((col) => col.style.width)).toEqual([
      "calc(59px * var(--ofv-office-zoom, 1))",
      "calc(81px * var(--ofv-office-zoom, 1))",
      "calc(106px * var(--ofv-office-zoom, 1))",
      "calc(191px * var(--ofv-office-zoom, 1))"
    ]);
    expect(
      Array.from(container.querySelectorAll(".ofv-msdoc-heading-level-1")).some((element) => element.textContent?.includes("Introduction"))
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll(".ofv-msdoc-heading-level-2")).some((element) => element.textContent?.includes("Terminology"))
    ).toBe(true);
    const firstLink = container.querySelector<HTMLAnchorElement>("a.ofv-msdoc-link-text");
    expect(firstLink?.textContent).toContain("http");
    expect(firstLink?.href).toContain("http://www.oasis-open.org/spectools/docs/");
    expect(firstLink?.target).toBe("_blank");
    expect(firstLink?.rel).toContain("noreferrer");
    expect(container.querySelector(".ofv-msdoc-listItem")?.textContent).toContain("Definition term");
    expect(container.querySelector(".ofv-msdoc-list-level-2")?.textContent).toContain("Definition for the term");
    expect(container.querySelector(".ofv-msdoc-reference")?.textContent).toContain("[RFC2119]");
    expect(container.querySelector(".ofv-msdoc-reference")?.textContent).toContain("[RFC2119] S. Bradner");
    expect(container.querySelector(".ofv-msdoc-reference")?.textContent).not.toContain("\t");
    expect(container.querySelector(".ofv-msdoc-reference .ofv-msdoc-ref-term")?.textContent).toBe("[RFC2119]");
    expect(container.querySelector(".ofv-msdoc-instruction-run")?.textContent).toContain("List your editors");
    const inlineCodeTexts = Array.from(container.querySelectorAll(".ofv-msdoc-inline-code")).map((element) => element.textContent);
    expect(inlineCodeTexts).toContain("attributeNames");
    expect(inlineCodeTexts).toContain("DataType");
    expect(inlineCodeTexts).toContain("OtherKeyword");
    const keywordTexts = Array.from(container.querySelectorAll(".ofv-msdoc-keyword")).map((element) => element.textContent?.toLowerCase());
    expect(keywordTexts).toContain("must");
    expect(keywordTexts).toContain("should");
    expect(container.querySelector(".ofv-msdoc-variable")?.textContent).toBe("variable");
    expect(Array.from(container.querySelectorAll(".ofv-msdoc-code")).some((element) => element.textContent?.includes("12345678901234567890"))).toBe(true);
    expect(Array.from(container.querySelectorAll(".ofv-msdoc-code")).some((element) => element.textContent?.includes("GET http://"))).toBe(true);
    expect(container.querySelector(".ofv-msdoc-document")?.textContent).not.toContain("HYPERLINK");
    expect(container.querySelector(".ofv-msdoc-document")?.textContent).not.toContain("PAGEREF");
    expect(container.querySelector(".ofv-msdoc-document")?.textContent).not.toContain("REF rfc2119");
  });

  it("expands recovered legacy Word form tables into styled section rows", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const documentModel: LegacyWordDocument = {
      title: "实训一 纯电动汽车高压断电流程实训",
      paragraphs: [],
      blocks: [
        { type: "title", text: "实训一 纯电动汽车高压断电流程实训" },
        {
          type: "table",
          rows: [
            ["学院", "专业", "姓名"],
            ["学号", "小组成员", "组长姓名"],
            ["一、接受工作任务", "成绩：", "企业工作任务"],
            [
              "新能源汽车服务有限公司昨日接收一辆北汽新能源EV系列纯电动汽车，需完成作业前准备及高压断电流程。",
              "二、信息收集",
              "成绩：",
              "请查阅相关资料，完成以下信息的填写。"
            ]
          ]
        }
      ],
      layout: { lineNumbers: false },
      assets: [],
      styles: [],
      stats: { streamCount: 7, pieceCount: 4, characterCount: 120, styleCount: 0, tableStream: "1Table" },
      warnings: []
    };

    renderLegacyWordDocument(container, documentModel);

    expect(container.querySelector(".ofv-msdoc-document")?.classList.contains("ofv-msdoc-form-document")).toBe(true);
    const table = container.querySelector<HTMLTableElement>(".ofv-msdoc-form-table");
    expect(table).not.toBeNull();
    const rows = Array.from(table?.rows || []);
    expect(rows).toHaveLength(8);
    expect(Array.from(rows[0].cells).map((cell) => cell.textContent)).toEqual(["学院", "", "专业", ""]);
    expect(rows[0].cells[0].classList.contains("ofv-msdoc-form-label")).toBe(true);
    expect(rows[0].cells[1].classList.contains("ofv-msdoc-form-empty")).toBe(true);
    expect(Array.from(rows[2].cells).map((cell) => cell.textContent)).toEqual(["小组成员", "", "组长姓名", ""]);
    expect(rows[3].cells[0].textContent).toBe("一、接受工作任务");
    expect(rows[3].cells[0].colSpan).toBe(2);
    expect(rows[3].cells[1].textContent).toBe("成绩：");
    expect(rows[3].cells[1].colSpan).toBe(2);
    expect(rows[3].cells[0].classList.contains("ofv-msdoc-form-section")).toBe(true);
    expect(rows[4].cells[0].textContent).toBe("企业工作任务");
    expect(rows[4].cells[0].colSpan).toBe(4);
    expect(rows[5].cells[0].textContent).toContain("新能源汽车服务有限公司");
    expect(rows[6].cells[0].textContent).toBe("二、信息收集");
    expect(rows[7].cells[0].textContent).toContain("请查阅相关资料");
  });

  it("renders the issue 39 training form when the downloaded attachment is available", async () => {
    const samplePath = "/Users/kuangkuang/Desktop/任务一 纯电动汽车高压断电流程实训-实训工单.doc";
    if (!existsSync(samplePath)) return;
    const container = document.createElement("div");
    document.body.append(container);
    createViewer({
      container,
      file: new Blob([readFileSync(samplePath)], { type: "application/msword" }),
      fileName: "training-form.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-msdoc-training-workbook")), 2000);
    expect(container.querySelectorAll(".ofv-msdoc-training-page")).toHaveLength(6);
    expect(container.querySelectorAll(".ofv-msdoc-training-image")).toHaveLength(12);
    expect(container.querySelector(".ofv-msdoc-training-identity")?.textContent).toContain("组长姓名");
    expect(container.querySelector(".ofv-msdoc-training-plan")?.textContent).toContain("审核意见");
    expect(container.querySelector(".ofv-msdoc-training-equipment")?.textContent).toContain("检测设备/工具/材料");
    expect(container.querySelector(".ofv-msdoc-training-quality")?.textContent).toContain("综合评价");
    expect(container.querySelector(".ofv-msdoc-training-score")?.textContent).toContain("得分（满分100）");
  });

  it("keeps literal ASCII text from legacy Word binaries even when it looks random", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob([
        "KSKS",
        "NHr_",
        "hdjcbwhjbcjhbdjwbcjwhb xhbsdhjbj",
        "cdjskncjks",
        "cdjkbncjkjdbc",
        "cndcb ndbc"
      ]),
      fileName: "legacy.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-binary-fragments")));

    expect(container.textContent).toContain("hdjcbwhjbcjhbdjwbcjwhb xhbsdhjbj");
    expect(container.textContent).toContain("cdjskncjks");
    expect(container.textContent).toContain("cdjkbncjkjdbc");
    expect(container.textContent).toContain("cndcb ndbc");
    expect(container.textContent).not.toContain("KSKS");
    expect(container.textContent).not.toContain("NHr_");
  });

  it("filters legacy Word style names and corrupted text while keeping natural language", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob([
        "标题 1",
        "项目上线检查清单",
        "D쾌封$胡",
        "标题 2",
        "默认段落字体",
        "普通表格",
        "KSOProductBuildVer",
        "KSOPProductBuildVer",
        "0Table",
        "映謡杀鐏",
        "Root Entry",
        "Normal.dotm",
        "WPS Office 专业版_0.0.0.0_{F1E327BC-269C-435d-A152-05C5408002CA}"
      ], "utf16"),
      fileName: "legacy.doc",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-conversion")));

    expect(container.textContent).toContain("项目上线检查清单");
    expect(container.textContent).not.toContain("标题 1");
    expect(container.textContent).not.toContain("标题 2");
    expect(container.textContent).not.toContain("D쾌封$胡");
    expect(container.textContent).not.toContain("映謡杀鐏");
    expect(container.textContent).not.toContain("Root Entry");
    expect(container.textContent).not.toContain("Normal.dotm");
    expect(container.textContent).not.toContain("WPS Office 专业版");
    expect(container.textContent).not.toContain("KSOProductBuildVer");
    expect(container.textContent).not.toContain("KSOPProductBuildVer");
    expect(container.textContent).not.toContain("0Table");
  });

  it("extracts UTF-16 text fingerprints from legacy PowerPoint binary formats", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob(["Launch deck", "Slide summary"], "utf16"),
      fileName: "deck.ppt",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-binary-meta")));

    expect(container.textContent).toContain(".ppt");
    expect(container.textContent).toContain("PowerPoint Binary File Format");
    expect(container.textContent).toContain("Launch deck");
    expect(container.textContent).toContain("Slide summary");
  });

  it("shows a conversion-only state for legacy PowerPoint files without stable text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([new Uint8Array([1, 7, 13, 21, 34, 55, 89]).buffer], { type: "application/octet-stream" }),
      fileName: "deck.ppt",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-conversion")));

    expect(container.textContent).toContain(".ppt");
    expect(container.textContent).toContain("Office conversion guidance");
    expect(container.textContent).toContain("PowerPoint Binary File Format");
    expect(container.textContent).toContain("No stable readable text was extracted");
    expect(container.querySelector(".ofv-office-binary-fragments")).toBeNull();
  });

  it("falls back to binary fingerprints when legacy Excel parsing fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob(["Revenue forecast", "Gross margin"]),
      fileName: "legacy.xls",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-binary-meta")));

    expect(container.textContent).toContain(".xls");
    expect(container.textContent).toContain("Office conversion guidance");
    expect(container.textContent).toContain("Excel Binary File Format");
    expect(container.textContent).toContain("Spreadsheet parse failed");
    expect(container.textContent).toContain("Revenue forecast");
    expect(container.textContent).toContain("Gross margin");
  });

  it("falls back to binary fingerprints when XLSB parsing fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: createLegacyBinaryBlob(["Binary workbook", "Revenue forecast"]),
      fileName: "legacy.xlsb",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-binary-meta")));

    expect(container.textContent).toContain(".xlsb");
    expect(container.textContent).toContain("Office conversion guidance");
    expect(container.textContent).toContain("Excel Binary File Format");
    expect(container.textContent).toContain("Spreadsheet parse failed");
    expect(container.textContent).toContain("Binary workbook");
  });

  it("sniffs WPS spreadsheet packages and renders compatible workbook previews", async () => {
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([["Name", "Score"], ["Ada", 98]]), "Scores");
    const buffer = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "scores.et",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sheet-summary")));

    expect(container.querySelector<HTMLElement>(".ofv-sheet-summary")?.hidden).toBe(true);

    expect(container.querySelector(".ofv-office-package-note")).toBeNull();
    expect(container.textContent).not.toContain("兼容包识别");
    expect(container.querySelector(".ofv-tabs button")?.textContent).toBe("Scores");
    expect(container.querySelector('[data-cell="A2"]')?.textContent).toBe("Ada");
  });

  it("shows iWork package metadata and structure for Numbers files", async () => {
    const zip = new JSZip();
    zip.file("Index/Document.iwa", "binary");
    zip.file(
      "Metadata/Properties.plist",
      `<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0">
        <dict>
          <key>Title</key>
          <string>FY26 Budget</string>
          <key>Author</key>
          <string>Ada Lovelace</string>
          <key>Company</key>
          <string>Open File Viewer</string>
          <key>Keywords</key>
          <array>
            <string>finance</string>
            <string>planning</string>
          </array>
          <key>CreationDate</key>
          <date>2026-06-15T08:00:00Z</date>
          <key>ModificationDate</key>
          <date>2026-06-15T09:30:00Z</date>
        </dict>
      </plist>`
    );
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await zip.generateAsync({ type: "blob", mimeType: "application/vnd.apple.numbers" }),
      fileName: "budget.numbers",
      plugins: [officePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-office-package-list")));

    expect(container.querySelector(".ofv-office-package-note")?.textContent).toContain("Apple iWork");
    expect(container.querySelector(".ofv-iwork-meta")?.textContent).toContain("FY26 Budget");
    expect(container.querySelector(".ofv-iwork-meta")?.textContent).toContain("Ada Lovelace");
    expect(container.querySelector(".ofv-iwork-meta")?.textContent).toContain("Open File Viewer");
    expect(container.querySelector(".ofv-iwork-meta")?.textContent).toContain("finance, planning");
    expect(container.querySelector(".ofv-iwork-meta")?.textContent).toContain("2026-06-15T08:00:00Z");
    expect(container.querySelector(".ofv-office-package-list")?.textContent).toContain("Index/Document.iwa");
    expect(container.querySelector(".ofv-office-package-list")?.textContent).toContain("Metadata/Properties.plist");
  });
});

async function createMinimalDocx(text: string, footerText?: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
      </w:document>`
  );
  if (footerText) {
    zip.file(
      "word/footer1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:p><w:r><w:t>${footerText}</w:t></w:r></w:p></w:ftr>`
    );
  }
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createDocxWithSvgImageAlternative(): Promise<{
  file: Blob;
  fallbackDataUrl: string;
  svgDataUrl: string;
}> {
  const zip = new JSZip();
  const fallbackImage = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const svgImage = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
    <rect width="200" height="100" fill="white"/>
    <text x="20" y="55">发起采购流程</text>
  </svg>`;
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main">
        <w:body><w:p><w:r><w:drawing><a:blip r:embed="rIdPng">
          <a:extLst><a:ext><asvg:svgBlip r:embed="rIdSvg"/></a:ext></a:extLst>
        </a:blip></w:drawing></w:r></w:p></w:body>
      </w:document>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
        <Relationship Id="rIdSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.svg"/>
      </Relationships>`
  );
  zip.file("word/media/image1.png", fallbackImage);
  zip.file("word/media/image2.svg", svgImage);
  return {
    file: await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    fallbackDataUrl: `data:application/octet-stream;base64,${Buffer.from(fallbackImage).toString("base64")}`,
    svgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svgImage).toString("base64")}`
  };
}

async function createDocxWithTableTextDirection(vertical: boolean): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:tbl><w:tr><w:tc>
          <w:tcPr>${vertical ? '<w:textDirection w:val="tbRl"/>' : ""}</w:tcPr>
          <w:p><w:r><w:t>采购字段名</w:t></w:r></w:p>
        </w:tc></w:tr></w:tbl></w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createTextboxDocx(...texts: string[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          <w:p>
            <w:r>
              <w:drawing>
                <wps:wsp>
                  <wps:txbx>
                    <w:txbxContent>
                      ${texts.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")}
                    </w:txbxContent>
                  </wps:txbx>
                </wps:wsp>
              </w:drawing>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createAnchoredResumeDocx(): Promise<Blob> {
  const zip = new JSZip();
  const anchor = (options: {
    x: number;
    y: number;
    width: number;
    height: number;
    relativeV?: "page" | "paragraph";
    fill?: string;
    paragraphs?: string[];
  }) => {
    const text = options.paragraphs
      ?.map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
      .join("");
    return `
      <w:p>
        <w:r>
          <w:drawing>
            <wp:anchor>
              <wp:positionH relativeFrom="column"><wp:posOffset>${ptToEmu(options.x)}</wp:posOffset></wp:positionH>
              <wp:positionV relativeFrom="${options.relativeV || "page"}"><wp:posOffset>${ptToEmu(options.y)}</wp:posOffset></wp:positionV>
              <wp:extent cx="${ptToEmu(options.width)}" cy="${ptToEmu(options.height)}"/>
              <a:graphic>
                <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                  <wps:wsp>
                    <wps:spPr>
                      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                      ${options.fill ? `<a:solidFill><a:srgbClr val="${options.fill}"/></a:solidFill>` : "<a:noFill/>"}
                    </wps:spPr>
                    ${
                      text
                        ? `<wps:txbx><w:txbxContent>${text}</w:txbxContent></wps:txbx>`
                        : ""
                    }
                  </wps:wsp>
                </a:graphicData>
              </a:graphic>
            </wp:anchor>
          </w:drawing>
        </w:r>
      </w:p>`;
  };
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          ${anchor({ x: -92, y: -10, width: 189, height: 898, relativeV: "page", fill: "1F1C34" })}
          ${anchor({ x: -72, y: 31, width: 149, height: 72, relativeV: "page", paragraphs: ["徐善培", "求职意向：Web前端工程师"] })}
          ${anchor({ x: -72, y: 179, width: 166, height: 180, relativeV: "page", fill: "1F1C34", paragraphs: ["基本信息", "1995.03", "195-3139-0706", "江苏 南京"] })}
          ${anchor({ x: 108, y: 35, width: 394, height: 71, relativeV: "page", fill: "303241", paragraphs: ["教育背景", "2012.09-2016.07 北京北大资源学院 本科"] })}
          ${anchor({ x: 106, y: 124, width: 389, height: 496, relativeV: "page", paragraphs: ["专业技能", "精通HTML/CSS等Web前端相关技术；", "熟练使用Vue2/3 + Vue-Router + Vuex/Pinia"] })}
          ${anchor({ x: -77, y: 412, width: 166, height: 124, relativeV: "page", paragraphs: ["主修课程", "C语言、数据结构、操作系统"] })}
          ${anchor({ x: -70, y: 8, width: 158, height: 38, relativeV: "paragraph", paragraphs: ["业余成果"] })}
          ${anchor({ x: -72, y: 15, width: 165, height: 109, relativeV: "paragraph", paragraphs: ["公众号：前端开发爱好者 作者"] })}
          ${anchor({ x: 112, y: 644, width: 371, height: 149, relativeV: "page", fill: "303241", paragraphs: ["工作经历", "2018.03-2021.01 海云数据(南京分公司) 前端开发"] })}
          ${anchor({ x: -90, y: -56, width: 189, height: 898, relativeV: "page", fill: "1F1C34" })}
          ${anchor({ x: -74, y: -160, width: 158, height: 257, relativeV: "paragraph", paragraphs: ["本人追求上进，善于学习和运用新技术，了解并不断接受新的技术。"] })}
          ${anchor({ x: -74, y: -192, width: 145, height: 32, relativeV: "paragraph", paragraphs: ["自我评价"] })}
          ${anchor({ x: 116, y: -41, width: 365, height: 757, relativeV: "paragraph", paragraphs: ["项目经验", "2018.03-2021.01 海云数据( 南京分公司 )", "项目一：辽宁智案研判"] })}
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function ptToEmu(value: number): number {
  return Math.round(value * 12700);
}

function createPdfJsMock(): any {
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 400 * scale,
      height: 600 * scale,
      transform: [scale, 0, 0, scale, 0, 0]
    })),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn()
    })),
    getTextContent: vi.fn(() => Promise.resolve({ items: [] }))
  };
  return {
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(() => Promise.resolve(page)),
        destroy: vi.fn()
      })
    }))
  };
}

async function createFloatingShapeDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>
          <w:p>
            <w:r>
              <w:drawing>
                <wp:anchor>
                  <wp:positionH relativeFrom="column"><wp:posOffset>5770245</wp:posOffset></wp:positionH>
                  <wp:positionV relativeFrom="paragraph"><wp:posOffset>127000</wp:posOffset></wp:positionV>
                  <wp:extent cx="863600" cy="1209675"/>
                  <wp:wrapSquare wrapText="bothSides"/>
                  <a:graphic>
                    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                      <pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic>
                    </a:graphicData>
                  </a:graphic>
                </wp:anchor>
              </w:drawing>
            </w:r>
          </w:p>
          <w:p><w:r><w:t>颜琪</w:t></w:r></w:p>
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createMultipleFloatingPicturesDocx(wrap: "square" | "none" = "square"): Promise<Blob> {
  const zip = new JSZip();
  const pictureAnchor = (relationshipId: string, offsetX: number, width: number, height: number) => `
    <w:p>
      <w:r>
        <w:drawing>
          <wp:anchor>
            <wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(offsetX * 12700)}</wp:posOffset></wp:positionH>
            <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
            <wp:extent cx="${Math.round(width * 12700)}" cy="${Math.round(height * 12700)}"/>
            ${wrap === "square" ? '<wp:wrapSquare wrapText="bothSides"/>' : "<wp:wrapNone/>"}
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic><pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill></pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:anchor>
        </w:drawing>
      </w:r>
    </w:p>`;
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>
          ${pictureAnchor("rIdImage1", 72, 36, 36)}
          ${pictureAnchor("rIdImage2", 180, 48, 48)}
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createFloatingTextboxAndHeaderDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          <w:p><w:r><w:drawing><wp:anchor>
            <wp:positionH relativeFrom="column"><wp:posOffset>-208915</wp:posOffset></wp:positionH>
            <wp:positionV relativeFrom="page"><wp:posOffset>1664335</wp:posOffset></wp:positionV>
            <wp:extent cx="5707380" cy="643890"/><wp:wrapNone/>
            <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
              <wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Floating textbox title should remain visible</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>
            </a:graphicData></a:graphic>
          </wp:anchor></w:drawing></w:r></w:p>
          <w:p><w:r><w:drawing><wp:anchor>
            <wp:positionH relativeFrom="column"><wp:posOffset>2540000</wp:posOffset></wp:positionH>
            <wp:positionV relativeFrom="paragraph"><wp:posOffset>127000</wp:posOffset></wp:positionV>
            <wp:extent cx="2540000" cy="2540000"/><wp:wrapSquare wrapText="bothSides"/>
            <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic/></a:graphicData></a:graphic>
          </wp:anchor></w:drawing></w:r></w:p>
        </w:body>
      </w:document>`
  );
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:hdr
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <w:p><w:r><w:drawing><wp:anchor>
          <wp:positionH relativeFrom="column"><wp:posOffset>5080</wp:posOffset></wp:positionH>
          <wp:positionV relativeFrom="paragraph"><wp:posOffset>-194945</wp:posOffset></wp:positionV>
          <wp:extent cx="634365" cy="401955"/><wp:wrapSquare wrapText="right"/>
          <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic/></a:graphicData></a:graphic>
        </wp:anchor></w:drawing></w:r></w:p>
      </w:hdr>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createDocxCoverPageFloatingLayout(): Promise<Blob> {
  const zip = new JSZip();
  const anchor = (options: {
    x: number;
    y: number;
    width: number;
    height: number;
    relativeV: "page" | "paragraph";
    text?: string;
    fill?: string;
    nestedPicture?: boolean;
  }) => `<w:p><w:r><w:drawing><wp:anchor>
    <wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(options.x * 12700)}</wp:posOffset></wp:positionH>
    <wp:positionV relativeFrom="${options.relativeV}"><wp:posOffset>${Math.round(options.y * 12700)}</wp:posOffset></wp:positionV>
    <wp:extent cx="${Math.round(options.width * 12700)}" cy="${Math.round(options.height * 12700)}"/><wp:wrapNone/>
    <a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>
      <wps:spPr>${options.fill ? `<a:solidFill><a:srgbClr val="${options.fill}"/></a:solidFill>` : "<a:noFill/>"}</wps:spPr>
      <wps:txbx><w:txbxContent><w:p><w:r><w:t>${options.text || ""}</w:t></w:r></w:p>
        ${options.nestedPicture ? `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5251450" cy="4978400"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` : ""}
      </w:txbxContent></wps:txbx>
    </wps:wsp></a:graphicData></a:graphic>
  </wp:anchor></w:drawing></w:r></w:p>`;
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <w:body>
          ${anchor({ x: -16.2, y: 7.55, width: 452, height: 79.3, relativeV: "paragraph", fill: "043885" })}
          ${anchor({ x: -16.45, y: 131.05, width: 449.4, height: 50.7, relativeV: "page", text: "Cover title" })}
          ${anchor({ x: -12.1, y: 22.6, width: 245.55, height: 474.95, relativeV: "paragraph", text: "Left summary", fill: "FFFFFF" })}
          ${anchor({ x: 241.4, y: 8.45, width: 193.1, height: 393.3, relativeV: "paragraph", text: "Right details", fill: "FFFFFF", nestedPicture: true })}
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createDuplicatedTextboxDocx(...texts: string[]): Promise<Blob> {
  const zip = new JSZip();
  const paragraphs = texts.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
        <w:body>
          <mc:AlternateContent>
            <mc:Choice Requires="wps">
              <w:p><w:r><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>
            </mc:Choice>
            <mc:Fallback>
              <w:p><w:r><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r></w:p>
            </mc:Fallback>
          </mc:AlternateContent>
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createStyledWorkbook(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Styled" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="2">
          <font><sz val="11"/><name val="Calibri"/></font>
          <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>
        </fonts>
        <fills count="4">
          <fill><patternFill patternType="none"/></fill>
          <fill><patternFill patternType="gray125"/></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFD9F5D6"/><bgColor indexed="64"/></patternFill></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill>
        </fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="5">
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
          <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
            <alignment vertical="top" wrapText="1"/>
          </xf>
          <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>
          <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
        </cellXfs>
      </styleSheet>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <cols>
          <col min="1" max="1" width="17.14" customWidth="1"/>
          <col min="2" max="2" width="25.71" customWidth="1"/>
          <col min="3" max="3" width="11.42" customWidth="1"/>
        </cols>
        <sheetData>
          <row r="1" ht="21" customHeight="1">
            <c r="A1" t="inlineStr" s="1"><is><t>Merged title</t></is></c>
          </row>
          <row r="2" ht="45" customHeight="1">
            <c r="A2" t="inlineStr"><is><t>Label</t></is></c>
            <c r="B2" t="inlineStr" s="2"><is><t>Multiline&#10;note</t></is></c>
            <c r="C2" t="inlineStr"><is><t>Value</t></is></c>
          </row>
          <row r="3">
            <c r="A3" t="inlineStr" s="2"><is><t>Wrap from source style</t></is></c>
            <c r="C3"><v>42</v></c>
          </row>
          <row r="4">
            <c r="A4" t="inlineStr" s="3"><is><t>Dark fill</t></is></c>
            <c r="C4" t="inlineStr" s="4"><is><t>Black ink</t></is></c>
          </row>
        </sheetData>
        <mergeCells count="2">
          <mergeCell ref="A1:C1"/>
          <mergeCell ref="B2:B3"/>
        </mergeCells>
      </worksheet>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createRichTextWorkbook(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Rich Text" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">
        <si>
          <r><rPr><b/><color rgb="FFFF0000"/></rPr><t>Bold red</t></r>
          <r><t xml:space="preserve"> normal</t></r>
        </si>
      </sst>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="B1" t="inlineStr">
              <is>
                <r><rPr><i/><color rgb="FF0070C0"/></rPr><t>Italic blue</t></r>
                <r><t xml:space="preserve"> and </t></r>
                <r><rPr><u/></rPr><t>underlined</t></r>
              </is>
            </c>
          </row>
        </sheetData>
      </worksheet>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createWideColumnWorkbook(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Wide" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetFormatPr defaultColWidth="14" defaultRowHeight="15"/>
        <cols>
          <col min="1" max="1" width="80" customWidth="1"/>
          <col min="2" max="2" width="10" customWidth="1"/>
        </cols>
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>Very wide note column</t></is></c>
            <c r="B1" t="inlineStr"><is><t>Narrow</t></is></c>
            <c r="C1" t="inlineStr"><is><t>Default</t></is></c>
          </row>
        </sheetData>
      </worksheet>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createVariableMdwColumnWorkbook(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          <sheet name="MDW Eleven" sheetId="1" r:id="rId1"/>
          <sheet name="MDW Four" sheetId="2" r:id="rId2"/>
        </sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <cols>
          <col min="1" max="1" width="10.63" customWidth="1"/>
          <col min="2" max="2" width="56.63" customWidth="1"/>
        </cols>
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>MDW eleven</t></is></c>
            <c r="B1" t="inlineStr"><is><t>Wide MDW eleven</t></is></c>
          </row>
        </sheetData>
      </worksheet>`
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <cols>
          <col min="1" max="1" width="34.75" customWidth="1"/>
          <col min="2" max="2" width="82.63" customWidth="1"/>
        </cols>
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>MDW four</t></is></c>
            <c r="B1" t="inlineStr"><is><t>Wide MDW four</t></is></c>
          </row>
        </sheetData>
      </worksheet>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createWorkbookWithChart(type: "bar" | "line" = "bar"): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Quarter</t></is></c><c r="B1" t="inlineStr"><is><t>Revenue</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t>Q1</t></is></c><c r="B2"><v>12</v></c></row>
          <row r="3"><c r="A3" t="inlineStr"><is><t>Q2</t></is></c><c r="B3"><v>18</v></c></row>
        </sheetData>
      </worksheet>`
  );
  zip.file(
    "xl/charts/chart1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <c:chart>
          <c:title><c:tx><c:rich><a:p><a:r><a:t>Quarterly Revenue</a:t></a:r></a:p></c:rich></c:tx></c:title>
          <c:plotArea>
            <c:${type}Chart>
              <c:ser>
                <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx>
                <c:cat><c:strRef><c:strCache>
                  <c:pt idx="0"><c:v>Q1</c:v></c:pt>
                  <c:pt idx="1"><c:v>Q2</c:v></c:pt>
                  <c:pt idx="2"><c:v>Q3</c:v></c:pt>
                </c:strCache></c:strRef></c:cat>
                <c:val><c:numRef><c:numCache>
                  <c:pt idx="0"><c:v>12</c:v></c:pt>
                  <c:pt idx="1"><c:v>18</c:v></c:pt>
                  <c:pt idx="2"><c:v>30</c:v></c:pt>
                </c:numCache></c:numRef></c:val>
              </c:ser>
            </c:${type}Chart>
          </c:plotArea>
        </c:chart>
      </c:chartSpace>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createDocxWithChart(kind: "bar" | "combo" | "sparse-line" = "bar"): Promise<Blob> {
  const zip = new JSZip();
  const sparseCategoryPoints = Array.from(
    { length: 16 },
    (_, index) => `<c:pt idx="${index * 2}"><c:v>${index * 2 + 1}日</c:v></c:pt>`
  ).join("");
  const sparseValues = Array.from(
    { length: 32 },
    (_, index) => `<c:pt idx="${index}"><c:v>${12_220 + index * 100}</c:v></c:pt>`
  ).join("");
  const chartXml =
    kind === "combo"
      ? `<?xml version="1.0" encoding="UTF-8"?>
        <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <c:chart><c:plotArea>
            <c:barChart><c:barDir val="col"/><c:ser>
              <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>日均零售</c:v></c:pt></c:strCache></c:strRef></c:tx>
              <c:cat><c:numRef><c:numCache><c:formatCode>yyyy/m/d</c:formatCode>
                <c:pt idx="0"><c:v>44717</c:v></c:pt><c:pt idx="1"><c:v>44724</c:v></c:pt><c:pt idx="2"><c:v>44752</c:v></c:pt>
              </c:numCache></c:numRef></c:cat>
              <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v>7</c:v></c:pt><c:pt idx="2"><c:v>12</c:v></c:pt></c:numCache></c:numRef></c:val>
            </c:ser><c:axId val="cat1"/><c:axId val="val1"/></c:barChart>
            <c:lineChart><c:ser>
              <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>同比增速</c:v></c:pt></c:strCache></c:strRef></c:tx>
              <c:cat><c:numRef><c:numCache><c:formatCode>yyyy/m/d</c:formatCode>
                <c:pt idx="0"><c:v>44717</c:v></c:pt><c:pt idx="1"><c:v>44724</c:v></c:pt><c:pt idx="2"><c:v>44752</c:v></c:pt>
              </c:numCache></c:numRef></c:cat>
              <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>-0.2</c:v></c:pt><c:pt idx="1"><c:v>0.2</c:v></c:pt><c:pt idx="2"><c:v>0.6</c:v></c:pt></c:numCache></c:numRef></c:val>
            </c:ser><c:axId val="cat2"/><c:axId val="val2"/></c:lineChart>
            <c:valAx><c:axId val="val1"/><c:scaling><c:min val="0"/><c:max val="14"/></c:scaling><c:axPos val="l"/>
              <c:title><c:tx><c:rich><a:p><a:r><a:t>(万辆)</a:t></a:r></a:p></c:rich></c:tx></c:title><c:majorUnit val="7"/>
            </c:valAx>
            <c:valAx><c:axId val="val2"/><c:scaling><c:min val="-0.6"/><c:max val="0.6"/></c:scaling><c:axPos val="r"/>
              <c:numFmt formatCode="0%"/><c:majorUnit val="0.4"/>
            </c:valAx>
          </c:plotArea></c:chart>
        </c:chartSpace>`
      : kind === "sparse-line"
        ? `<?xml version="1.0" encoding="UTF-8"?>
        <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <c:chart><c:plotArea><c:lineChart><c:ser>
            <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>客流量</c:v></c:pt></c:strCache></c:strRef></c:tx>
            <c:cat><c:strRef><c:strCache><c:ptCount val="32"/>${sparseCategoryPoints}</c:strCache></c:strRef></c:cat>
            <c:val><c:numRef><c:numCache><c:ptCount val="32"/>${sparseValues}</c:numCache></c:numRef></c:val>
          </c:ser></c:lineChart></c:plotArea></c:chart>
        </c:chartSpace>`
        : `<?xml version="1.0" encoding="UTF-8"?>
        <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <c:chart>
            <c:title><c:tx><c:rich><a:p><a:r><a:t>Quarterly Revenue</a:t></a:r></a:p></c:rich></c:tx></c:title>
            <c:plotArea><c:barChart><c:ser>
              <c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx>
              <c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>
              <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>18</c:v></c:pt><c:pt idx="2"><c:v>30</c:v></c:pt></c:numCache></c:numRef></c:val>
            </c:ser></c:barChart></c:plotArea>
          </c:chart>
        </c:chartSpace>`;
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>
      </Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>
          <w:p><w:r><w:drawing>
            <wp:inline>
              <wp:extent cx="4064000" cy="2286000"/>
              <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
                <c:chart r:id="rIdChart1"/>
              </a:graphicData></a:graphic>
            </wp:inline>
          </w:drawing></w:r></w:p>
        </w:body>
      </w:document>`
  );
  zip.file(
    "word/charts/chart1.xml",
    chartXml
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

async function createWorkbookWithImage(
  options: {
    sheetDataXml?: string;
    fromColumn?: number;
    fromRow?: number;
    toColumn?: number;
    toRow?: number;
    title?: string;
    mediaTarget?: string;
    mediaFilePath?: string;
  } = {}
): Promise<Blob> {
  const sheetDataXml =
    options.sheetDataXml ??
    '<row r="1" ht="90" customHeight="1"><c r="A1" t="e"><v>#VALUE!</v></c><c r="B1" t="inlineStr"><is><t>Product</t></is></c></row>';
  const fromColumn = options.fromColumn ?? 0;
  const fromRow = options.fromRow ?? 0;
  const toColumn = options.toColumn ?? 1;
  const toRow = options.toRow ?? 3;
  const title = options.title ?? "Inserted logo";
  const mediaTarget = options.mediaTarget ?? "../media/image1.png";
  const mediaFilePath = options.mediaFilePath ?? "xl/media/image1.png";
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Images" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheetData>
          ${sheetDataXml}
        </sheetData>
        <drawing r:id="rIdDrawing1"/>
      </worksheet>`
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <xdr:twoCellAnchor>
          <xdr:from><xdr:col>${fromColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
          <xdr:to><xdr:col>${toColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
          <xdr:pic>
            <xdr:nvPicPr><xdr:cNvPr id="2" name="${title}"/><xdr:cNvPicPr/></xdr:nvPicPr>
            <xdr:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
            <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
          </xdr:pic>
          <xdr:clientData/>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`
  );
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${mediaTarget}"/>
      </Relationships>`
  );
  zip.file(mediaFilePath, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createWorkbookWithWpsCellImage(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="CellImages" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Photo</t></is></c></row>
          <row r="2" ht="72" customHeight="1">
            <c r="A2" t="inlineStr"><is><t>Apple</t></is></c>
            <c r="B2" t="e"><f>DISPIMG(&quot;ID_TEST_WPS_1&quot;,1)</f><v>#VALUE!</v></c>
          </row>
        </sheetData>
      </worksheet>`
  );
  zip.file(
    "xl/cellimages.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <etc:cellImages xmlns:etc="http://www.wps.cn/officeDocument/2017/etCustomData"
        xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <xdr:pic>
          <xdr:nvPicPr><xdr:cNvPr id="2" name="ID_TEST_WPS_1" descr="WPS cell image"/><xdr:cNvPicPr/></xdr:nvPicPr>
          <xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
          <xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
        </xdr:pic>
      </etc:cellImages>`
  );
  zip.file(
    "xl/_rels/cellimages.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
      </Relationships>`
  );
  zip.file("xl/media/image1.png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createWorkbookWithRichValueCellImage(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="RichImages" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row>
          <row r="3" ht="72" customHeight="1">
            <c r="C3" t="e" vm="1"><v>#VALUE!</v></c>
          </row>
        </sheetData>
      </worksheet>`
  );
  zip.file(
    "xl/metadata.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <metadataTypes count="1">
          <metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/>
        </metadataTypes>
        <futureMetadata name="XLRICHVALUE" count="1">
          <bk><rc t="1" v="0"/></bk>
        </futureMetadata>
        <valueMetadata count="1">
          <bk><rc t="1" v="0"/></bk>
        </valueMetadata>
      </metadata>`
  );
  zip.file(
    "xl/richData/rdrichvalue.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1">
        <rv i="0"><v>0</v><vb i="0"/></rv>
      </rvData>`
  );
  zip.file(
    "xl/richData/richValueRel.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" count="1">
        <rel r:id="rId1"/>
      </richValueRels>`
  );
  zip.file(
    "xl/richData/_rels/richValueRel.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
      </Relationships>`
  );
  zip.file("xl/media/image1.png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createMinimalPptx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:cSld>
          <p:spTree>
            <p:sp><p:txBody><a:p><a:r><a:t>Quarter Plan</a:t></a:r></a:p></p:txBody></p:sp>
            <p:sp><p:txBody><a:p><a:r><a:t>North / South</a:t></a:r></a:p></p:txBody></p:sp>
            <p:pic><p:blipFill><a:blip r:embed="rIdImage"/></p:blipFill></p:pic>
          </p:spTree>
        </p:cSld>
        <p:transition/>
        <p:timing><p:tnLst><p:animEffect/></p:tnLst></p:timing>
      </p:sld>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
        <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        <Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
      </Relationships>`
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld name="Title Slide"/>
      </p:sldLayout>`
  );
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
      </p:notes>`
  );
  zip.file("ppt/media/image1.png", "png");
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

async function createPptxPlaceholderInheritanceFixture(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree><p:sp>
          <p:nvSpPr><p:cNvPr id="1" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="11"/></p:nvPr></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="934753" y="4326473"/><a:ext cx="4316798" cy="1259417"/></a:xfrm></p:spPr>
          <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr b="1"/><a:t>2027.11.30</a:t></a:r></a:p></p:txBody>
        </p:sp></p:spTree></p:cSld>
      </p:sld>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
      </Relationships>`
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp><p:nvSpPr><p:cNvPr id="10" name="Wrong sibling"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="10"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="3735"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody></p:sp>
          <p:sp><p:nvSpPr><p:cNvPr id="11" name="Correct placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="11"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></a:lstStyle><a:p/></p:txBody></p:sp>
        </p:spTree></p:cSld>
      </p:sldLayout>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

async function createPptxAutofitLineHeightFixture(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree><p:sp>
          <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
          <p:spPr><a:xfrm><a:off x="467970" y="1799886"/><a:ext cx="9071428" cy="3288032"/></a:xfrm></p:spPr>
          <p:txBody>
            <a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>
            <a:p><a:r><a:rPr sz="3200"/><a:t>不使用 复杂类型定义（泛型、方法重载、条件类型等）</a:t></a:r></a:p>
            <a:p><a:r><a:rPr sz="3200"/><a:t>尽量使用常量枚举来定义多个相关常量</a:t></a:r></a:p>
            <a:p><a:pPr><a:lnSpc><a:spcPts val="3200"/></a:lnSpc></a:pPr><a:r><a:rPr sz="3200"/><a:t>显式行距保持不变</a:t></a:r></a:p>
          </p:txBody>
        </p:sp></p:spTree></p:cSld>
      </p:sld>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  });
}

function createMinimalFods(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <office:document
      xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
      office:version="1.3">
      <office:body>
        <office:spreadsheet>
          <table:table table:name="Budget">
            <table:table-row>
              <table:table-cell><text:p>Item</text:p></table:table-cell>
              <table:table-cell table:number-columns-repeated="2"><text:p>Month</text:p></table:table-cell>
            </table:table-row>
            <table:table-row>
              <table:table-cell><text:p>Revenue</text:p></table:table-cell>
              <table:table-cell office:value-type="float" office:value="42" />
              <table:table-cell office:value-type="date" office:date-value="2026-06-14" />
            </table:table-row>
            <table:table-row>
              <table:table-cell><text:p>Total</text:p></table:table-cell>
              <table:table-cell table:formula="of:=SUM([.B2:.B3])" office:value-type="float" office:value="42" />
            </table:table-row>
          </table:table>
        </office:spreadsheet>
      </office:body>
    </office:document>`;
}

function createLegacyBinaryBlob(fragments: string[], encoding: "ascii" | "utf16" = "ascii"): Blob {
  const signature = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const chunks: BlobPart[] = [toBlobPart(signature), "\0\0"];
  for (const fragment of fragments) {
    chunks.push(encoding === "utf16" ? toBlobPart(encodeUtf16Le(fragment)) : `\0${fragment}\0`);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeUtf16Le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2 + 2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes[index * 2] = code & 0xff;
    bytes[index * 2 + 1] = code >> 8;
  }
  return bytes;
}

function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, hidden: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!hidden) {
        parts.push(node.textContent || "");
      }
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach((child) => walk(child, hidden));
      return;
    }
    const isHidden =
      hidden ||
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      node.style.display === "none" ||
      node.style.visibility === "hidden";
    node.childNodes.forEach((child) => walk(child, isHidden));
  };
  walk(root, false);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function createMinimalFodp(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <office:document
      xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
      xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
      xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0"
      office:version="1.3">
      <office:body>
        <office:presentation>
          <draw:page draw:name="page1" presentation:class="title" presentation:transition-type="automatic">
            <draw:frame><draw:text-box><text:p>Overview</text:p><text:p>Market / Product</text:p></draw:text-box></draw:frame>
            <presentation:notes><text:p>Talk track</text:p></presentation:notes>
            <anim:par />
          </draw:page>
          <draw:page draw:name="page2" presentation:class="outline">
            <draw:frame><draw:text-box><text:p>Details</text:p></draw:text-box></draw:frame>
          </draw:page>
        </office:presentation>
      </office:body>
    </office:document>`;
}

async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
