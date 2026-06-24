import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createViewer } from "../viewer";
import { officePlugin } from "./office";

const shouldFailDocxPreview = vi.hoisted(() => ({ value: false }));
const shouldFailMammoth = vi.hoisted(() => ({ value: false }));
const shouldRenderBlankDocxPreview = vi.hoisted(() => ({ value: false }));
const renderDocxAsync = vi.hoisted(() =>
  vi.fn(async (_data: unknown, bodyContainer: HTMLElement, _styleContainer?: HTMLElement, _options?: unknown) => {
    if (shouldFailDocxPreview.value) {
      throw new Error("docx-preview failed");
    }
    if (_styleContainer) {
      const style = document.createElement("style");
      style.textContent = ".docx-internal-style { color: red; }";
      _styleContainer.append(style);
    }
    const wrapper = document.createElement("div");
    wrapper.className = "ofv-docx-wrapper";
    const page = document.createElement("section");
    page.className = "ofv-docx";
    page.style.width = "794px";
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
    page.style.backgroundColor = "transparent";
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
    page.append(mirroredTextGroup);
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
    shouldFailMammoth.value = false;
    shouldRenderBlankDocxPreview.value = false;
    pptxRenderMode.value = "normal";
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
    expect(container.querySelector('[data-cell="B1"]')).toBeNull();
    expect(mergedNote?.rowSpan).toBe(2);
    expect(mergedNote?.classList.contains("ofv-cell-multiline")).toBe(true);
    expect(mergedNote?.textContent).toBe("Multiline\nnote");
    expect(table?.style.width).toBe("380px");
    expect(container.querySelector<HTMLTableRowElement>("tr")?.style.height).toBe("21px");
    expect(container.querySelector(".ofv-column-resize-handle")).not.toBeNull();
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

    const firstCell = container.querySelector<HTMLTableCellElement>('[data-cell="A1"]');
    const handle = firstCell?.querySelector<HTMLElement>(".ofv-column-resize-handle");
    firstCell!.getBoundingClientRect = () =>
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
  }, 20000);

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
    expect(container.querySelectorAll(".ofv-chart-svg rect[data-index]")).toHaveLength(3);
    expect(container.querySelector(".ofv-chart-data")?.textContent).toContain("Revenue: 12, 18, 30");
    expect(container.querySelector<HTMLElement>(".ofv-chart-data")?.hidden).toBe(true);
    expect(visibleText(container)).not.toContain("数据摘要");
    expect(visibleText(container)).not.toContain("Revenue: 12, 18, 30");
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

    expect(renderDocxAsync).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".ofv-docx-document")?.parentElement?.classList.contains("ofv-office")).toBe(true);
    expect(container.querySelector(".ofv-office > section > h3")).toBeNull();
    expect(renderDocxAsync.mock.calls[0][3]).toMatchObject({
      className: "ofv-docx",
      breakPages: true,
      renderHeaders: true,
      renderFooters: true
    });
    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
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
    expect(container.querySelector(".ofv-docx-document")?.textContent).toContain("DOCX layout page");
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
    expect(container.querySelector<HTMLElement>("section.ofv-docx")?.style.width).toBe("794px");
    expect(container.querySelector<HTMLElement>(".ofv-docx-wrapper")?.style.getPropertyValue("--ofv-docx-scale")).toBe(
      "0.35"
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
    expect(document.head.querySelector(".ofv-docx-style-container")?.textContent).toContain("docx-internal-style");

    viewer.destroy();

    await waitFor(() => document.head.querySelector(".ofv-docx-style-container") === null);
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

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false, 5000);

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
    expect(container.querySelector(".ofv-pdf-viewer-title")?.textContent).toBe("Office 高保真转换预览");
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

    await waitFor(() => container.textContent?.includes("Web前端工程师") || false, 5000);

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
    expect(imageWrapper.style.left).toBe("454.35pt");
    expect(imageWrapper.style.width).toBe("68pt");
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
    expect(container.querySelector<HTMLElement>(".pptx-rendered")?.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(container.querySelector<HTMLElement>(".pptx-mirrored-text-group > div")?.style.transform).toBe("scaleX(-1)");
    expect(container.querySelector<HTMLElement>(".pptx-mirrored-text-group > div")?.dataset.ofvPptxCounterMirror).toBe("x");
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
    expect(slide?.style.transform).toBe("scale(1.12)");
    expect(zoomReset?.textContent).toBe("112%");

    zoomReset?.click();
    expect(slide?.style.transform).toBe("");
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
    expect(container.textContent).toContain("Office 转换提示");
    expect(container.textContent).toContain("Word Binary File Format");
    expect(container.textContent).toContain("OLE Compound File");
    expect(container.querySelector(".ofv-office-conversion")).not.toBeNull();
    expect(container.textContent).toContain("可读文本片段");
    expect(container.textContent).toContain("Quarterly roadmap");
    expect(container.textContent).toContain("Budget 2026");
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
    expect(container.textContent).toContain("Office 转换提示");
    expect(container.textContent).toContain("PowerPoint Binary File Format");
    expect(container.textContent).toContain("未提取到稳定可读文本");
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
    expect(container.textContent).toContain("Office 转换提示");
    expect(container.textContent).toContain("Excel Binary File Format");
    expect(container.textContent).toContain("表格解析失败");
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
    expect(container.textContent).toContain("Office 转换提示");
    expect(container.textContent).toContain("Excel Binary File Format");
    expect(container.textContent).toContain("表格解析失败");
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
        <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
        <fills count="3">
          <fill><patternFill patternType="none"/></fill>
          <fill><patternFill patternType="gray125"/></fill>
          <fill><patternFill patternType="solid"><fgColor rgb="FFD9F5D6"/><bgColor indexed="64"/></patternFill></fill>
        </fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="3">
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
          <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
          <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">
            <alignment vertical="top" wrapText="1"/>
          </xf>
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
            <c r="A3" t="inlineStr"><is><t>A</t></is></c>
            <c r="C3"><v>42</v></c>
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

async function createWorkbookWithChart(): Promise<Blob> {
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
            <c:barChart>
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
            </c:barChart>
          </c:plotArea>
        </c:chart>
      </c:chartSpace>`
  );
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

async function createWorkbookWithImage(): Promise<Blob> {
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
          <row r="1" ht="90" customHeight="1"><c r="A1" t="e"><v>#VALUE!</v></c><c r="B1" t="inlineStr"><is><t>Product</t></is></c></row>
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
          <xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
          <xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
          <xdr:pic>
            <xdr:nvPicPr><xdr:cNvPr id="2" name="Inserted logo"/><xdr:cNvPicPr/></xdr:nvPicPr>
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
        <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
