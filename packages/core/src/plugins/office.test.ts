import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createViewer } from "../viewer";
import { officePlugin } from "./office";

const shouldFailDocxPreview = vi.hoisted(() => ({ value: false }));
const shouldFailMammoth = vi.hoisted(() => ({ value: false }));
const renderDocxAsync = vi.hoisted(() =>
  vi.fn(async (_data: unknown, bodyContainer: HTMLElement, _styleContainer?: HTMLElement, _options?: unknown) => {
    if (shouldFailDocxPreview.value) {
      throw new Error("docx-preview failed");
    }
    const wrapper = document.createElement("div");
    wrapper.className = "ofv-docx-wrapper";
    const page = document.createElement("section");
    page.className = "ofv-docx";
    page.style.width = "794px";
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
    const page = document.createElement("div");
    page.className = "pptx-rendered";
    page.textContent = "PPTX rendered";
    container.append(page);
  })
);

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
    open: openPptx
  }
}));

describe("officePlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    shouldFailDocxPreview.value = false;
    shouldFailMammoth.value = false;
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

    expect(container.querySelector(".ofv-tabs button")?.classList.contains("is-active")).toBe(true);
    expect(container.querySelector(".ofv-tabs")?.getAttribute("role")).toBe("tablist");
    expect(container.querySelector(".ofv-tabs button")?.getAttribute("role")).toBe("tab");
    expect(container.querySelector(".ofv-tabs button")?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("role")).toBe("tabpanel");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("aria-label")).toBe("Summary");
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("4 行 x 2 列");
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("1 个公式单元格");
    expect(container.querySelector(".ofv-cell-formula")?.getAttribute("title")).toBe("=SUM(B2:B3)");
    expect(container.querySelector(".ofv-formula-list")?.textContent).toContain("B4: =SUM(B2:B3)");
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
  });

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

    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("3 行 x 2 列");
    expect(container.querySelector(".ofv-chart-card h4")?.textContent).toBe("Quarterly Revenue");
    expect(container.querySelector(".ofv-chart-card header span")?.textContent).toContain("bar");
    expect(container.querySelector(".ofv-chart-card header span")?.textContent).toContain("1 个系列");
    expect(container.querySelector(".ofv-chart-svg")?.getAttribute("role")).toBe("img");
    expect(container.querySelectorAll(".ofv-chart-svg rect[data-index]")).toHaveLength(3);
    expect(container.querySelector(".ofv-chart-data")?.textContent).toContain("Revenue: 12, 18, 30");
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

    expect(container.querySelector(".ofv-tabs button")?.textContent).toBe("Budget");
    expect(container.querySelector(".ofv-sheet")?.getAttribute("aria-label")).toBe("Budget");
    expect(container.querySelector(".ofv-sheet-summary")?.textContent).toContain("3 行 x 3 列");
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
    expect(container.querySelector(".ofv-office-package-note")?.textContent).toContain("DOCX");
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

    expect(container.querySelector(".ofv-docx-fallback-note")?.textContent).toContain("基础内容预览");
    expect(container.textContent).toContain("Raw paragraph");
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

    expect(container.querySelector(".ofv-docx-fallback-note")).not.toBeNull();
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

    expect(container.querySelector(".ofv-office-package-note")?.textContent).toContain("OOXML Workbook");
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
