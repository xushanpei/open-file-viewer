import JSZip from "jszip";
import DOMPurify from "dompurify";
import type { WorkBook } from "xlsx";
import type { PreviewPlugin } from "../types";
import { createPanel, createSection, decodeTextBuffer, readArrayBuffer, resolveFormat } from "./utils";

const wordExtensions = new Set(["docx", "docm", "doc", "dotx", "dotm", "dot", "rtf", "odt", "fodt", "wps"]);
const sheetExtensions = new Set(["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "csv", "tsv", "ods", "fods", "numbers", "et"]);
const presentationExtensions = new Set(["pptx", "pptm", "ppt", "pps", "ppsx", "ppsm", "potx", "potm", "odp", "fodp", "key", "dps"]);
const packagedOfficeCandidates = new Set(["wps", "et", "dps", "numbers", "key"]);
const SHEET_WINDOW_ROWS = 200;
const SHEET_WINDOW_COLUMNS = 80;
const PPTX_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const officeMimeTypes = new Set([
  "application/msword",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-word.template.macroenabled.12",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.text-flat-xml",
  "application/vnd.ms-works",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.ms-excel.template.macroenabled.12",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.spreadsheet-flat-xml",
  "application/vnd.apple.numbers",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.ms-powerpoint.template.macroenabled.12",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.presentation-flat-xml",
  "application/vnd.apple.keynote"
]);
const officeMimeFormatMap: Record<string, string> = {
  "application/msword": "doc",
  "application/rtf": "rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-word.document.macroenabled.12": "docm",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "dotx",
  "application/vnd.ms-word.template.macroenabled.12": "dotm",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.text-flat-xml": "fodt",
  "application/vnd.ms-works": "wps",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": "xltx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsm",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": "xlsb",
  "application/vnd.ms-excel.template.macroenabled.12": "xltm",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.spreadsheet-flat-xml": "fods",
  "application/vnd.apple.numbers": "numbers",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": "pptm",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": "ppsx",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": "ppsm",
  "application/vnd.openxmlformats-officedocument.presentationml.template": "potx",
  "application/vnd.ms-powerpoint.template.macroenabled.12": "potm",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.presentation-flat-xml": "fodp",
  "application/vnd.apple.keynote": "key"
};

type LegacyOfficeTextSource = "ascii" | "utf16";

type PresentationSlideInsight = {
  title: string;
  layout?: string;
  textCount: number;
  imageCount: number;
  notesCount: number;
  hasTransition: boolean;
  animationCount: number;
  sampleTexts: string[];
};

type PresentationInsight = {
  title: string;
  slideCount: number;
  imageCount: number;
  notesCount: number;
  transitionCount: number;
  animationCount: number;
  layouts: string[];
  slides: PresentationSlideInsight[];
};

type IWorkMetadata = {
  title?: string;
  author?: string;
  company?: string;
  subject?: string;
  keywords?: string[];
  created?: string;
  modified?: string;
};

export function officePlugin(): PreviewPlugin {
  return {
    name: "office",
    match(file) {
      return (
        wordExtensions.has(file.extension) ||
        sheetExtensions.has(file.extension) ||
        presentationExtensions.has(file.extension) ||
        officeMimeTypes.has(file.mimeType)
      );
    },
    async render(ctx) {
      const panel = createPanel("ofv-office");
      ctx.viewport.append(panel);
      const extension = resolveFormat(ctx.file, officeMimeFormatMap);
      const arrayBuffer = await readArrayBuffer(ctx.file);
      const packageFormat = shouldSniffPackagedOffice(extension) ? await detectPackagedOfficeFormat(arrayBuffer) : undefined;
      let disposeDocxFit: (() => void) | undefined;

      if (packageFormat === "docx" && !fileIsDocx(extension)) {
        renderOfficePackageNotice(panel, extension, "检测到 OOXML Word 包结构，已按 DOCX 兼容路径预览。");
        disposeDocxFit = await renderDocx(panel, arrayBuffer);
      } else if (packageFormat === "xlsx" && !sheetExtensions.has(extension)) {
        renderOfficePackageNotice(panel, extension, "检测到 OOXML Workbook 包结构，已按 XLSX 兼容路径预览。");
        await renderSheet(panel, arrayBuffer, "xlsx");
      } else if (packageFormat === "pptx" && !["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(extension)) {
        renderOfficePackageNotice(panel, extension, "检测到 OOXML Presentation 包结构，已按 PPTX 兼容路径预览。");
        await renderPptx(panel, arrayBuffer);
      } else if (fileIsDocx(extension)) {
        disposeDocxFit = await renderDocx(panel, arrayBuffer);
      } else if (extension === "rtf") {
        renderPlainDocument(panel, "RTF 文档", rtfToText(await readTextFromBuffer(arrayBuffer)));
      } else if (extension === "odt") {
        await renderOdt(panel, arrayBuffer);
      } else if (extension === "fodt") {
        renderOpenDocumentXml(panel, "FODT 文档", await readTextFromBuffer(arrayBuffer));
      } else if (extension === "fods") {
        renderFlatOds(panel, await readTextFromBuffer(arrayBuffer));
      } else if (packagedOfficeCandidates.has(extension) && (await renderPackagedOfficePreview(panel, arrayBuffer, extension))) {
        // Rendered by package sniffing.
      } else if (sheetExtensions.has(extension)) {
        await renderSheet(panel, arrayBuffer, extension);
      } else if (["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(extension)) {
        await renderPptx(panel, arrayBuffer);
      } else if (extension === "odp") {
        await renderOdp(panel, arrayBuffer);
      } else if (extension === "fodp") {
        renderOpenDocumentPresentationXml(panel, await readTextFromBuffer(arrayBuffer));
      } else if (isLegacyOfficeBinary(extension)) {
        renderLegacyOfficeBinary(panel, extension, arrayBuffer);
      } else {
        renderUnsupportedOffice(panel, extension || ctx.file.extension || "office");
      }

      return {
        destroy() {
          disposeDocxFit?.();
          panel.remove();
        }
      };
    }
  };
}

function fileIsDocx(extension: string): boolean {
  return extension === "docx" || extension === "docm" || extension === "dotx" || extension === "dotm";
}

function shouldSniffPackagedOffice(extension: string): boolean {
  return isLegacyOfficeBinary(extension) || packagedOfficeCandidates.has(extension) || extension === "";
}

async function detectPackagedOfficeFormat(arrayBuffer: ArrayBuffer): Promise<"docx" | "xlsx" | "pptx" | undefined> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const hasEntry = (path: string) => entries.some((entry) => entry.name.toLowerCase() === path.toLowerCase());
    if (hasEntry("word/document.xml")) {
      return "docx";
    }
    if (hasEntry("xl/workbook.xml")) {
      return "xlsx";
    }
    if (hasEntry("ppt/presentation.xml")) {
      return "pptx";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function renderDocx(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<() => void> {
  const section = createSection("Word 文档");
  const content = document.createElement("div");
  content.className = "ofv-docx-document";
  section.append(content);
  panel.append(section);

  try {
    const docxPreview = await import("docx-preview");
    await docxPreview.renderAsync(arrayBuffer, content, content, {
      className: "ofv-docx",
      inWrapper: true,
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: true,
      renderAltChunks: true,
      experimental: true,
      useBase64URL: true
    });
    normalizeDocxLayout(content);
    return fitDocxPages(content);
  } catch (error) {
    content.replaceChildren();
    const fallbackNote = document.createElement("div");
    fallbackNote.className = "ofv-docx-fallback-note";
    fallbackNote.textContent = "高保真 DOCX 渲染失败，已切换为基础内容预览。";
    content.append(fallbackNote);
    try {
      await renderDocxWithMammoth(content, arrayBuffer);
    } catch (fallbackError) {
      await renderDocxTextFallback(content, arrayBuffer);
      console.warn("DOCX content fallback failed, used raw OpenXML text extraction:", fallbackError);
    }
    console.warn("DOCX layout preview failed, fell back to Mammoth:", error);
  }
  return () => undefined;
}

function normalizeDocxLayout(container: HTMLElement): void {
  const pages = container.querySelectorAll<HTMLElement>("section.ofv-docx");
  for (const page of pages) {
    for (const element of page.querySelectorAll<HTMLElement>("[style*='line-height']")) {
      const lineHeight = parseCssLineHeight(element.style.lineHeight);
      if (lineHeight > 0 && lineHeight < 1) {
        element.style.lineHeight = "1.2";
      }
    }
  }
}

function parseCssLineHeight(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "normal") {
    return 0;
  }
  if (trimmed.endsWith("%")) {
    const parsedPercent = Number.parseFloat(trimmed);
    return Number.isFinite(parsedPercent) ? parsedPercent / 100 : 0;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fitDocxPages(container: HTMLElement): () => void {
  const wrapper = container.querySelector<HTMLElement>(".ofv-docx-wrapper");
  if (!wrapper) {
    return () => undefined;
  }

  const update = () => {
    const frames = ensureDocxPageFrames(wrapper);
    if (frames.length === 0) {
      wrapper.style.removeProperty("--ofv-docx-scale");
      return;
    }

    const availableWidth = Math.max(1, container.clientWidth - 48);
    const pageWidth = Math.max(
      1,
      ...frames.map(({ page }) => {
        const rectWidth = page.getBoundingClientRect().width;
        return page.offsetWidth || rectWidth || parseCssPixelValue(page.style.width) || 794;
      })
    );
    const scale = Math.min(1, Math.max(0.35, availableWidth / pageWidth));
    wrapper.style.setProperty("--ofv-docx-scale", formatCssNumber(scale));
    wrapper.style.setProperty("--ofv-docx-page-width", `${pageWidth}px`);

    for (const { frame, page } of frames) {
      const pageHeight = page.offsetHeight || page.getBoundingClientRect().height || parseCssPixelValue(page.style.height);
      if (pageHeight > 0) {
        frame.style.height = `${Math.ceil(pageHeight * scale)}px`;
      }
    }
  };

  update();
  const timers = [0, 80, 240].map((delay) => window.setTimeout(update, delay));

  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", update);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", update);
    };
  }

  const observer = new ResizeObserver(update);
  observer.observe(container);
  observer.observe(wrapper);
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    observer.disconnect();
  };
}

function ensureDocxPageFrames(wrapper: HTMLElement): Array<{ frame: HTMLElement; page: HTMLElement }> {
  const pages = Array.from(wrapper.querySelectorAll<HTMLElement>("section.ofv-docx"));
  return pages.map((page) => {
    const parent = page.parentElement;
    if (parent?.classList.contains("ofv-docx-page-frame")) {
      return { frame: parent, page };
    }
    const frame = document.createElement("div");
    frame.className = "ofv-docx-page-frame";
    page.before(frame);
    frame.append(page);
    return { frame, page };
  });
}

function parseCssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCssNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : "1";
}

async function renderDocxTextFallback(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const article = document.createElement("article");
  article.className = "ofv-document";

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    const paragraphs = documentXml ? extractWordParagraphs(documentXml) : [];
    if (paragraphs.length > 0) {
      for (const paragraphText of paragraphs) {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        article.append(paragraph);
      }
    } else {
      const empty = document.createElement("p");
      empty.textContent = "DOCX 内容解析失败，未提取到可展示文本。";
      article.append(empty);
    }
  } catch {
    const empty = document.createElement("p");
    empty.textContent = "DOCX 内容解析失败，文件可能已损坏或不是有效的 DOCX。";
    article.append(empty);
  }

  container.append(article);
}

async function renderDocxWithMammoth(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.read("base64")}`
      }))
    }
  );
  const content = document.createElement("article");
  content.className = "ofv-document";
  content.innerHTML = sanitizeHtml(result.value || "<p>未解析到可展示内容。</p>");
  container.append(content);

  if (result.messages.length > 0) {
    const notes = document.createElement("details");
    notes.className = "ofv-details";
    const summary = document.createElement("summary");
    summary.textContent = `解析提示 ${result.messages.length}`;
    const list = document.createElement("ul");
    for (const message of result.messages) {
      const item = document.createElement("li");
      item.textContent = message.message;
      list.append(item);
    }
    notes.append(summary, list);
    container.append(notes);
  }
}

async function renderOdt(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const content = zip.file("content.xml");
  if (!content) {
    renderPlainDocument(panel, "ODT 文档", "未找到 content.xml。");
    return;
  }
  renderOpenDocumentXml(panel, "ODT 文档", await content.async("text"));
}

function renderOpenDocumentXml(panel: HTMLElement, title: string, xml: string): void {
  const section = createSection(title);
  const article = document.createElement("article");
  article.className = "ofv-document";
  const blocks = extractOpenDocumentBlocks(xml);
  if (blocks.length > 0) {
    for (const block of blocks) {
      const paragraph = document.createElement("p");
      paragraph.textContent = block;
      article.append(paragraph);
    }
  } else {
    const empty = document.createElement("p");
    empty.textContent = "未提取到可展示文本。";
    article.append(empty);
  }
  section.append(article);
  panel.append(section);
}

function renderPlainDocument(panel: HTMLElement, title: string, text: string): void {
  const section = createSection(title);
  const pre = document.createElement("pre");
  pre.className = "ofv-text-block";
  pre.textContent = text || "未提取到可展示文本。";
  section.append(pre);
  panel.append(section);
}

async function renderSheet(
  panel: HTMLElement,
  arrayBuffer: ArrayBuffer,
  extension: string
): Promise<void> {
  const xlsx = await import("xlsx");
  let workbook: WorkBook;
  try {
    workbook =
      extension === "csv" || extension === "tsv"
        ? (xlsx.read(decodeTextBuffer(arrayBuffer), { type: "string", FS: extension === "tsv" ? "\t" : "," }) as WorkBook)
        : (xlsx.read(arrayBuffer, { type: "array" }) as WorkBook);
  } catch (error) {
    if (isLegacyOfficeBinary(extension)) {
      renderLegacyOfficeBinary(panel, extension, arrayBuffer, `表格解析失败：${normalizeOfficeError(error)}`);
      return;
    }
    renderSheetFallback(panel, extension, normalizeOfficeError(error));
    return;
  }
  const chartPreviews = await readWorkbookCharts(arrayBuffer).catch(() => []);
  const tabs = document.createElement("div");
  tabs.className = "ofv-tabs";
  tabs.setAttribute("role", "tablist");
  const content = document.createElement("div");
  content.className = "ofv-sheet";
  content.setAttribute("role", "tabpanel");
  const buttons = new Map<string, HTMLButtonElement>();

  const renderSheetByName = (sheetName: string, sheetIndex: number) => {
    content.replaceChildren();
    buttons.forEach((button, name) => {
      const active = name === sheetName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    content.setAttribute("aria-label", sheetName);

    const heading = document.createElement("h3");
    heading.textContent = sheetName;
    const sheet = workbook.Sheets[sheetName];
    const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    const formulaRows = collectFormulaRows(sheet, range, xlsx.utils.encode_cell);

    const summary = document.createElement("div");
    summary.className = "ofv-sheet-summary";
    summary.textContent = `${rowCount} 行 x ${columnCount} 列${
      formulaRows.length > 0 ? `，包含 ${formulaRows.length} 个公式单元格` : ""
    }`;

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "ofv-table-scroll";
    const viewport = createSheetViewport(rowCount, columnCount);
    const windowControls = createSheetWindowControls(viewport, () => renderTableWindow());
    const renderTableWindow = () => {
      tableWrapper.replaceChildren(
        createWorkbookSheetTable(
          sheet,
          range,
          sheetIndex,
          viewport,
          xlsx.utils.encode_cell,
          xlsx.utils.format_cell
        )
      );
      windowControls?.update();
    };

    content.append(heading, summary);
    if (windowControls) {
      content.append(windowControls.element);
    }
    content.append(tableWrapper);
    renderTableWindow();

    if (formulaRows.length > 0) {
      const details = document.createElement("details");
      details.className = "ofv-details ofv-formula-list";
      const detailsSummary = document.createElement("summary");
      detailsSummary.textContent = "公式明细";
      const list = document.createElement("ul");
      for (const item of formulaRows.slice(0, 200)) {
        const row = document.createElement("li");
        row.textContent = `${item.address}: ${item.formula}`;
        list.append(row);
      }
      if (formulaRows.length > 200) {
        const row = document.createElement("li");
        row.textContent = `还有 ${formulaRows.length - 200} 个公式未展示。`;
        list.append(row);
      }
      details.append(detailsSummary, list);
      content.append(details);
    }
  };

  if (workbook.SheetNames.length === 0) {
    content.textContent = extension === "numbers" ? "Numbers 文件需要服务端转换后高保真预览。" : "未解析到表格。";
  } else {
    for (const [index, sheetName] of workbook.SheetNames.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.textContent = sheetName;
      button.title = sheetName;
      button.addEventListener("click", () => renderSheetByName(sheetName, index));
      buttons.set(sheetName, button);
      tabs.append(button);
      if (index === 0) {
        renderSheetByName(sheetName, index);
      }
    }
  }

  panel.append(tabs, content);
  if (chartPreviews.length > 0) {
    panel.append(renderChartPreviewSection(chartPreviews));
  }
}

function renderSheetFallback(panel: HTMLElement, extension: string, detail: string): void {
  const section = createSection("表格解析失败");
  const title = document.createElement("p");
  title.textContent = `.${extension || "sheet"} 文件无法解析为可预览表格。`;
  const meta = document.createElement("p");
  meta.textContent = detail;
  const support = document.createElement("p");
  support.textContent = "请确认文件未加密、未损坏，或先转换为 XLSX/CSV/ODS 后再预览。";
  section.append(title, meta, support);
  panel.append(section);
}

type ChartPreview = {
  name: string;
  type: string;
  title: string;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
};

type ParsedSheet = {
  name: string;
  rows: string[][];
  formulas: Array<{ address: string; formula: string }>;
};

function renderFlatOds(panel: HTMLElement, xml: string): void {
  const sheets = parseFlatOds(xml);
  renderParsedSheets(panel, sheets, "FODS 文件未解析到表格。");
}

function renderParsedSheets(panel: HTMLElement, sheets: ParsedSheet[], emptyMessage: string): void {
  const tabs = document.createElement("div");
  tabs.className = "ofv-tabs";
  tabs.setAttribute("role", "tablist");
  const content = document.createElement("div");
  content.className = "ofv-sheet";
  content.setAttribute("role", "tabpanel");
  const buttons = new Map<string, HTMLButtonElement>();

  const renderSheetByIndex = (sheet: ParsedSheet, sheetIndex: number) => {
    content.replaceChildren();
    buttons.forEach((button, name) => {
      const active = name === sheet.name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    content.setAttribute("aria-label", sheet.name);

    const heading = document.createElement("h3");
    heading.textContent = sheet.name;
    const summary = document.createElement("div");
    summary.className = "ofv-sheet-summary";
    const rowCount = sheet.rows.length;
    const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length));
    summary.textContent = `${rowCount} 行 x ${columnCount} 列${
      sheet.formulas.length > 0 ? `，包含 ${sheet.formulas.length} 个公式单元格` : ""
    }`;

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "ofv-table-scroll";
    const viewport = createSheetViewport(rowCount, columnCount);
    const windowControls = createSheetWindowControls(viewport, () => renderTableWindow());
    const renderTableWindow = () => {
      tableWrapper.replaceChildren(createParsedSheetTable(sheet, sheetIndex, viewport));
      windowControls?.update();
    };

    content.append(heading, summary);
    if (windowControls) {
      content.append(windowControls.element);
    }
    content.append(tableWrapper);
    renderTableWindow();

    if (sheet.formulas.length > 0) {
      const details = document.createElement("details");
      details.className = "ofv-details ofv-formula-list";
      const detailsSummary = document.createElement("summary");
      detailsSummary.textContent = "公式明细";
      const list = document.createElement("ul");
      for (const item of sheet.formulas.slice(0, 200)) {
        const row = document.createElement("li");
        row.textContent = `${item.address}: ${item.formula}`;
        list.append(row);
      }
      if (sheet.formulas.length > 200) {
        const row = document.createElement("li");
        row.textContent = `还有 ${sheet.formulas.length - 200} 个公式未展示。`;
        list.append(row);
      }
      details.append(detailsSummary, list);
      content.append(details);
    }
  };

  if (sheets.length === 0) {
    content.textContent = emptyMessage;
  } else {
    for (const [index, sheet] of sheets.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.textContent = sheet.name;
      button.title = sheet.name;
      button.addEventListener("click", () => renderSheetByIndex(sheet, index));
      buttons.set(sheet.name, button);
      tabs.append(button);
      if (index === 0) {
        renderSheetByIndex(sheet, index);
      }
    }
  }

  panel.append(tabs, content);
}

async function readWorkbookCharts(arrayBuffer: ArrayBuffer): Promise<ChartPreview[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const chartEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^xl\/charts\/chart\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const charts: ChartPreview[] = [];
  for (const [index, entry] of chartEntries.entries()) {
    const xml = await entry.async("text");
    const chart = parseChartXml(xml, entry.name.split("/").pop() || `chart${index + 1}.xml`);
    if (chart) {
      charts.push(chart);
    }
  }
  return charts;
}

function parseChartXml(xml: string, fallbackName: string): ChartPreview | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return null;
  }

  const type = detectChartType(doc);
  const title = textFromFirst(doc, "title") || fallbackName.replace(/\.xml$/i, "");
  const seriesElements = Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "ser");
  const series = seriesElements
    .map((element, index) => parseChartSeries(element, index))
    .filter((item): item is { name: string; values: number[]; categories: string[] } => item.values.length > 0);

  if (series.length === 0) {
    return null;
  }

  return {
    name: fallbackName,
    type,
    title,
    categories: series.find((item) => item.categories.length > 0)?.categories || [],
    series: series.map((item) => ({ name: item.name, values: item.values }))
  };
}

function detectChartType(doc: Document): string {
  const chartType = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName.endsWith("Chart") && element.localName !== "chart"
  )?.localName;
  if (!chartType) {
    return "chart";
  }
  return chartType.replace(/Chart$/i, "").toLowerCase();
}

function parseChartSeries(
  element: Element,
  index: number
): { name: string; values: number[]; categories: string[] } {
  return {
    name: textFromFirst(element, "tx") || `Series ${index + 1}`,
    values: numbersFromFirst(element, "val"),
    categories: stringsFromFirst(element, "cat")
  };
}

function renderChartPreviewSection(charts: ChartPreview[]): HTMLElement {
  const section = createSection("表格图表预览");
  const grid = document.createElement("div");
  grid.className = "ofv-chart-grid";
  for (const chart of charts) {
    grid.append(renderChartCard(chart));
  }
  section.append(grid);
  return section;
}

function renderChartCard(chart: ChartPreview): HTMLElement {
  const card = document.createElement("article");
  card.className = "ofv-chart-card";

  const header = document.createElement("header");
  const title = document.createElement("h4");
  title.textContent = chart.title;
  const meta = document.createElement("span");
  meta.textContent = `${chart.type} · ${chart.series.length} 个系列`;
  header.append(title, meta);

  const svg = renderChartSvg(chart);
  const details = document.createElement("details");
  details.className = "ofv-details ofv-chart-data";
  const summary = document.createElement("summary");
  summary.textContent = "数据摘要";
  const list = document.createElement("ul");
  for (const item of chart.series) {
    const row = document.createElement("li");
    row.textContent = `${item.name}: ${item.values.slice(0, 12).join(", ")}${
      item.values.length > 12 ? ` ... 共 ${item.values.length} 项` : ""
    }`;
    list.append(row);
  }
  details.append(summary, list);
  card.append(header, svg, details);
  return card;
}

function renderChartSvg(chart: ChartPreview): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 640 260");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", chart.title);
  svg.classList.add("ofv-chart-svg");

  const allValues = chart.series.flatMap((item) => item.values).filter((value) => Number.isFinite(value));
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const span = max - min || 1;
  const colors = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed"];
  const plot = { x: 48, y: 24, width: 552, height: 178 };

  appendSvg(svg, "line", { x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.height, class: "ofv-chart-axis" });
  appendSvg(svg, "line", {
    x1: plot.x,
    y1: plot.y + plot.height,
    x2: plot.x + plot.width,
    y2: plot.y + plot.height,
    class: "ofv-chart-axis"
  });

  chart.series.forEach((series, seriesIndex) => {
    const color = colors[seriesIndex % colors.length];
    const step = series.values.length > 1 ? plot.width / (series.values.length - 1) : plot.width;
    const points = series.values.map((value, index) => ({
      x: plot.x + index * step,
      y: plot.y + plot.height - ((value - min) / span) * plot.height
    }));

    if (chart.type.includes("bar") || chart.type.includes("col")) {
      const barWidth = Math.max(4, Math.min(28, step * 0.6)) / Math.max(1, chart.series.length);
      points.forEach((point, index) => {
        const zeroY = plot.y + plot.height - ((0 - min) / span) * plot.height;
        const x = point.x - (barWidth * chart.series.length) / 2 + seriesIndex * barWidth;
        appendSvg(svg, "rect", {
          x,
          y: Math.min(point.y, zeroY),
          width: barWidth,
          height: Math.max(1, Math.abs(zeroY - point.y)),
          fill: color,
          "data-index": index
        });
      });
    } else {
      appendSvg(svg, "polyline", {
        points: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 3,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
      for (const point of points.slice(0, 80)) {
        appendSvg(svg, "circle", { cx: point.x, cy: point.y, r: 3, fill: color });
      }
    }

    appendLegend(svg, series.name, color, 52 + seriesIndex * 118, 236);
  });

  return svg;
}

function appendLegend(svg: SVGSVGElement, label: string, color: string, x: number, y: number): void {
  appendSvg(svg, "rect", { x, y: y - 10, width: 12, height: 12, rx: 2, fill: color });
  const text = appendSvg(svg, "text", { x: x + 18, y, class: "ofv-chart-label" });
  text.textContent = label.length > 16 ? `${label.slice(0, 16)}...` : label;
}

function appendSvg<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  parent.append(element);
  return element;
}

function textFromFirst(root: ParentNode, localName: string): string {
  const element = Array.from(root.querySelectorAll("*")).find((item) => item.localName === localName);
  return element ? chartText(element) : "";
}

function stringsFromFirst(root: ParentNode, localName: string): string[] {
  const element = Array.from(root.querySelectorAll("*")).find((item) => item.localName === localName);
  if (!element) {
    return [];
  }
  return chartStringValues(element);
}

function numbersFromFirst(root: ParentNode, localName: string): number[] {
  const element = Array.from(root.querySelectorAll("*")).find((item) => item.localName === localName);
  if (!element) {
    return [];
  }
  return Array.from(element.querySelectorAll("*"))
    .filter((item) => item.localName === "v")
    .map((item) => Number(item.textContent || ""))
    .filter((value) => Number.isFinite(value));
}

function chartText(element: Element): string {
  return (
    Array.from(element.querySelectorAll("*"))
      .filter((item) => item.localName === "v" || item.localName === "t")
      .map((item) => item.textContent?.trim() || "")
      .find(Boolean) || ""
  );
}

function chartStringValues(element: Element): string[] {
  return Array.from(element.querySelectorAll("*"))
    .filter((item) => item.localName === "v" || item.localName === "t")
    .map((item) => item.textContent?.trim() || "")
    .filter(Boolean);
}

type SheetViewport = {
  rowStart: number;
  columnStart: number;
  rowCount: number;
  columnCount: number;
};

type SheetWindowControls = {
  element: HTMLElement;
  update: () => void;
};

function createSheetViewport(rowCount: number, columnCount: number): SheetViewport {
  return {
    rowStart: 0,
    columnStart: 0,
    rowCount,
    columnCount
  };
}

function createSheetWindowControls(viewport: SheetViewport, render: () => void): SheetWindowControls | null {
  const needsRows = viewport.rowCount > SHEET_WINDOW_ROWS;
  const needsColumns = viewport.columnCount > SHEET_WINDOW_COLUMNS;
  if (!needsRows && !needsColumns) {
    return null;
  }

  const controls = document.createElement("div");
  controls.className = "ofv-sheet-window";

  const note = document.createElement("span");
  note.className = "ofv-sheet-window-note";

  const rowBack = createWindowButton("上 200 行", () => {
    viewport.rowStart = Math.max(0, viewport.rowStart - SHEET_WINDOW_ROWS);
    render();
  });
  const rowNext = createWindowButton("下 200 行", () => {
    viewport.rowStart = Math.min(maxStart(viewport.rowCount, SHEET_WINDOW_ROWS), viewport.rowStart + SHEET_WINDOW_ROWS);
    render();
  });
  const colBack = createWindowButton("左 80 列", () => {
    viewport.columnStart = Math.max(0, viewport.columnStart - SHEET_WINDOW_COLUMNS);
    render();
  });
  const colNext = createWindowButton("右 80 列", () => {
    viewport.columnStart = Math.min(
      maxStart(viewport.columnCount, SHEET_WINDOW_COLUMNS),
      viewport.columnStart + SHEET_WINDOW_COLUMNS
    );
    render();
  });

  controls.append(note, rowBack, rowNext, colBack, colNext);

  const update = () => {
    const rowEnd = Math.min(viewport.rowStart + SHEET_WINDOW_ROWS, viewport.rowCount);
    const columnEnd = Math.min(viewport.columnStart + SHEET_WINDOW_COLUMNS, viewport.columnCount);
    note.textContent = `大表格窗口化渲染：当前 ${viewport.rowStart + 1}-${rowEnd} 行，${viewport.columnStart + 1}-${columnEnd} 列`;
    rowBack.disabled = viewport.rowStart === 0;
    rowNext.disabled = viewport.rowStart >= maxStart(viewport.rowCount, SHEET_WINDOW_ROWS);
    colBack.disabled = viewport.columnStart === 0;
    colNext.disabled = viewport.columnStart >= maxStart(viewport.columnCount, SHEET_WINDOW_COLUMNS);
    rowBack.hidden = rowNext.hidden = !needsRows;
    colBack.hidden = colNext.hidden = !needsColumns;
  };

  update();
  return { element: controls, update };
}

function createWindowButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function maxStart(total: number, size: number): number {
  return Math.max(0, total - size);
}

function createWorkbookSheetTable(
  sheet: Record<string, any>,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
  sheetIndex: number,
  viewport: SheetViewport,
  encodeCell: (cell: { r: number; c: number }) => string,
  formatCell: (cell: any) => string
): HTMLTableElement {
  const table = document.createElement("table");
  table.id = `ofv-sheet-${sheetIndex + 1}`;
  const rowEnd = Math.min(range.s.r + viewport.rowStart + SHEET_WINDOW_ROWS - 1, range.e.r);
  const columnEnd = Math.min(range.s.c + viewport.columnStart + SHEET_WINDOW_COLUMNS - 1, range.e.c);

  for (let rowIndex = range.s.r + viewport.rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const row = document.createElement("tr");
    for (let columnIndex = range.s.c + viewport.columnStart; columnIndex <= columnEnd; columnIndex += 1) {
      const cell = document.createElement(rowIndex === range.s.r ? "th" : "td");
      const address = encodeCell({ r: rowIndex, c: columnIndex });
      const sourceCell = sheet[address];
      cell.dataset.cell = address;
      const text = sourceCell ? formatCell(sourceCell) : "";
      cell.textContent = text;
      if (text) {
        cell.title = text;
      }
      if (sourceCell?.f) {
        cell.classList.add("ofv-cell-formula");
        cell.title = `=${sourceCell.f}`;
      }
      row.append(cell);
    }
    table.append(row);
  }

  return table;
}

function createParsedSheetTable(sheet: ParsedSheet, sheetIndex: number, viewport: SheetViewport): HTMLTableElement {
  const table = document.createElement("table");
  table.id = `ofv-sheet-${sheetIndex + 1}`;
  const formulaMap = new Map(sheet.formulas.map((item) => [item.address, item.formula]));
  const rowEnd = Math.min(viewport.rowStart + SHEET_WINDOW_ROWS, sheet.rows.length);
  for (let rowIndex = viewport.rowStart; rowIndex < rowEnd; rowIndex += 1) {
    const sourceRow = sheet.rows[rowIndex] || [];
    const row = document.createElement("tr");
    const columnEnd = Math.min(viewport.columnStart + SHEET_WINDOW_COLUMNS, viewport.columnCount);
    for (let columnIndex = viewport.columnStart; columnIndex < columnEnd; columnIndex += 1) {
      const value = sourceRow[columnIndex] || "";
      const cell = document.createElement(rowIndex === 0 ? "th" : "td");
      const address = encodeA1(rowIndex, columnIndex);
      cell.dataset.cell = address;
      cell.textContent = value;
      if (value) {
        cell.title = value;
      }
      const formula = formulaMap.get(address);
      if (formula) {
        cell.classList.add("ofv-cell-formula");
        cell.title = formula;
      }
      row.append(cell);
    }
    table.append(row);
  }
  return table;
}

function parseFlatOds(xml: string): ParsedSheet[] {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    return [];
  }

  return Array.from(documentXml.getElementsByTagName("*"))
    .filter((element) => element.localName === "table")
    .map((tableElement, tableIndex) => parseFlatOdsTable(tableElement, tableIndex))
    .filter((sheet) => sheet.rows.length > 0);
}

function parseFlatOdsTable(tableElement: Element, tableIndex: number): ParsedSheet {
  const rows: string[][] = [];
  const formulas: Array<{ address: string; formula: string }> = [];
  const sheetName = getXmlAttribute(tableElement, "name") || `Sheet ${tableIndex + 1}`;
  for (const rowElement of Array.from(tableElement.children).filter((element) => element.localName === "table-row")) {
    const repeatRows = clampRepeat(getXmlAttribute(rowElement, "number-rows-repeated"), 200);
    const parsedRow = parseFlatOdsRow(rowElement, rows.length, formulas);
    for (let index = 0; index < repeatRows; index += 1) {
      rows.push([...parsedRow]);
    }
  }
  trimEmptyTrailingRows(rows);
  return { name: sheetName, rows, formulas };
}

function parseFlatOdsRow(
  rowElement: Element,
  rowIndex: number,
  formulas: Array<{ address: string; formula: string }>
): string[] {
  const row: string[] = [];
  for (const cellElement of Array.from(rowElement.children).filter(
    (element) => element.localName === "table-cell" || element.localName === "covered-table-cell"
  )) {
    const repeatColumns = clampRepeat(getXmlAttribute(cellElement, "number-columns-repeated"), 256);
    const value = extractFlatOdsCellValue(cellElement);
    const formula = getXmlAttribute(cellElement, "formula");
    for (let index = 0; index < repeatColumns; index += 1) {
      const columnIndex = row.length;
      row.push(value);
      if (formula) {
        formulas.push({ address: encodeA1(rowIndex, columnIndex), formula });
      }
    }
  }
  trimEmptyTrailingCells(row);
  return row;
}

function extractFlatOdsCellValue(cellElement: Element): string {
  const text = extractOpenDocumentTextFromElement(cellElement);
  if (text) {
    return text;
  }
  return (
    getXmlAttribute(cellElement, "value") ||
    getXmlAttribute(cellElement, "date-value") ||
    getXmlAttribute(cellElement, "time-value") ||
    getXmlAttribute(cellElement, "boolean-value") ||
    ""
  );
}

function extractOpenDocumentTextFromElement(element: Element): string {
  const fragments: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      fragments.push(node.textContent || "");
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node.localName === "s") {
      fragments.push(" ".repeat(clampRepeat(getXmlAttribute(node, "c"), 64)));
      return;
    }
    if (node.localName === "tab") {
      fragments.push("\t");
      return;
    }
    if (node.localName === "line-break") {
      fragments.push("\n");
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
    if (node.localName === "p" || node.localName === "h") {
      fragments.push("\n");
    }
  };
  visit(element);
  return fragments.join("").replace(/\n+$/g, "").trim();
}

function getXmlAttribute(element: Element, localName: string): string | null {
  const direct = element.getAttribute(localName);
  if (direct !== null) {
    return direct;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) {
      return attribute.value;
    }
  }
  return null;
}

function clampRepeat(value: string | null, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, max);
}

function trimEmptyTrailingRows(rows: string[][]): void {
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === "")) {
    rows.pop();
  }
}

function trimEmptyTrailingCells(row: string[]): void {
  while (row.length > 0 && row[row.length - 1] === "") {
    row.pop();
  }
}

function collectFormulaRows(
  sheet: Record<string, any>,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
  encodeCell: (cell: { r: number; c: number }) => string
): Array<{ address: string; formula: string }> {
  const formulas: Array<{ address: string; formula: string }> = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = encodeCell({ r: row, c: column });
      const cell = sheet[address];
      if (cell?.f) {
        formulas.push({ address, formula: `=${cell.f}` });
      }
    }
  }
  return formulas;
}

function encodeA1(rowIndex: number, columnIndex: number): string {
  let column = "";
  let value = columnIndex + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }
  return `${column}${rowIndex + 1}`;
}

async function renderPptx(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const container = document.createElement("div");
  container.className = "ofv-pptx-viewer";

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    await renderPresentationInsight(panel, await inspectPptxPresentation(zip));
  } catch (error) {
    console.warn("PPTX structure insight extraction failed:", error);
  }

  panel.append(container);
  try {
    const { PptxViewer } = await import("@aiden0z/pptx-renderer");
    await PptxViewer.open(arrayBuffer, container);
  } catch {
    container.textContent = "PPTX 渲染失败，请检查文件是否损坏。";
  }
}

async function renderOdp(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const content = zip.file("content.xml");
  if (!content) {
    panel.textContent = "未解析到 ODP 内容。";
    return;
  }
  const xml = await content.async("text");
  const images = await extractZipImages(zip, /^Pictures\//);
  renderPresentationInsight(panel, inspectOpenDocumentPresentation(titleFromOdf(xml, "ODP 演示文稿"), xml, images.length));
  renderOpenDocumentPresentation(panel, "ODP 演示文稿", xml, images);
}

function renderOpenDocumentPresentationXml(panel: HTMLElement, xml: string): void {
  renderPresentationInsight(panel, inspectOpenDocumentPresentation("FODP 演示文稿", xml, 0));
  renderOpenDocumentPresentation(panel, "FODP 演示文稿", xml, []);
}

async function renderPackagedOfficePreview(
  panel: HTMLElement,
  arrayBuffer: ArrayBuffer,
  extension: string
): Promise<boolean> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    return false;
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const hasEntry = (path: string) => entries.some((entry) => entry.name.toLowerCase() === path.toLowerCase());
  const contentXml = zip.file(/(^|\/)content\.xml$/i)[0];

  if (hasEntry("word/document.xml")) {
    renderOfficePackageNotice(panel, extension, "检测到 OOXML Word 包结构，已按 DOCX 兼容路径预览。");
    await renderDocx(panel, arrayBuffer);
    return true;
  }

  if (hasEntry("xl/workbook.xml")) {
    renderOfficePackageNotice(panel, extension, "检测到 OOXML Workbook 包结构，已按 XLSX 兼容路径预览。");
    await renderSheet(panel, arrayBuffer, extension);
    return true;
  }

  if (hasEntry("ppt/presentation.xml")) {
    renderOfficePackageNotice(panel, extension, "检测到 OOXML Presentation 包结构，已按 PPTX 兼容路径预览。");
    await renderPptx(panel, arrayBuffer);
    return true;
  }

  if (contentXml) {
    const xml = await contentXml.async("text");
    if (/<office:spreadsheet\b|<table:table\b/i.test(xml)) {
      renderOfficePackageNotice(panel, extension, "检测到 OpenDocument Spreadsheet 包结构，已按 ODS 兼容路径预览。");
      renderParsedSheets(panel, parseFlatOds(xml), `${extension.toUpperCase()} 文件未解析到表格。`);
      return true;
    }
    if (/<office:presentation\b|<draw:page\b/i.test(xml)) {
      renderOfficePackageNotice(panel, extension, "检测到 OpenDocument Presentation 包结构，已按 ODP 兼容路径预览。");
      renderOpenDocumentPresentation(panel, `${extension.toUpperCase()} 演示文稿`, xml, await extractZipImages(zip, /^Pictures\//));
      return true;
    }
    if (/<office:text\b|<text:p\b/i.test(xml)) {
      renderOfficePackageNotice(panel, extension, "检测到 OpenDocument Text 包结构，已按 ODT 兼容路径预览。");
      renderOpenDocumentXml(panel, `${extension.toUpperCase()} 文档`, xml);
      return true;
    }
  }

  if (entries.some((entry) => /^index\//i.test(entry.name) || /\.iwa$/i.test(entry.name))) {
    renderOfficePackageStructure(
      panel,
      extension,
      entries.map((entry) => entry.name),
      "检测到 Apple iWork 包结构。当前解析包内 plist 元数据并展示 IWA/资源结构；正文 IWA 数据可后续接入专用解析器增强。",
      await extractIWorkMetadata(entries)
    );
    return true;
  }

  if (entries.length > 0) {
    renderOfficePackageStructure(
      panel,
      extension,
      entries.map((entry) => entry.name),
      "检测到 ZIP 包结构，但未发现标准 OOXML/ODF 入口。可后续接入对应厂商格式解析器或服务端转换。"
    );
    return true;
  }

  return false;
}

function renderOfficePackageNotice(panel: HTMLElement, extension: string, message: string): void {
  const section = createSection("兼容包识别");
  const note = document.createElement("p");
  note.className = "ofv-office-package-note";
  note.textContent = `.${extension} ${message}`;
  section.append(note);
  panel.append(section);
}

function renderOfficePackageStructure(
  panel: HTMLElement,
  extension: string,
  entries: string[],
  message: string,
  metadata?: IWorkMetadata
): void {
  const section = createSection("Office 包结构预览");
  const note = document.createElement("p");
  note.className = "ofv-office-package-note";
  note.textContent = `.${extension} ${message}`;

  if (metadata && Object.keys(metadata).length > 0) {
    section.append(createIWorkMetadataSummary(metadata));
  }

  const list = document.createElement("ul");
  list.className = "ofv-office-package-list";
  for (const name of entries.slice(0, 120)) {
    const item = document.createElement("li");
    item.textContent = name;
    list.append(item);
  }
  if (entries.length > 120) {
    const item = document.createElement("li");
    item.textContent = `还有 ${entries.length - 120} 个文件未展示。`;
    list.append(item);
  }

  section.append(note, list);
  panel.append(section);
}

async function extractIWorkMetadata(entries: JSZip.JSZipObject[]): Promise<IWorkMetadata> {
  const metadataEntries = entries.filter((entry) => /^metadata\/.*\.plist$/i.test(entry.name) || /properties\.plist$/i.test(entry.name));
  const metadata: IWorkMetadata = {};
  for (const entry of metadataEntries.slice(0, 6)) {
    const text = await entry.async("text").catch(() => "");
    if (!text || !/<plist[\s>]/i.test(text)) {
      continue;
    }
    const plist = parsePlistDict(text);
    mergeIWorkMetadata(metadata, plist);
  }
  return metadata;
}

function createIWorkMetadataSummary(metadata: IWorkMetadata): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-iwork-meta";
  const title = document.createElement("strong");
  title.textContent = "iWork 元数据";
  const grid = document.createElement("div");
  grid.className = "ofv-iwork-meta-grid";
  appendIWorkMeta(grid, "标题", metadata.title);
  appendIWorkMeta(grid, "作者", metadata.author);
  appendIWorkMeta(grid, "公司", metadata.company);
  appendIWorkMeta(grid, "主题", metadata.subject);
  appendIWorkMeta(grid, "关键词", metadata.keywords?.join(", "));
  appendIWorkMeta(grid, "创建时间", metadata.created);
  appendIWorkMeta(grid, "修改时间", metadata.modified);
  wrapper.append(title, grid);
  return wrapper;
}

function appendIWorkMeta(parent: HTMLElement, label: string, value?: string): void {
  if (!value) {
    return;
  }
  const row = document.createElement("div");
  row.className = "ofv-meta-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  row.append(key, content);
  parent.append(row);
}

function mergeIWorkMetadata(metadata: IWorkMetadata, plist: Record<string, unknown>): void {
  metadata.title ||= plistText(plist, ["Title", "title", "DocumentTitle", "SFDocumentTitle", "kMDItemTitle"]);
  metadata.author ||= plistText(plist, ["Author", "author", "Authors", "kMDItemAuthors", "creator"]);
  metadata.company ||= plistText(plist, ["Company", "company", "Organization"]);
  metadata.subject ||= plistText(plist, ["Subject", "subject", "Description", "comment"]);
  metadata.created ||= plistText(plist, ["CreationDate", "created", "kMDItemFSCreationDate"]);
  metadata.modified ||= plistText(plist, ["ModificationDate", "modified", "kMDItemFSContentChangeDate"]);
  metadata.keywords ||= plistArray(plist, ["Keywords", "keywords", "kMDItemKeywords"]);
}

function parsePlistDict(xml: string): Record<string, unknown> {
  if (typeof DOMParser === "undefined") {
    return {};
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return {};
  }
  const dict = Array.from(doc.documentElement.children).find((child) => child.tagName === "dict");
  const value = dict ? parsePlistValue(dict) : undefined;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parsePlistValue(element: Element): unknown {
  switch (element.tagName) {
    case "dict": {
      const result: Record<string, unknown> = {};
      const children = Array.from(element.children);
      for (let index = 0; index < children.length; index++) {
        const key = children[index];
        if (key.tagName !== "key") {
          continue;
        }
        const value = children[index + 1];
        if (value) {
          result[key.textContent || ""] = parsePlistValue(value);
          index++;
        }
      }
      return result;
    }
    case "array":
      return Array.from(element.children).map(parsePlistValue);
    case "true":
      return true;
    case "false":
      return false;
    case "integer":
    case "real":
      return Number(element.textContent || 0);
    case "string":
    case "date":
    default:
      return element.textContent?.trim() || "";
  }
}

function plistText(plist: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = plist[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const text = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join(", ");
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}

function plistArray(plist: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = plist[key];
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
      if (items.length > 0) {
        return items;
      }
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return undefined;
}

function renderOpenDocumentPresentation(
  panel: HTMLElement,
  title: string,
  xml: string,
  images: Array<{ name: string; src: string }>
): void {
  const pages = xml.split(/<draw:page\b/).slice(1);
  const pageSources = pages.length > 0 ? pages : [xml];
  for (const [index, pageXml] of pageSources.entries()) {
    const section = createSection(`${title} ${index + 1}`);
    const body = document.createElement("div");
    body.className = "ofv-slide";
    const texts = extractOpenDocumentBlocks(pageXml);
    if (texts.length > 0) {
      for (const text of texts) {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        body.append(paragraph);
      }
    } else {
      const empty = document.createElement("p");
      empty.textContent = "这一页没有可提取文本。";
      body.append(empty);
    }
    for (const image of images.slice(index === 0 ? 0 : images.length, index === 0 ? images.length : images.length)) {
      const figure = document.createElement("figure");
      figure.className = "ofv-slide-image";
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = image.name;
      const caption = document.createElement("figcaption");
      caption.textContent = image.name;
      figure.append(img, caption);
      body.append(figure);
    }
    section.append(body);
    panel.append(section);
  }
}

async function inspectPptxPresentation(zip: JSZip): Promise<PresentationInsight> {
  const slideEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumberFromPath(a.name) - slideNumberFromPath(b.name));

  const slides: PresentationSlideInsight[] = [];
  let imageCount = 0;
  let notesCount = 0;
  let transitionCount = 0;
  let animationCount = 0;
  const layouts = new Set<string>();

  for (const entry of slideEntries) {
    const xml = await entry.async("text");
    const texts = extractOpenXmlText(xml);
    const rels = await readPptxRelationships(zip, entry.name);
    const layout = await resolvePptxSlideLayout(zip, entry.name, rels);
    if (layout) {
      layouts.add(layout);
    }

    const slideImageCount = countPptxSlideImages(xml, rels);
    const notesPath = resolvePptxRelationshipTarget(entry.name, rels.find((rel) => /\/notesSlide$/i.test(rel.type))?.target);
    const notesXml = notesPath ? await zip.file(notesPath)?.async("text") : undefined;
    const slideNotesCount = notesXml ? extractOpenXmlText(notesXml).length : 0;
    const hasTransition = /<p:transition\b/i.test(xml);
    const slideAnimationCount = countMatches(xml, /<p:(?:anim|animEffect|animMotion|animRot|animScale|cmd|set)\b/gi);

    imageCount += slideImageCount;
    notesCount += slideNotesCount;
    transitionCount += hasTransition ? 1 : 0;
    animationCount += slideAnimationCount;
    slides.push({
      title: texts[0] || `Slide ${slides.length + 1}`,
      layout,
      textCount: texts.length,
      imageCount: slideImageCount,
      notesCount: slideNotesCount,
      hasTransition,
      animationCount: slideAnimationCount,
      sampleTexts: texts.slice(0, 4)
    });
  }

  return {
    title: "PPTX 演示文稿结构",
    slideCount: slides.length,
    imageCount,
    notesCount,
    transitionCount,
    animationCount,
    layouts: Array.from(layouts),
    slides
  };
}

function inspectOpenDocumentPresentation(title: string, xml: string, totalImages: number): PresentationInsight {
  const pages = xml.split(/<draw:page\b/).slice(1);
  const pageSources = pages.length > 0 ? pages : [xml];
  const slides = pageSources.map((pageXml, index) => {
    const texts = extractOpenDocumentBlocks(pageXml);
    const layout =
      matchXmlAttribute(pageXml, /presentation:class="([^"]+)"/i) ||
      matchXmlAttribute(pageXml, /draw:style-name="([^"]+)"/i) ||
      undefined;
    const imageCount = countMatches(pageXml, /<draw:image\b/gi);
    const hasTransition = /presentation:transition-type=|presentation:transition-style=|smil:type=/i.test(pageXml);
    const animationCount = countMatches(pageXml, /<anim:|<presentation:animations\b|<presentation:show-shape\b/gi);
    return {
      title: texts[0] || `Slide ${index + 1}`,
      layout,
      textCount: texts.length,
      imageCount,
      notesCount: countMatches(pageXml, /<presentation:notes\b/gi),
      hasTransition,
      animationCount,
      sampleTexts: texts.slice(0, 4)
    };
  });

  const layouts = new Set(slides.map((slide) => slide.layout).filter(Boolean) as string[]);
  return {
    title,
    slideCount: slides.length,
    imageCount: Math.max(totalImages, slides.reduce((sum, slide) => sum + slide.imageCount, 0)),
    notesCount: slides.reduce((sum, slide) => sum + slide.notesCount, 0),
    transitionCount: slides.filter((slide) => slide.hasTransition).length,
    animationCount: slides.reduce((sum, slide) => sum + slide.animationCount, 0),
    layouts: Array.from(layouts),
    slides
  };
}

async function renderPresentationInsight(panel: HTMLElement, insight: PresentationInsight): Promise<void> {
  const summary = document.createElement("div");
  summary.className = "ofv-presentation-summary";
  summary.hidden = true;
  summary.setAttribute("aria-hidden", "true");
  summary.dataset.slideCount = String(insight.slideCount);
  summary.dataset.imageCount = String(insight.imageCount);
  summary.dataset.notesCount = String(insight.notesCount);
  summary.dataset.transitionCount = String(insight.transitionCount);
  summary.dataset.animationCount = String(insight.animationCount);
  const stats = [
    `${insight.slideCount} 页`,
    `${insight.layouts.length || 0} 种布局`,
    `${insight.imageCount} 张图片`,
    `${insight.notesCount} 条备注`,
    `${insight.transitionCount} 页切换`,
    `${insight.animationCount} 个动画标记`
  ];
  summary.append(createPresentationMetric(insight.title, stats.join(" · ")));

  if (insight.layouts.length > 0) {
    summary.append(createPresentationMetric("布局", insight.layouts.join("、")));
  }
  panel.append(summary);
}

function createPresentationMetric(label: string, value: string): HTMLElement {
  const metric = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = value;
  metric.append(strong, span);
  return metric;
}

type PptxRelationship = {
  id: string;
  type: string;
  target: string;
};

async function readPptxRelationships(zip: JSZip, partPath: string): Promise<PptxRelationship[]> {
  const relsPath = relationshipPathForPart(partPath);
  const xml = await zip.file(relsPath)?.async("text");
  if (!xml) {
    return [];
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return [];
  }
  return Array.from(doc.getElementsByTagNameNS(PPTX_REL_NS, "Relationship")).map((element) => ({
    id: element.getAttribute("Id") || "",
    type: element.getAttribute("Type") || "",
    target: element.getAttribute("Target") || ""
  }));
}

async function resolvePptxSlideLayout(zip: JSZip, slidePath: string, rels: PptxRelationship[]): Promise<string | undefined> {
  const layoutRel = rels.find((rel) => /\/slideLayout$/i.test(rel.type));
  const layoutPath = resolvePptxRelationshipTarget(slidePath, layoutRel?.target);
  const xml = layoutPath ? await zip.file(layoutPath)?.async("text") : undefined;
  if (!xml) {
    return layoutPath?.split("/").pop()?.replace(/\.xml$/i, "");
  }
  return matchXmlAttribute(xml, /<p:cSld\b[^>]*name="([^"]+)"/i) || layoutPath?.split("/").pop()?.replace(/\.xml$/i, "");
}

function countPptxSlideImages(xml: string, rels: PptxRelationship[]): number {
  const relImageIds = new Set(rels.filter((rel) => /\/image$/i.test(rel.type)).map((rel) => rel.id));
  const embeddedIds = [...xml.matchAll(/<a:blip\b[^>]*(?:r:embed|r:link)="([^"]+)"/gi)].map((match) => match[1]);
  if (embeddedIds.length > 0) {
    return embeddedIds.filter((id) => relImageIds.size === 0 || relImageIds.has(id)).length;
  }
  return relImageIds.size;
}

function relationshipPathForPart(partPath: string): string {
  const parts = partPath.split("/");
  const fileName = parts.pop() || partPath;
  return `${parts.join("/")}/_rels/${fileName}.rels`;
}

function resolvePptxRelationshipTarget(sourcePath: string, target?: string): string | undefined {
  if (!target || /^[a-z]+:/i.test(target)) {
    return undefined;
  }
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const base = sourcePath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      base.pop();
    } else {
      base.push(segment);
    }
  }
  return base.join("/");
}

function slideNumberFromPath(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/i)?.[1] || "0");
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function matchXmlAttribute(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);
  return match ? decodeXml(match[1] || "") : null;
}

function titleFromOdf(xml: string, fallback: string): string {
  return matchXmlAttribute(xml, /<office:meta[\s\S]*?<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || fallback;
}

function isLegacyOfficeBinary(extension: string): boolean {
  return ["doc", "dot", "xls", "xlt", "ppt", "pps"].includes(extension);
}

function legacyOfficeFormatLabel(extension: string): string {
  if (extension === "doc" || extension === "dot") {
    return "Word Binary File Format";
  }
  if (extension === "xls" || extension === "xlt") {
    return "Excel Binary File Format";
  }
  return "PowerPoint Binary File Format";
}

function renderLegacyOfficeBinary(panel: HTMLElement, extension: string, arrayBuffer: ArrayBuffer, parseError?: string): void {
  const fragments = extractLegacyOfficeText(arrayBuffer);
  panel.replaceChildren();
  const section = createSection("Office 转换提示");
  section.classList.add("ofv-office-conversion");
  const format = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `.${extension}`;
  format.append(
    strong,
    document.createTextNode(
      " 属于旧版 Microsoft Office 二进制格式，浏览器内无法高保真解析；当前仅展示可信文本片段和结构指纹，完整排版建议接入 LibreOffice/OnlyOffice 服务端转换为 PDF/HTML。"
    )
  );

  const meta = document.createElement("dl");
  meta.className = "ofv-office-binary-meta";
  appendOfficeBinaryMeta(meta, "格式类型", legacyOfficeFormatLabel(extension));
  appendOfficeBinaryMeta(meta, "文件结构", hasOleSignature(arrayBuffer) ? "检测到 OLE Compound File 签名" : "未检测到标准 OLE 签名，按原始二进制尝试提取");
  appendOfficeBinaryMeta(meta, "文本片段", `${fragments.length} 段`);
  if (parseError) {
    appendOfficeBinaryMeta(meta, "解析状态", parseError);
  }

  section.append(format, meta);

  if (fragments.length > 0) {
    const article = document.createElement("article");
    article.className = "ofv-document ofv-office-binary-fragments";
    const heading = document.createElement("h4");
    heading.textContent = "可读文本片段";
    article.append(heading);
    for (const fragment of fragments.slice(0, 80)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = fragment;
      article.append(paragraph);
    }
    section.append(article);
  } else {
    const empty = document.createElement("p");
    empty.className = "ofv-office-binary-empty";
    empty.textContent = "未提取到稳定可读文本。该文件可能经过压缩、加密，或文本编码无法在浏览器端可靠识别；请使用服务端 LibreOffice/OnlyOffice 转换后预览。";
    section.append(empty);
  }

  panel.append(section);
}

function appendOfficeBinaryMeta(list: HTMLDListElement, label: string, value: string): void {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function renderUnsupportedOffice(panel: HTMLElement, extension: string): void {
  const legacyBinary = new Set(["doc", "dot", "wps", "ppt", "pps", "key", "dps"]);
  const message = legacyBinary.has(extension)
    ? "该格式属于老二进制或专有格式，浏览器内无法可靠解析；建议接入 LibreOffice/OnlyOffice 服务端转换为 PDF/HTML 后预览。"
    : "该格式通常需要服务端转换或专用解析器才能高保真预览。";
  panel.replaceChildren();
  const section = createSection("Office 基础预览");
  const format = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `.${extension}`;
  format.append(strong, document.createTextNode(` 已进入 Office 插件。${message}`));

  const support = document.createElement("p");
  support.textContent = "当前版本优先支持 docx、rtf、odt/fodt、xlsx/xls/csv/ods、pptx/ppsx、odp/fodp 的基础内容预览。";

  section.append(format, support);
  panel.append(section);
}

function normalizeOfficeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message ? `解析器返回：${message}` : "解析器未返回具体错误信息。";
}

function extractLegacyOfficeText(arrayBuffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(arrayBuffer);
  const fragments = [
    ...extractPrintableRuns(bytes).map((text) => ({ text, source: "ascii" as const })),
    ...extractUtf16Runs(bytes).map((text) => ({ text, source: "utf16" as const }))
  ]
    .map(({ text, source }) => ({ text: normalizeLegacyText(text), source }))
    .filter(({ text, source }) => isReadableLegacyTextFragment(text, source));
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const { text: fragment } of fragments) {
    const key = fragment.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(fragment);
    }
  }
  return unique.slice(0, 160);
}

function isReadableLegacyTextFragment(fragment: string, source: LegacyOfficeTextSource): boolean {
  if (fragment.length > 600) {
    return false;
  }
  if (isLegacyOfficeMetadataNoise(fragment)) {
    return false;
  }
  if (!/[\p{L}\p{N}]/u.test(fragment)) {
    return false;
  }
  const chars = Array.from(fragment);
  const letters = chars.filter((char) => /\p{L}/u.test(char)).length;
  const digits = chars.filter((char) => /\p{N}/u.test(char)).length;
  const spaces = chars.filter((char) => /\s/u.test(char)).length;
  const asciiLetters = chars.filter((char) => /[A-Za-z]/.test(char)).length;
  const cjkLetters = chars.filter((char) => /[\u3400-\u9fff]/u.test(char)).length;
  const punctuation = chars.filter((char) => /[^\p{L}\p{N}\s]/u.test(char)).length;
  const alphaNumeric = letters + digits;
  const readableRatio = alphaNumeric / chars.length;
  const punctuationRatio = punctuation / chars.length;

  if (fragment.length < 4 || readableRatio < 0.55 || punctuationRatio > 0.24) {
    return false;
  }
  if (/([\p{L}\p{N}])\1{4,}/u.test(fragment)) {
    return false;
  }
  if (cjkLetters >= 2) {
    const suspiciousCjk = chars.filter((char) => isAsciiBytePairCjk(char)).length;
    if (suspiciousCjk / cjkLetters > 0.65) {
      return false;
    }
    if (isLikelyCjkHeading(fragment)) {
      return true;
    }
    if (punctuation > 0 && fragment.length < 12) {
      return false;
    }
    return cjkLetters >= 8 || (cjkLetters >= 4 && spaces > 0);
  }
  if (asciiLetters >= 4) {
    if (punctuation > 0 && spaces === 0) {
      return false;
    }
    if (source === "ascii" && /^[A-Z]{2,8}$/.test(fragment)) {
      return false;
    }
    if (spaces > 0) {
      return letters >= 3;
    }
    return fragment.length >= 6;
  }
  if (spaces > 0 && letters >= 3) {
    return true;
  }
  return false;
}

function isLegacyOfficeMetadataNoise(fragment: string): boolean {
  if (/[$�\uFFFD]/u.test(fragment)) {
    return true;
  }
  if (/^(?:Root Entry|WordDocument|Workbook|Book|SummaryInformation|DocumentSummaryInformation|CompObj|ObjectPool|Data|PowerPoint Document|Pictures)$/i.test(fragment)) {
    return true;
  }
  if (/\.(dotm?|docm?|pptx?|ppsx?|xlsm?|xlsx?)\b/i.test(fragment)) {
    return true;
  }
  if (/^(?:默认段落字体|普通表格|正文|标题|副标题|目录|页眉|页脚|批注|超链接)(?:\s*\d+)?$/.test(fragment)) {
    return true;
  }
  if (/\b(?:Normal|Default|Calibri|Times New Roman|WPS Office|Microsoft Office|KSOP?ProductBuildVer)\b/i.test(fragment)) {
    return true;
  }
  if (/^\d+(?:Table|List|Heading|Title|Style)$/i.test(fragment)) {
    return true;
  }
  if (/[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[})]?/i.test(fragment)) {
    return true;
  }
  if (/^[A-Z_]{3,}$/.test(fragment) || /^[A-Za-z]+(?:Information|Document|Storage|Stream|Table|Data|Pool|Obj|Props)$/i.test(fragment)) {
    return true;
  }
  return false;
}

function isLikelyCjkHeading(fragment: string): boolean {
  return /^(?:标题|第[一二三四五六七八九十\d]+[章节条]|[一二三四五六七八九十\d]+[、.．])\s*[\p{L}\p{N}\s-]*$/u.test(fragment);
}

function isAsciiBytePairCjk(char: string): boolean {
  const code = char.codePointAt(0) || 0;
  if (code < 0x3400 || code > 0x9fff) {
    return false;
  }
  const low = code & 0xff;
  const high = code >> 8;
  return isPrintableAsciiByte(low) && isPrintableAsciiByte(high);
}

function isPrintableAsciiByte(value: number): boolean {
  return value >= 0x20 && value <= 0x7e;
}

function extractPrintableRuns(bytes: Uint8Array): string[] {
  const fragments: string[] = [];
  let current = "";
  for (const byte of bytes) {
    if ((byte >= 32 && byte <= 126) || byte === 9) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 4) {
        fragments.push(current);
      }
      current = "";
    }
  }
  if (current.length >= 4) {
    fragments.push(current);
  }
  return fragments;
}

function extractUtf16Runs(bytes: Uint8Array): string[] {
  const fragments: string[] = [];
  let current = "";
  for (let index = 0; index < bytes.length - 1; index += 2) {
    if (looksLikeMisalignedAsciiUtf16(bytes[index], bytes[index + 1])) {
      if (current.length >= 3) {
        fragments.push(current);
      }
      current = "";
      continue;
    }
    const code = bytes[index] | (bytes[index + 1] << 8);
    if ((code >= 32 && code <= 0xd7ff) || code === 9) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= 3) {
        fragments.push(current);
      }
      current = "";
    }
  }
  if (current.length >= 3) {
    fragments.push(current);
  }
  return fragments;
}

function looksLikeMisalignedAsciiUtf16(lowByte: number, highByte: number): boolean {
  return lowByte === 0 && ((highByte >= 48 && highByte <= 57) || (highByte >= 65 && highByte <= 90) || (highByte >= 97 && highByte <= 122));
}

function normalizeLegacyText(value: string): string {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasOleSignature(arrayBuffer: ArrayBuffer): boolean {
  const signature = Array.from(new Uint8Array(arrayBuffer.slice(0, 8)));
  return signature.join(",") === "208,207,17,224,161,177,26,225";
}

async function extractZipImages(
  zip: JSZip,
  pattern: RegExp
): Promise<Array<{ name: string; src: string }>> {
  const images: Array<{ name: string; src: string }> = [];
  for (const entry of Object.values(zip.files).filter((item) => !item.dir && pattern.test(item.name))) {
    const mimeType = mimeTypeFromPath(entry.name);
    if (!mimeType.startsWith("image/")) {
      continue;
    }
    images.push({
      name: entry.name.split("/").pop() || entry.name,
      src: `data:${mimeType};base64,${await entry.async("base64")}`
    });
  }
  return images;
}

function extractOpenXmlText(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] || match[2] || "").trim())
    .filter(Boolean);
}

function extractWordParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => extractOpenXmlText(match[0]).join(""))
    .map((text) => text.trim())
    .filter(Boolean);
}

function extractOpenDocumentBlocks(xml: string): string[] {
  return [...xml.matchAll(/<(?:text:p|text:h)[^>]*>([\s\S]*?)<\/(?:text:p|text:h)>/g)]
    .map((match) => stripXmlTags(match[1] || ""))
    .map((text) => decodeXml(text).trim())
    .filter(Boolean);
}

function stripXmlTags(value: string): string {
  return value
    .replace(/<text:line-break\s*\/>/g, "\n")
    .replace(/<text:tab\s*\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readTextFromBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return decodeTextBuffer(arrayBuffer);
}


function mimeTypeFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  return extension ? map[extension] || "application/octet-stream" : "application/octet-stream";
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"]
  });
}
