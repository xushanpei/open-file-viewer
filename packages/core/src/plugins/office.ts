import JSZip from "jszip";
import DOMPurify from "dompurify";
import type { WorkBook } from "xlsx";
import type { PreviewCommand, PreviewContext, PreviewInstance, PreviewPlugin } from "../types";
import { createPanel, createSection, decodeTextBuffer, getInitialZoom, readArrayBuffer, resolveFormat } from "./utils";
import { renderPdfDocumentPreview, type PdfPluginOptions } from "./pdf";

const wordExtensions = new Set(["docx", "docm", "doc", "dotx", "dotm", "dot", "rtf", "odt", "fodt", "wps"]);
const sheetExtensions = new Set(["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "csv", "tsv", "ods", "fods", "numbers", "et"]);
const presentationExtensions = new Set(["pptx", "pptm", "ppt", "pps", "ppsx", "ppsm", "potx", "potm", "odp", "fodp", "key", "dps"]);
const packagedOfficeCandidates = new Set(["wps", "et", "dps", "numbers", "key"]);
const SHEET_WINDOW_ROWS = 200;
const SHEET_WINDOW_COLUMNS = 80;
const DEFAULT_PPTX_RENDER_TIMEOUT_MS = 12000;
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

export interface OfficeConversionContext {
  file: PreviewContext["file"];
  arrayBuffer: ArrayBuffer;
  extension: string;
  detectedFormat?: "docx" | "xlsx" | "pptx";
  reason: "complex-docx" | "legacy-office" | "manual";
}

export type OfficeConversionResult =
  | Blob
  | ArrayBuffer
  | string
  | {
      blob?: Blob;
      data?: Blob | ArrayBuffer;
      url?: string;
      fileName?: string;
      mimeType?: string;
    };

export interface OfficePluginOptions {
  convert?: (ctx: OfficeConversionContext) => Promise<OfficeConversionResult | null | undefined> | OfficeConversionResult | null | undefined;
  preferConversion?: boolean | ((ctx: OfficeConversionContext) => boolean | Promise<boolean>);
  pdf?: PdfPluginOptions;
}

type NormalizedOfficeConversion = {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType: string;
  revokeUrlOnDestroy: boolean;
};

export function officePlugin(options: OfficePluginOptions = {}): PreviewPlugin {
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
      let delegatedInstance: PreviewInstance | undefined;

      const conversionContext = await createOfficeConversionContext(ctx, arrayBuffer, extension, packageFormat);
      if (conversionContext && (await shouldUseOfficeConversion(options, conversionContext))) {
        delegatedInstance = await renderConvertedOfficePreview(panel, ctx, options, conversionContext);
      } else if (packageFormat === "docx" && !fileIsDocx(extension)) {
        disposeDocxFit = await renderDocx(panel, arrayBuffer);
      } else if (packageFormat === "xlsx" && !sheetExtensions.has(extension)) {
        await renderSheet(panel, arrayBuffer, "xlsx");
      } else if (packageFormat === "pptx" && !["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(extension)) {
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

      const controller = createOfficeZoomController(panel, ctx);
      ctx.toolbar?.refreshCommandSupport();

      return {
        canCommand(command) {
          return delegatedInstance?.canCommand?.(command) || controller?.canCommand(command) || false;
        },
        command(command) {
          return delegatedInstance?.command?.(command) || controller?.command(command) || false;
        },
        destroy() {
          delegatedInstance?.destroy();
          controller?.destroy();
          disposeDocxFit?.();
          panel.remove();
        }
      };
    }
  };
}

async function createOfficeConversionContext(
  ctx: PreviewContext,
  arrayBuffer: ArrayBuffer,
  extension: string,
  detectedFormat?: "docx" | "xlsx" | "pptx"
): Promise<OfficeConversionContext | undefined> {
  const effectiveFormat = detectedFormat || extension;
  if ((effectiveFormat === "docx" || fileIsDocx(extension)) && (await docxShouldPreferTextboxLayoutFallback(arrayBuffer))) {
    return { file: ctx.file, arrayBuffer, extension, detectedFormat, reason: "complex-docx" };
  }
  if (isLegacyOfficeBinary(extension)) {
    return { file: ctx.file, arrayBuffer, extension, detectedFormat, reason: "legacy-office" };
  }
  return undefined;
}

async function shouldUseOfficeConversion(options: OfficePluginOptions, context: OfficeConversionContext): Promise<boolean> {
  if (!options.convert) {
    return false;
  }
  if (typeof options.preferConversion === "function") {
    return Boolean(await options.preferConversion(context));
  }
  if (options.preferConversion !== undefined) {
    return options.preferConversion;
  }
  return context.reason === "complex-docx" || context.reason === "legacy-office";
}

async function renderConvertedOfficePreview(
  panel: HTMLElement,
  ctx: PreviewContext,
  options: OfficePluginOptions,
  conversionContext: OfficeConversionContext
): Promise<PreviewInstance> {
  if (!options.convert) {
    throw new Error("Office conversion handler is not configured.");
  }
  const converted = normalizeOfficeConversionResult(await options.convert(conversionContext), ctx.file.name);
  if (!converted) {
    throw new Error("Office conversion handler did not return a previewable file.");
  }
  if (converted.mimeType !== "application/pdf" && !converted.fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Office conversion handler must return a PDF Blob, ArrayBuffer or URL.");
  }
  return renderPdfDocumentPreview({
    ...(options.pdf || {}),
    fileName: converted.fileName,
    fileUrl: converted.fileUrl,
    fileSize: converted.fileSize,
    isExternal: !converted.revokeUrlOnDestroy,
    viewport: panel,
    size: ctx.size,
    fit: ctx.options.fit,
    zoom: ctx.options.zoom,
    toolbar: ctx.toolbar,
    title: "Office 高保真转换预览",
    fallbackTitle: "Office 转换后的 PDF 无法预览",
    revokeUrlOnDestroy: converted.revokeUrlOnDestroy
  });
}

function normalizeOfficeConversionResult(
  result: OfficeConversionResult | null | undefined,
  sourceFileName: string
): NormalizedOfficeConversion | undefined {
  if (!result) {
    return undefined;
  }
  const fallbackFileName = `${stripFileExtension(sourceFileName) || "office-preview"}.pdf`;
  if (typeof result === "string") {
    return {
      fileName: fallbackFileName,
      fileUrl: result,
      mimeType: "application/pdf",
      revokeUrlOnDestroy: false
    };
  }
  if (result instanceof ArrayBuffer) {
    const blob = new Blob([result], { type: "application/pdf" });
    return createConvertedOfficeBlobPreview(blob, fallbackFileName);
  }
  if (result instanceof Blob) {
    return createConvertedOfficeBlobPreview(result, fallbackFileName);
  }
  if (result.url) {
    return {
      fileName: result.fileName || fallbackFileName,
      fileUrl: result.url,
      mimeType: result.mimeType || "application/pdf",
      revokeUrlOnDestroy: false
    };
  }
  const data = result.blob || result.data;
  if (data instanceof ArrayBuffer) {
    const blob = new Blob([data], { type: result.mimeType || "application/pdf" });
    return createConvertedOfficeBlobPreview(blob, result.fileName || fallbackFileName);
  }
  if (data instanceof Blob) {
    return createConvertedOfficeBlobPreview(data, result.fileName || fallbackFileName);
  }
  return undefined;
}

function createConvertedOfficeBlobPreview(blob: Blob, fileName: string): NormalizedOfficeConversion {
  return {
    fileName,
    fileUrl: URL.createObjectURL(blob),
    fileSize: blob.size,
    mimeType: blob.type || "application/pdf",
    revokeUrlOnDestroy: true
  };
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function createOfficeZoomController(
  panel: HTMLElement,
  ctx: Pick<PreviewContext, "options" | "toolbar">
): {
  canCommand: (command: PreviewCommand) => boolean;
  command: (command: PreviewCommand) => boolean;
  destroy: () => void;
} | undefined {
  const canZoom = Boolean(
    panel.querySelector(".ofv-docx-document, .ofv-sheet, .ofv-pptx-viewer > div, .ofv-document, .ofv-text-block, .ofv-slide")
  );
  if (!canZoom) {
    return undefined;
  }

  let zoom = getInitialZoom(ctx, 0.5, 3);
  const apply = () => {
    panel.style.setProperty("--ofv-office-zoom", String(zoom));
    panel.dispatchEvent(new CustomEvent("ofv-office-zoom"));
    for (const slide of panel.querySelectorAll<HTMLElement>(".ofv-pptx-viewer > div[data-slide-index]")) {
      slide.style.transformOrigin = "top left";
      slide.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
    }
    ctx.toolbar?.setZoom(zoom);
  };
  apply();

  return {
    canCommand(command) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
    },
    command(command) {
      if (command === "zoom-in") {
        zoom = Math.min(3, Number((zoom + 0.12).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-out") {
        zoom = Math.max(0.5, Number((zoom - 0.12).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        zoom = 1;
        apply();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
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
  const content = document.createElement("div");
  content.className = "ofv-docx-document";
  const styleContainer = document.createElement("div");
  styleContainer.className = "ofv-docx-style-container";
  document.head.append(styleContainer);
  let disposeFit: (() => void) | undefined;

  try {
    const docxPreview = await import("docx-preview");
    await docxPreview.renderAsync(arrayBuffer, content, styleContainer, {
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
    await normalizeDocxLayout(content, arrayBuffer);
    const shouldUseTextboxFallback =
      (await docxPreviewLooksBlank(content, arrayBuffer)) ||
      (await docxPreviewMissesRichTextboxContent(content, arrayBuffer)) ||
      (await docxShouldPreferTextboxLayoutFallback(arrayBuffer));
    if (shouldUseTextboxFallback) {
      disposeFit?.();
      styleContainer.remove();
      content.replaceChildren();
      await renderDocxContentFallback(content, arrayBuffer, {
        preferOpenXml: await docxHasRichTextboxContent(arrayBuffer)
      });
      panel.append(content);
      console.warn("DOCX layout preview missed readable textbox content, fell back to text extraction.");
      return () => undefined;
    }
    panel.append(content);
    disposeFit = fitDocxPages(content);
    return () => {
      disposeFit?.();
      styleContainer.remove();
    };
  } catch (error) {
    disposeFit?.();
    styleContainer.remove();
    content.replaceChildren();
    await renderDocxContentFallback(content, arrayBuffer);
    panel.append(content);
    console.warn("DOCX layout preview failed, fell back to Mammoth:", error);
  }
  return () => undefined;
}

async function docxPreviewLooksBlank(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<boolean> {
  if (container.querySelector("img, svg, canvas, table")) {
    return false;
  }
  const renderedText = normalizePreviewText(container.textContent || "");
  if (renderedText.length >= 24) {
    return false;
  }

  try {
    const paragraphs = await extractDocxParagraphs(arrayBuffer);
    const sourceText = normalizePreviewText(paragraphs.join(""));
    return sourceText.length >= 24 && sourceText.length > renderedText.length * 4;
  } catch {
    return false;
  }
}

async function docxPreviewMissesRichTextboxContent(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    if (!(await docxHasRichTextboxContent(arrayBuffer))) {
      return false;
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    if (!documentXml) {
      return false;
    }
    const sourceParagraphs = dedupeParagraphs(extractWordTextboxParagraphs(documentXml))
      .map((paragraph) => normalizePreviewText(paragraph))
      .filter((paragraph) => paragraph.length >= 3);
    if (sourceParagraphs.length < 4) {
      return false;
    }

    const renderedText = normalizePreviewText(container.textContent || "");
    const firstImportantParagraphs = sourceParagraphs.slice(0, Math.min(4, sourceParagraphs.length));
    const firstCoverage = firstImportantParagraphs.filter((paragraph) => renderedText.includes(paragraph)).length / firstImportantParagraphs.length;
    const totalCoverage = sourceParagraphs.filter((paragraph) => renderedText.includes(paragraph)).length / sourceParagraphs.length;
    return firstCoverage < 0.5 || totalCoverage < 0.45;
  } catch {
    return false;
  }
}

async function docxHasRichTextboxContent(arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    if (!documentXml || !/\btxbxContent\b/.test(documentXml)) {
      return false;
    }
    const textboxCount = (documentXml.match(/\btxbxContent\b/g) || []).length;
    const textboxParagraphs = extractWordTextboxParagraphs(documentXml);
    const textboxTextLength = normalizePreviewText(textboxParagraphs.join("")).length;
    const documentTextLength = normalizePreviewText(extractOpenXmlText(documentXml).join("")).length;
    return (
      (textboxCount >= 3 || textboxParagraphs.length >= 3 || textboxTextLength >= 160) &&
      textboxTextLength >= 8 &&
      textboxTextLength >= documentTextLength * 0.4
    );
  } catch {
    return false;
  }
}

async function docxShouldPreferTextboxLayoutFallback(arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    if (!documentXml || !/\btxbxContent\b/.test(documentXml)) {
      return false;
    }
    const blocks = extractDocxTextboxBlocks(documentXml);
    const meaningfulBlocks = blocks.filter((block) => block.paragraphs.length > 0);
    const sidebarBackgrounds = blocks.filter(
      (block) => block.paragraphs.length === 0 && block.fill && block.relativeV === "page" && block.x < 0 && block.width >= 120 && block.height >= 500
    );
    const pageAnchoredTextboxes = meaningfulBlocks.filter((block) => block.relativeV === "page");
    const paragraphAnchoredTextboxes = meaningfulBlocks.filter((block) => block.relativeV !== "page");
    const leftTextboxes = meaningfulBlocks.filter((block) => block.x < 0);
    const rightTextboxes = meaningfulBlocks.filter((block) => block.x >= 80);
    return (
      sidebarBackgrounds.length >= 2 &&
      meaningfulBlocks.length >= 8 &&
      pageAnchoredTextboxes.length >= 4 &&
      paragraphAnchoredTextboxes.length >= 2 &&
      leftTextboxes.length >= 3 &&
      rightTextboxes.length >= 3
    );
  } catch {
    return false;
  }
}

async function renderDocxContentFallback(
  container: HTMLElement,
  arrayBuffer: ArrayBuffer,
  options: { preferOpenXml?: boolean; showNote?: boolean } = {}
): Promise<void> {
  if (options.showNote !== false) {
    const fallbackNote = document.createElement("div");
    fallbackNote.className = "ofv-docx-fallback-note";
    fallbackNote.textContent = "高保真 DOCX 渲染不可用，已切换为基础内容预览。";
    hideSupplementalInfo(fallbackNote);
    container.append(fallbackNote);
  }
  if (options.preferOpenXml) {
    if (await renderDocxTextboxLayoutFallback(container, arrayBuffer)) {
      return;
    }
    await renderDocxTextFallback(container, arrayBuffer);
    return;
  }
  try {
    await renderDocxWithMammoth(container, arrayBuffer);
    const renderedText = normalizePreviewText(container.querySelector(".ofv-document")?.textContent || "");
    if (renderedText.length >= 24) {
      return;
    }
    container.querySelector(".ofv-document")?.remove();
    await renderDocxTextFallback(container, arrayBuffer);
  } catch (fallbackError) {
    await renderDocxTextFallback(container, arrayBuffer);
    console.warn("DOCX content fallback failed, used raw OpenXML text extraction:", fallbackError);
  }
}

type DocxTextboxBlock = {
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
  relativeV: string;
  fill?: string;
  paragraphs: string[];
};

type DocxTextboxColumnLayout = {
  sidebar: Set<number>;
  main: Set<number>;
  sidebarLeft: number;
  mainLeft: number;
  sidebarWidth: number;
  mainWidth: number;
};

async function renderDocxTextboxLayoutFallback(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    if (!documentXml) {
      return false;
    }
    const blocks = extractDocxTextboxBlocks(documentXml);
    const meaningfulBlocks = blocks.filter((block) => block.paragraphs.length > 0);
    if (meaningfulBlocks.length < 4) {
      return false;
    }
    if (renderDocxAnchoredTextboxFallback(container, meaningfulBlocks, blocks)) {
      return true;
    }
    const page = document.createElement("article");
    page.className = "ofv-document ofv-docx-textbox-layout";
    const sidebar = document.createElement("section");
    sidebar.className = "ofv-docx-textbox-sidebar";
    const main = document.createElement("section");
    main.className = "ofv-docx-textbox-main";

    const ordered = [...meaningfulBlocks].sort((a, b) => a.order - b.order);
    const leftThreshold = ordered.some((block) => block.x < 0) ? 0 : Math.min(...ordered.map((block) => block.x)) + 72;
    for (const block of ordered) {
      const card = createDocxTextboxBlockElement(block);
      if (block.x < leftThreshold && block.width < 260) {
        card.classList.add("ofv-docx-textbox-sidebar-block");
        sidebar.append(card);
      } else {
        card.classList.add("ofv-docx-textbox-main-block");
        main.append(card);
      }
    }

    if (sidebar.childElementCount === 0 || main.childElementCount === 0) {
      for (const block of ordered) {
        page.append(createDocxTextboxBlockElement(block));
      }
    } else {
      page.append(sidebar, main);
    }
    container.append(page);
    return true;
  } catch {
    return false;
  }
}

function extractDocxTextboxBlocks(xml: string): DocxTextboxBlock[] {
  const blocks: DocxTextboxBlock[] = [];
  let order = 0;
  for (const match of xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)) {
    const anchor = match[0];
    const textboxMatches = [...anchor.matchAll(/<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g)];
    const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(anchor);
    const offsets = [...anchor.matchAll(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/g)].map((item) => Number(item[1]));
    const fill = /<a:solidFill>[\s\S]*?<a:srgbClr\b[^>]*\bval="([A-Fa-f0-9]+)"/.exec(anchor)?.[1];
    if (textboxMatches.length === 0 && !fill) {
      continue;
    }
    const block: DocxTextboxBlock = {
      order,
      x: emuToPt(offsets[0] || 0),
      y: emuToPt(offsets[1] || 0),
      relativeV: /<wp:positionV\b[^>]*\brelativeFrom="([^"]+)"/.exec(anchor)?.[1] || "",
      width: emuToPt(Number(extent?.[1] || 0)),
      height: emuToPt(Number(extent?.[2] || 0)),
      fill,
      paragraphs:
        textboxMatches.length > 0
          ? dedupeParagraphs(
              textboxMatches
                .flatMap((textbox) => extractWordTextboxParagraphs(textbox[0]))
                .map((text) => text.replace(/\s+/g, " ").trim())
            )
          : []
    };
    if (block.width > 0 && block.height > 0) {
      blocks.push(block);
    }
    order += 1;
  }
  return blocks;
}

function renderDocxAnchoredTextboxFallback(container: HTMLElement, blocks: DocxTextboxBlock[], sourceBlocks = blocks): boolean {
  const pageBlocks = blocks.filter((block) => block.relativeV === "page");
  const paragraphBlocks = blocks.filter((block) => block.relativeV !== "page");
  if (pageBlocks.length < 3 || paragraphBlocks.length < 4) {
    return false;
  }

  const continuationMarkers = findDocxTextboxContinuationMarkers(sourceBlocks);
  const continuationMarkerOrder = continuationMarkers[0]?.order ?? Number.POSITIVE_INFINITY;
  const firstPageBlocks = pageBlocks.filter(
    (block) => block.order < continuationMarkerOrder && !isDocxTextboxLargeBackground(block)
  );
  const firstPageParagraphBlocks = paragraphBlocks.filter(
    (block) => block.order < continuationMarkerOrder && isDocxTextboxFirstPageFlowBlock(block)
  );
  const continuationBlocks = blocks.filter(
    (block) => block.order >= continuationMarkerOrder || (block.relativeV !== "page" && !isDocxTextboxFirstPageFlowBlock(block))
  );
  const continuationGroups = groupDocxTextboxContinuationBlocks(blocks, continuationMarkers, continuationMarkerOrder);
  if (firstPageBlocks.length < 3) {
    return false;
  }

  const page = document.createElement("article");
  page.className = "ofv-document ofv-docx-textbox-page";
  page.style.setProperty("--ofv-docx-textbox-page-width", "595pt");

  const contentLeft = Math.min(...firstPageBlocks.map((block) => block.x));
  const contentRight = Math.max(...firstPageBlocks.map((block) => block.x + Math.max(block.width, 24)));
  const normalizedWidth = Math.max(420, contentRight - contentLeft + 36);
  const pageWidth = Math.max(595, normalizedWidth);
  const normalizeX = (block: DocxTextboxBlock) => block.x - contentLeft + (pageWidth - normalizedWidth) / 2;
  const normalizeY = (block: DocxTextboxBlock) => Math.max(0, block.y + 24);
  const columns = classifyDocxTextboxColumns([...firstPageBlocks, ...firstPageParagraphBlocks, ...continuationBlocks], normalizeX);
  const sidebarBackground = findDocxTextboxSidebarBackground(sourceBlocks);
  if (
    sidebarBackground?.fill &&
    renderDocxFirstPageFlowFallback(page, firstPageBlocks, firstPageParagraphBlocks, columns, sidebarBackground)
  ) {
    container.append(page);
    appendDocxTextboxContinuationPages(
      container,
      continuationGroups.length > 0 ? continuationGroups : [continuationBlocks],
      columns,
      sidebarBackground
    );
    return true;
  }

  if (sidebarBackground?.fill) {
    page.classList.add("ofv-docx-textbox-page-has-sidebar");
    page.style.setProperty("--ofv-docx-textbox-sidebar-bg", `#${sidebarBackground.fill}`);
    page.style.setProperty("--ofv-docx-textbox-sidebar-width", `${formatCssNumber(inferDocxTextboxSidebarBackgroundWidth(columns))}pt`);
  }

  for (const block of firstPageBlocks) {
    const element = createDocxPositionedTextboxBlockElement(block);
    element.classList.add(columns.sidebar.has(block.order) ? "ofv-docx-textbox-page-sidebar-block" : "ofv-docx-textbox-page-main-block");
    if (columns.main.has(block.order)) {
      element.classList.remove("ofv-docx-textbox-page-filled-block");
    }
    element.style.left = `${formatCssNumber(normalizeX(block))}pt`;
    element.style.top = `${formatCssNumber(normalizeY(block))}pt`;
    element.style.width = `${formatCssNumber(Math.max(24, block.width))}pt`;
    if (block.height > 0) {
      element.style.minHeight = `${formatCssNumber(block.height)}pt`;
    }
    page.append(element);
  }

  const sidebarFlowBlocks = firstPageParagraphBlocks.filter((block) => columns.sidebar.has(block.order));
  const mainFlowBlocks = firstPageParagraphBlocks.filter((block) => columns.main.has(block.order));
  const pageAnchorsBottom = Math.max(
    ...firstPageBlocks.map((block) => normalizeY(block) + Math.max(block.height, estimateDocxTextboxBlockHeight(block)))
  );
  const sidebarFlowTop = estimateDocxTextboxColumnFlowStart(firstPageBlocks, columns.sidebar, normalizeY, pageAnchorsBottom);
  const mainFlowTop = estimateDocxTextboxColumnFlowStart(firstPageBlocks, columns.main, normalizeY, pageAnchorsBottom);
  const sidebarFlowBottom = appendDocxTextboxFlowColumn(page, sidebarFlowBlocks, {
    className: "ofv-docx-textbox-page-sidebar-flow",
    leftPt: columns.sidebarLeft,
    topPt: sidebarFlowTop,
    widthPt: columns.sidebarWidth
  });
  const mainFlowBottom = appendDocxTextboxFlowColumn(page, mainFlowBlocks, {
    className: "ofv-docx-textbox-page-main-flow",
    leftPt: columns.mainLeft,
    topPt: mainFlowTop,
    widthPt: columns.mainWidth
  });
  page.style.minHeight = `${formatCssNumber(Math.max(842, pageAnchorsBottom + 36, sidebarFlowBottom + 36, mainFlowBottom + 36))}pt`;

  container.append(page);
  appendDocxTextboxContinuationPages(
    container,
    continuationGroups.length > 0 ? continuationGroups : [continuationBlocks],
    columns,
    sidebarBackground
  );
  return true;
}

function findDocxTextboxContinuationMarkers(blocks: DocxTextboxBlock[]): DocxTextboxBlock[] {
  return blocks
    .filter(isDocxTextboxLargeBackground)
    .sort((a, b) => a.order - b.order)
    .slice(1);
}

function isDocxTextboxLargeBackground(block: DocxTextboxBlock): boolean {
  return block.paragraphs.length === 0 && Boolean(block.fill) && block.relativeV === "page" && block.width >= 120 && block.height >= 500;
}

function isDocxTextboxFirstPageFlowBlock(block: DocxTextboxBlock): boolean {
  return block.y >= -5;
}

function renderDocxFirstPageFlowFallback(
  page: HTMLElement,
  pageBlocks: DocxTextboxBlock[],
  paragraphBlocks: DocxTextboxBlock[],
  columns: DocxTextboxColumnLayout,
  sidebarBackground: DocxTextboxBlock
): boolean {
  const sidebarBlocks = [...pageBlocks, ...paragraphBlocks]
    .filter((block) => columns.sidebar.has(block.order) && block.paragraphs.length > 0)
    .filter((block) => !isDocxTextboxDecorativeBlock(block))
    .sort(sortDocxTextboxFirstPageSidebarBlock);
  const mainBlocks = pageBlocks
    .filter((block) => columns.main.has(block.order) && block.paragraphs.length > 0)
    .filter((block) => !isDocxTextboxDecorativeBlock(block))
    .sort(sortDocxTextboxFirstPageMainBlock);
  if (sidebarBlocks.length < 2 || mainBlocks.length < 2) {
    return false;
  }

  page.classList.add("ofv-docx-textbox-page-flow-layout");
  page.style.setProperty("--ofv-docx-textbox-sidebar-bg", `#${sidebarBackground.fill}`);
  page.style.setProperty("--ofv-docx-textbox-sidebar-width", `${formatCssNumber(inferDocxTextboxSidebarBackgroundWidth(columns))}pt`);

  const sidebar = document.createElement("aside");
  sidebar.className = "ofv-docx-textbox-page-flow-sidebar";
  const main = document.createElement("main");
  main.className = "ofv-docx-textbox-page-flow-main";

  for (const block of mergeDocxTextboxSidebarHeadingBlocks(sidebarBlocks)) {
    const element = createDocxTextboxBlockElement(block);
    element.classList.add("ofv-docx-textbox-flow-block");
    sidebar.append(element);
  }
  for (const block of mainBlocks) {
    const element = createDocxTextboxBlockElement(block);
    element.classList.add("ofv-docx-textbox-flow-block");
    main.append(element);
  }

  page.append(sidebar, main);
  return true;
}

function sortDocxTextboxFirstPageSidebarBlock(a: DocxTextboxBlock, b: DocxTextboxBlock): number {
  return a.order - b.order;
}

function sortDocxTextboxFirstPageMainBlock(a: DocxTextboxBlock, b: DocxTextboxBlock): number {
  const relationRank = (block: DocxTextboxBlock) => (block.relativeV === "page" ? 0 : 1);
  const rankDiff = relationRank(a) - relationRank(b);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const yDiff = a.y - b.y;
  return Math.abs(yDiff) > 12 ? yDiff : a.order - b.order;
}

function isDocxTextboxDecorativeBlock(block: DocxTextboxBlock): boolean {
  return block.fill !== undefined && normalizePreviewText(block.paragraphs.join("")).length === 0 && block.width < 24 && block.height < 24;
}

function groupDocxTextboxContinuationBlocks(
  blocks: DocxTextboxBlock[],
  markers: DocxTextboxBlock[],
  firstMarkerOrder: number
): DocxTextboxBlock[][] {
  if (markers.length === 0) {
    return [];
  }
  return markers
    .map((marker, index) => {
      const nextMarkerOrder = markers[index + 1]?.order ?? Number.POSITIVE_INFINITY;
      const preMarkerParagraphBlocks =
        index === 0
          ? blocks.filter(
              (block) =>
                block.relativeV !== "page" && block.order < firstMarkerOrder && !isDocxTextboxFirstPageFlowBlock(block)
            )
          : [];
      const markerPageBlocks = blocks.filter((block) => block.order >= marker.order && block.order < nextMarkerOrder);
      return [...preMarkerParagraphBlocks, ...markerPageBlocks]
        .filter((block) => block.paragraphs.length > 0)
        .sort((a, b) => a.order - b.order);
    })
    .filter((group) => group.length > 0);
}

function appendDocxTextboxContinuationPages(
  container: HTMLElement,
  groups: DocxTextboxBlock[][],
  columns: DocxTextboxColumnLayout,
  sidebarBackground?: DocxTextboxBlock
): void {
  for (const blocks of groups) {
    appendDocxTextboxContinuationPage(container, blocks, columns, sidebarBackground);
  }
}

function appendDocxTextboxContinuationPage(
  container: HTMLElement,
  contentBlocks: DocxTextboxBlock[],
  columns: DocxTextboxColumnLayout,
  sidebarBackground?: DocxTextboxBlock
): void {
  if (contentBlocks.length === 0) {
    return;
  }
  const page = document.createElement("article");
  page.className = "ofv-document ofv-docx-textbox-page";
  page.style.setProperty("--ofv-docx-textbox-page-width", "595pt");
  if (
    sidebarBackground?.fill &&
    renderDocxContinuationFlowFallback(page, contentBlocks, columns, sidebarBackground)
  ) {
    container.append(page);
    return;
  }

  if (sidebarBackground?.fill) {
    page.classList.add("ofv-docx-textbox-page-has-sidebar");
    page.style.setProperty("--ofv-docx-textbox-sidebar-bg", `#${sidebarBackground.fill}`);
    page.style.setProperty("--ofv-docx-textbox-sidebar-width", `${formatCssNumber(inferDocxTextboxSidebarBackgroundWidth(columns))}pt`);
  }

  const sidebarFlowBottom = appendDocxTextboxFlowColumn(page, contentBlocks.filter((block) => columns.sidebar.has(block.order)), {
    className: "ofv-docx-textbox-page-sidebar-flow",
    leftPt: columns.sidebarLeft,
    topPt: 42,
    widthPt: columns.sidebarWidth
  });
  const mainFlowBottom = appendDocxTextboxFlowColumn(page, contentBlocks.filter((block) => columns.main.has(block.order)), {
    className: "ofv-docx-textbox-page-main-flow",
    leftPt: columns.mainLeft,
    topPt: 42,
    widthPt: columns.mainWidth
  });
  page.style.minHeight = `${formatCssNumber(Math.max(842, sidebarFlowBottom + 36, mainFlowBottom + 36))}pt`;
  container.append(page);
}

function renderDocxContinuationFlowFallback(
  page: HTMLElement,
  contentBlocks: DocxTextboxBlock[],
  columns: DocxTextboxColumnLayout,
  sidebarBackground: DocxTextboxBlock
): boolean {
  const sidebarBlocks = contentBlocks
    .filter((block) => columns.sidebar.has(block.order) && block.paragraphs.length > 0)
    .filter((block) => !isDocxTextboxDecorativeBlock(block));
  const mainBlocks = contentBlocks
    .filter((block) => columns.main.has(block.order) && block.paragraphs.length > 0)
    .filter((block) => !isDocxTextboxDecorativeBlock(block));
  if (sidebarBlocks.length === 0 && mainBlocks.length === 0) {
    return false;
  }

  page.classList.add("ofv-docx-textbox-page-flow-layout", "ofv-docx-textbox-continuation-flow-layout");
  page.style.setProperty("--ofv-docx-textbox-sidebar-bg", `#${sidebarBackground.fill}`);
  page.style.setProperty("--ofv-docx-textbox-sidebar-width", `${formatCssNumber(inferDocxTextboxSidebarBackgroundWidth(columns))}pt`);

  const sidebar = document.createElement("aside");
  sidebar.className = "ofv-docx-textbox-page-flow-sidebar";
  const main = document.createElement("main");
  main.className = "ofv-docx-textbox-page-flow-main";

  for (const block of mergeDocxTextboxSidebarHeadingBlocks(orderDocxTextboxFlowBlocks(sidebarBlocks))) {
    const element = createDocxTextboxBlockElement(block);
    element.classList.add("ofv-docx-textbox-flow-block");
    if (isStandaloneDocxTextboxHeadingBlock(block)) {
      element.classList.add("ofv-docx-textbox-section-heading");
    }
    sidebar.append(element);
  }
  for (const block of orderDocxTextboxFlowBlocks(mainBlocks)) {
    const element = createDocxTextboxBlockElement(block);
    element.classList.add("ofv-docx-textbox-flow-block");
    if (isStandaloneDocxTextboxHeadingBlock(block)) {
      element.classList.add("ofv-docx-textbox-section-heading");
    }
    main.append(element);
  }

  page.append(sidebar, main);
  return true;
}

function mergeDocxTextboxSidebarHeadingBlocks(blocks: DocxTextboxBlock[]): DocxTextboxBlock[] {
  const merged: DocxTextboxBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const next = blocks[index + 1];
    if (isStandaloneDocxTextboxHeadingBlock(block) && next && !isStandaloneDocxTextboxHeadingBlock(next)) {
      merged.push({
        ...next,
        order: block.order,
        paragraphs: [block.paragraphs[0], ...next.paragraphs]
      });
      index += 1;
    } else {
      merged.push(block);
    }
  }
  return merged;
}

function findDocxTextboxSidebarBackground(blocks: DocxTextboxBlock[]): DocxTextboxBlock | undefined {
  return blocks
    .filter((block) => block.paragraphs.length === 0 && block.fill && block.relativeV === "page" && block.x < 0 && block.width >= 120 && block.height >= 500)
    .sort((a, b) => b.height * b.width - a.height * a.width)[0];
}

function inferDocxTextboxSidebarBackgroundWidth(columns: DocxTextboxColumnLayout): number {
  const contentRight = columns.sidebarLeft + columns.sidebarWidth + 4;
  const beforeMain = columns.mainLeft - 36;
  return Math.max(96, Math.min(contentRight, beforeMain));
}

function classifyDocxTextboxColumns(
  blocks: DocxTextboxBlock[],
  normalizeX: (block: DocxTextboxBlock) => number
): DocxTextboxColumnLayout {
  const columnThreshold = inferDocxTextboxColumnThreshold(blocks);
  const leftBlocks = blocks.filter((block) => block.x < columnThreshold);
  const rightBlocks = blocks.filter((block) => !leftBlocks.includes(block));
  const sidebar = new Set(leftBlocks.map((block) => block.order));
  const main = new Set(rightBlocks.map((block) => block.order));
  const sidebarLeft = Math.max(28, Math.min(...leftBlocks.map((block) => normalizeX(block))));
  const mainLeft = Math.max(210, Math.min(...rightBlocks.map((block) => normalizeX(block))));
  const sidebarWidth = Math.min(180, Math.max(120, Math.max(...leftBlocks.map((block) => block.width))));
  const mainWidth = Math.min(380, Math.max(280, Math.max(...rightBlocks.map((block) => block.width))));
  return { sidebar, main, sidebarLeft, mainLeft, sidebarWidth, mainWidth };
}

function estimateDocxTextboxColumnFlowStart(
  pageBlocks: DocxTextboxBlock[],
  columnOrders: Set<number>,
  normalizeY: (block: DocxTextboxBlock) => number,
  fallbackTop: number
): number {
  const sameColumnAnchors = pageBlocks.filter((block) => columnOrders.has(block.order));
  const anchorBottom = Math.max(
    0,
    ...sameColumnAnchors.map((block) => normalizeY(block) + Math.max(block.height, estimateDocxTextboxBlockHeight(block)))
  );
  if (anchorBottom > 0) {
    return anchorBottom + 14;
  }
  return fallbackTop + 18;
}

function inferDocxTextboxColumnThreshold(blocks: DocxTextboxBlock[]): number {
  const xs = [...new Set(blocks.map((block) => Math.round(block.x * 10) / 10))].sort((a, b) => a - b);
  if (xs.length < 2) {
    return xs[0] ?? 0;
  }
  let splitIndex = 0;
  let largestGap = -Infinity;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const gap = xs[index + 1] - xs[index];
    if (gap > largestGap) {
      largestGap = gap;
      splitIndex = index;
    }
  }
  return (xs[splitIndex] + xs[splitIndex + 1]) / 2;
}

function appendDocxTextboxFlowColumn(
  page: HTMLElement,
  blocks: DocxTextboxBlock[],
  options: { className: string; leftPt: number; topPt: number; widthPt: number }
): number {
  if (blocks.length === 0) {
    return options.topPt;
  }
  const column = document.createElement("div");
  column.className = `ofv-docx-textbox-page-flow ${options.className}`;
  column.style.left = `${formatCssNumber(options.leftPt)}pt`;
  column.style.top = `${formatCssNumber(options.topPt)}pt`;
  column.style.width = `${formatCssNumber(options.widthPt)}pt`;

  let flowBottom = options.topPt;
  for (const block of orderDocxTextboxFlowBlocks(blocks)) {
    const element = createDocxTextboxBlockElement(block);
    element.classList.add("ofv-docx-textbox-flow-block");
    column.append(element);
    flowBottom += estimateDocxTextboxBlockHeight(block) + 10;
  }
  page.append(column);
  return flowBottom;
}

function orderDocxTextboxFlowBlocks(blocks: DocxTextboxBlock[]): DocxTextboxBlock[] {
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  const result: DocxTextboxBlock[] = [];
  for (const block of ordered) {
    const previous = result[result.length - 1];
    const previousPrevious = result[result.length - 2];
    if (
      previous &&
      isStandaloneDocxTextboxHeadingBlock(block) &&
      !isStandaloneDocxTextboxHeadingBlock(previous) &&
      !isStandaloneDocxTextboxHeadingBlock(previousPrevious)
    ) {
      result.splice(result.length - 1, 0, block);
    } else {
      result.push(block);
    }
  }
  return result;
}

function isStandaloneDocxTextboxHeadingBlock(block?: DocxTextboxBlock): boolean {
  if (!block || block.paragraphs.length !== 1) {
    return false;
  }
  return looksLikeDocxTextboxHeading(block.paragraphs[0]);
}

function createDocxPositionedTextboxBlockElement(block: DocxTextboxBlock): HTMLElement {
  const section = createDocxTextboxBlockElement(block);
  section.classList.add("ofv-docx-textbox-page-block");
  if (block.fill) {
    section.classList.add("ofv-docx-textbox-page-filled-block");
  }
  if (block.paragraphs.length <= 2 && !block.fill) {
    section.classList.add("ofv-docx-textbox-page-title-block");
  }
  return section;
}

function createDocxTextboxBlockElement(block: DocxTextboxBlock): HTMLElement {
  const section = document.createElement("section");
  section.className = "ofv-docx-textbox-block";
  if (block.fill) {
    section.classList.add("ofv-docx-textbox-block-filled");
    section.style.setProperty("--ofv-docx-textbox-fill", `#${block.fill}`);
  }
  const paragraphs = normalizeDocxTextboxParagraphOrder(block);
  const [first, ...rest] = paragraphs;
  if (first) {
    const sectionKind = getDocxTextboxSectionKind(first);
    if (sectionKind) {
      section.classList.add(`ofv-docx-textbox-section-${sectionKind}`);
    }
    const heading = document.createElement("h3");
    heading.textContent = first;
    section.append(heading);
  }
  const body = rest.length > 0 ? rest : [];
  for (const paragraphText of body) {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    section.append(paragraph);
  }
  return section;
}

function getDocxTextboxSectionKind(heading: string): string {
  const text = normalizePreviewText(heading);
  if (text.includes("教育背景")) {
    return "education";
  }
  if (text.includes("专业技能")) {
    return "skills";
  }
  if (text.includes("工作经历")) {
    return "work";
  }
  if (text.includes("项目经验")) {
    return "projects";
  }
  if (text.includes("自我评价")) {
    return "summary";
  }
  if (text.includes("基本信息")) {
    return "profile";
  }
  return "";
}

function estimateDocxTextboxBlockHeight(block: DocxTextboxBlock): number {
  return Math.max(block.height, 18 + block.paragraphs.length * 14);
}

function estimateDocxTextboxFlowHeight(blocks: DocxTextboxBlock[]): number {
  return blocks.reduce((total, block) => total + estimateDocxTextboxBlockHeight(block) + 10, 0);
}

function normalizeDocxTextboxParagraphOrder(block: DocxTextboxBlock): string[] {
  if (!block.fill || block.paragraphs.length < 2) {
    return block.paragraphs;
  }
  const last = block.paragraphs[block.paragraphs.length - 1];
  if (looksLikeDocxTextboxHeading(last)) {
    return [last, ...block.paragraphs.slice(0, -1)];
  }
  return block.paragraphs;
}

function looksLikeDocxTextboxHeading(value: string): boolean {
  const text = normalizePreviewText(value);
  return text.length > 0 && text.length <= 12 && !/[0-9@.:：]/.test(text);
}

async function normalizeDocxLayout(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const hints = await readDocxLayoutHints(arrayBuffer);
  const pages = container.querySelectorAll<HTMLElement>("section.ofv-docx");
  for (const page of pages) {
    repairDocxShapeFills(page);
    repairDocxFloatingPictures(page, hints);
    repairDocxHeadingShapeAlignment(page);
    repairDocxListIndentAlignment(page);
    for (const element of page.querySelectorAll<HTMLElement>("[style*='line-height']")) {
      const lineHeight = parseCssLineHeight(element.style.lineHeight);
      if (lineHeight > 0 && lineHeight < 1) {
        element.style.lineHeight = "1.2";
      }
    }
  }
}

function repairDocxHeadingShapeAlignment(page: HTMLElement): void {
  for (const paragraph of page.querySelectorAll<HTMLElement>("p")) {
    const text = normalizePreviewText(paragraph.textContent || "");
    if (!looksLikeDocxTextboxHeading(text)) {
      continue;
    }
    const svg = paragraph.querySelector<SVGSVGElement>("svg");
    if (!svg) {
      continue;
    }
    const width = parseCssPixelValue(svg.style.width) || parseCssPixelValue(svg.getAttribute("width") || "");
    const marginLeft = parseCssPixelValue(svg.style.marginLeft);
    if (width < 300 || marginLeft < 28 || marginLeft > 44) {
      continue;
    }
    const textWidth = getDocxParagraphVisibleTextWidth(paragraph);
    svg.style.marginLeft = `${formatCssNumber(Math.max(48, marginLeft + textWidth * 0.68))}pt`;
    svg.style.marginTop = `${formatCssNumber(parseCssPixelValue(svg.style.marginTop) - 4)}pt`;
    normalizeDocxHeadingShapeFill(svg);
    repairDocxHeadingTextBackground(paragraph);
  }
}

function normalizeDocxHeadingShapeFill(svg: SVGSVGElement): void {
  const headingFill = "#3f4aa3";
  const fillNodes = svg.querySelectorAll<SVGElement>("image[fill], rect[data-ofv-docx-shape-fill]");
  for (const node of fillNodes) {
    const fill = node.getAttribute("fill") || "";
    if (fill.toLowerCase() === "#38449a") {
      node.setAttribute("fill", headingFill);
    }
  }
}

function repairDocxHeadingTextBackground(paragraph: HTMLElement): void {
  const textSpans = Array.from(paragraph.querySelectorAll<HTMLElement>("span")).filter((element) =>
    normalizePreviewText(element.textContent || "")
  );
  const lastTextSpan = textSpans.at(-1);
  if (!lastTextSpan || !hasWhiteBackground(lastTextSpan)) {
    return;
  }
  lastTextSpan.style.paddingRight = "3pt";
  lastTextSpan.style.paddingTop = "2pt";
  lastTextSpan.style.paddingBottom = "2pt";
  lastTextSpan.style.boxDecorationBreak = "clone";
}

function hasWhiteBackground(element: HTMLElement): boolean {
  const background = element.style.backgroundColor.replace(/\s+/g, "").toLowerCase();
  return background === "white" || background === "#fff" || background === "#ffffff" || background === "rgb(255,255,255)";
}

function getDocxParagraphVisibleTextWidth(paragraph: HTMLElement): number {
  let textWidth = 0;
  for (const element of paragraph.querySelectorAll<HTMLElement>("span")) {
    if (!normalizePreviewText(element.textContent || "")) {
      continue;
    }
    textWidth += pxToPt(element.getBoundingClientRect().width);
  }
  return textWidth;
}

function pxToPt(value: number): number {
  return value * 0.75;
}

function repairDocxListIndentAlignment(page: HTMLElement): void {
  for (const paragraph of page.querySelectorAll<HTMLElement>("p[class*='ofv-docx-num-']")) {
    const text = normalizePreviewText(paragraph.textContent || "");
    if (!isDocxNumberListContinuationParagraph(paragraph, text)) {
      continue;
    }
    paragraph.style.textIndent = "42px";
  }
}

function isDocxNumberListContinuationParagraph(paragraph: HTMLElement, text: string): boolean {
  if (!text || /^[0-9]+[.、]/.test(text)) {
    return false;
  }
  const previousText = findAdjacentDocxParagraphText(paragraph, "previousElementSibling");
  const nextText = findAdjacentDocxParagraphText(paragraph, "nextElementSibling");
  return previousText.includes("工作描述") || /^[3-9][.、]/.test(nextText);
}

function findAdjacentDocxParagraphText(
  paragraph: HTMLElement,
  direction: "previousElementSibling" | "nextElementSibling"
): string {
  let sibling = paragraph[direction] as Element | null;
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === "p") {
      const text = normalizePreviewText(sibling.textContent || "");
      if (text) {
        return text;
      }
    }
    sibling = sibling[direction] as Element | null;
  }
  return "";
}

type DocxLayoutHints = {
  floatingPictures: Array<{
    widthPt: number;
    heightPt: number;
    offsetXPt: number;
    offsetYPt: number;
    relativeFrom: string;
    relativeToParagraph: boolean;
    wrap: string;
  }>;
};

async function readDocxLayoutHints(arrayBuffer: ArrayBuffer): Promise<DocxLayoutHints> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    if (!documentXml) {
      return { floatingPictures: [] };
    }
    return { floatingPictures: extractFloatingPictureHints(documentXml) };
  } catch {
    return { floatingPictures: [] };
  }
}

function extractFloatingPictureHints(xml: string): DocxLayoutHints["floatingPictures"] {
  return [...xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)]
    .filter((match) => /<a:graphicData\b[^>]*uri="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/picture"/.test(match[0]))
    .map((match) => {
      const anchor = match[0];
      const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(anchor);
      const offsetX = /<wp:positionH\b[^>]*\brelativeFrom="([^"]+)"[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(anchor);
      const offsetY = /<wp:positionV\b[^>]*\brelativeFrom="([^"]+)"[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(anchor);
      return {
        widthPt: emuToPt(Number(extent?.[1] || 0)),
        heightPt: emuToPt(Number(extent?.[2] || 0)),
        offsetXPt: emuToPt(Number(offsetX?.[2] || 0)),
        offsetYPt: emuToPt(Number(offsetY?.[2] || 0)),
        relativeFrom: offsetX?.[1] || "",
        relativeToParagraph: offsetY?.[1] === "paragraph",
        wrap: /<wp:wrapSquare\b/.test(anchor) ? "square" : /<wp:wrapNone\b/.test(anchor) ? "none" : ""
      };
    })
    .filter((hint) => hint.widthPt > 0 && hint.heightPt > 0);
}

function emuToPt(value: number): number {
  return value / 12700;
}

function repairDocxShapeFills(page: HTMLElement): void {
  for (const svg of page.querySelectorAll<SVGSVGElement>("svg")) {
    const image = svg.querySelector<SVGElement>("image[fill]");
    if (!image) {
      continue;
    }
    const fill = image.getAttribute("fill");
    if (!fill || svg.querySelector("rect[data-ofv-docx-shape-fill]")) {
      continue;
    }
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("data-ofv-docx-shape-fill", "true");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", "100%");
    rect.setAttribute("height", "100%");
    rect.setAttribute("fill", fill);
    const stroke = image.getAttribute("stroke");
    if (stroke && stroke !== "null") {
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", image.getAttribute("stroke-width") || "1");
    }
    svg.insertBefore(rect, svg.firstChild);
  }
}

function repairDocxFloatingPictures(page: HTMLElement, hints: DocxLayoutHints): void {
  const hint = hints.floatingPictures.find((item) => item.relativeFrom === "column" && item.wrap === "square");
  if (!hint) {
    return;
  }
  const image = page.querySelector<HTMLImageElement>("img");
  if (!image) {
    return;
  }
  const wrapper = image.parentElement as HTMLElement | null;
  if (!wrapper || wrapper.dataset.ofvDocxFloatRepaired === "true") {
    return;
  }
  const pageWidth = parseCssPixelValue(page.style.width) || page.getBoundingClientRect().width;
  const pagePaddingRight = parseCssPixelValue(page.style.paddingRight || page.style.padding) || 0;
  const width = hint.widthPt;
  const left = Math.max(0, Math.min(pageWidth - pagePaddingRight - width, hint.offsetXPt));
  const paragraph = wrapper.closest<HTMLElement>("p");
  const paragraphTop = paragraph ? getElementTopInPt(paragraph, page) : getPagePaddingTopInPt(page);
  const top = hint.relativeToParagraph ? paragraphTop + hint.offsetYPt : hint.offsetYPt;
  wrapper.dataset.ofvDocxFloatRepaired = "true";
  wrapper.style.position = "absolute";
  wrapper.style.float = "none";
  wrapper.style.left = `${formatCssNumber(left)}pt`;
  wrapper.style.top = `${formatCssNumber(Math.max(0, top))}pt`;
  wrapper.style.width = `${formatCssNumber(width)}pt`;
  wrapper.style.height = `${formatCssNumber(hint.heightPt)}pt`;
  wrapper.style.zIndex = "1";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
}

function getElementTopInPt(element: HTMLElement, page: HTMLElement): number {
  const pageRect = page.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const pageWidthPt = parseCssPixelValue(page.style.width) || 595.3;
  const pxPerPt = pageRect.width > 0 && pageWidthPt > 0 ? pageRect.width / pageWidthPt : 4 / 3;
  return (elementRect.top - pageRect.top) / pxPerPt;
}

function getPagePaddingTopInPt(page: HTMLElement): number {
  return parseCssPixelValue(page.style.paddingTop || page.style.padding) || 0;
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
  const panel = container.closest<HTMLElement>(".ofv-office");

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
    const userZoom = parseCssPixelValue(panel?.style.getPropertyValue("--ofv-office-zoom") || "1") || 1;
    wrapper.style.setProperty("--ofv-docx-scale", formatCssNumber(scale));
    wrapper.style.setProperty("--ofv-docx-page-width", `${pageWidth}px`);

    for (const { frame, page } of frames) {
      const pageHeight = page.offsetHeight || page.getBoundingClientRect().height || parseCssPixelValue(page.style.height);
      if (pageHeight > 0) {
        frame.style.height = `${Math.ceil(pageHeight * scale * userZoom)}px`;
      }
    }
  };

  update();
  const timers = [0, 80, 240].map((delay) => window.setTimeout(update, delay));

  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", update);
    panel?.addEventListener("ofv-office-zoom", update);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", update);
      panel?.removeEventListener("ofv-office-zoom", update);
    };
  }

  const observer = new ResizeObserver(update);
  observer.observe(container);
  observer.observe(wrapper);
  panel?.addEventListener("ofv-office-zoom", update);
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    panel?.removeEventListener("ofv-office-zoom", update);
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

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

async function renderDocxTextFallback(container: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const article = document.createElement("article");
  article.className = "ofv-document";

  try {
    const paragraphs = dedupeParagraphs(await extractDocxReadableParagraphs(arrayBuffer));
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

async function extractDocxParagraphs(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  return documentXml ? extractWordParagraphs(documentXml) : [];
}

async function extractDocxReadableParagraphs(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) {
    return [];
  }
  const textboxParagraphs = extractWordTextboxParagraphs(documentXml);
  const documentParagraphs = extractWordParagraphs(documentXml);
  if (textboxParagraphs.length === 0) {
    return documentParagraphs;
  }
  const uniqueTextboxParagraphs = dedupeParagraphs(textboxParagraphs);
  const textboxTextLength = normalizePreviewText(uniqueTextboxParagraphs.join("")).length;
  const documentTextLength = normalizePreviewText(documentParagraphs.join("")).length;
  if (documentTextLength > textboxTextLength * 1.5) {
    const filteredDocumentParagraphs = filterCombinedTextboxParagraphs(documentParagraphs, uniqueTextboxParagraphs);
    return filteredDocumentParagraphs.length > 0
      ? [...filteredDocumentParagraphs, ...uniqueTextboxParagraphs]
      : uniqueTextboxParagraphs;
  }
  return uniqueTextboxParagraphs;
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
    hideSupplementalInfo(notes);
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
    hideSuccessfulSectionHeading(section);
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
  if (text.trim()) {
    hideSuccessfulSectionHeading(section);
  }
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
        ? (xlsx.read(decodeTextBuffer(arrayBuffer), {
            type: "string",
            FS: extension === "tsv" ? "\t" : ",",
            cellDates: true,
            cellNF: true,
            cellStyles: true
          }) as WorkBook)
        : (xlsx.read(arrayBuffer, { type: "array", cellDates: true, cellNF: true, cellStyles: true }) as WorkBook);
  } catch (error) {
    if (isLegacyOfficeBinary(extension)) {
      renderLegacyOfficeBinary(panel, extension, arrayBuffer, `表格解析失败：${normalizeOfficeError(error)}`);
      return;
    }
    renderSheetFallback(panel, extension, normalizeOfficeError(error));
    return;
  }
  const chartPreviews = await readWorkbookCharts(arrayBuffer).catch(() => []);
  const workbookImages = await readWorkbookSheetImages(arrayBuffer).catch(() => new Map<string, WorkbookSheetImage[]>());
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
    const sheetImages = workbookImages.get(sheetName) || [];
    const range = trimWorkbookSheetRange(sheet, xlsx.utils.decode_range(sheet["!ref"] || "A1:A1"), xlsx.utils.decode_cell);
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    const formulaRows = collectFormulaRows(sheet, range, xlsx.utils.encode_cell);

    const summary = document.createElement("div");
    summary.className = "ofv-sheet-summary";
    summary.hidden = true;
    summary.setAttribute("aria-hidden", "true");
    summary.style.display = "none";
    summary.textContent = `${rowCount} 行 x ${columnCount} 列${
      formulaRows.length > 0 ? `，包含 ${formulaRows.length} 个公式单元格` : ""
    }`;

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "ofv-table-scroll";
    const viewport = createSheetViewport(rowCount, columnCount);
    const columnSizing: SheetColumnSizing = { widths: new Map() };
    const windowControls = createSheetWindowControls(viewport, () => renderTableWindow());
    const renderTableWindow = () => {
      tableWrapper.replaceChildren(
        createWorkbookSheetTable(
          sheet,
          range,
          sheetIndex,
          viewport,
          xlsx.utils.encode_cell,
          xlsx.utils.format_cell,
          columnSizing,
          renderTableWindow,
          sheetImages
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
      hideSupplementalInfo(details);
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
  if (isEncryptedText(detail)) {
    renderEncryptedOfficeByFileInfo(panel, `.${extension || "sheet"}`, "Office 文件已加密，无法在线预览");
    return;
  }
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

async function readWorkbookSheetImages(arrayBuffer: ArrayBuffer): Promise<Map<string, WorkbookSheetImage[]>> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileNames = Object.keys(zip.files);
  if (!fileNames.some((name) => /^xl\/drawings\/.+\.xml$/i.test(name)) || !fileNames.some((name) => /^xl\/media\//i.test(name))) {
    return new Map();
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!workbookXml || typeof DOMParser === "undefined") {
    return new Map();
  }
  const workbookDoc = parseOfficeXml(workbookXml);
  if (!workbookDoc) {
    return new Map();
  }

  const workbookRels = await readOfficeRelationships(zip, "xl/workbook.xml");
  const result = new Map<string, WorkbookSheetImage[]>();
  const sheetElements = Array.from(workbookDoc.getElementsByTagName("*")).filter((element) => element.localName === "sheet");
  for (const sheetElement of sheetElements) {
    const sheetName = sheetElement.getAttribute("name") || "";
    const relationshipId = getXmlAttribute(sheetElement, "id");
    const sheetRel = workbookRels.find((rel) => rel.id === relationshipId && /\/worksheet$/i.test(rel.type));
    const sheetPath = resolveOfficeRelationshipTarget("xl/workbook.xml", sheetRel?.target);
    if (!sheetName || !sheetPath) {
      continue;
    }
    const images = await readWorksheetImages(zip, sheetPath);
    if (images.length > 0) {
      result.set(sheetName, images);
    }
  }
  return result;
}

async function readWorksheetImages(zip: JSZip, sheetPath: string): Promise<WorkbookSheetImage[]> {
  const sheetXml = await zip.file(sheetPath)?.async("text");
  const sheetDoc = sheetXml ? parseOfficeXml(sheetXml) : undefined;
  if (!sheetDoc) {
    return [];
  }

  const sheetRels = await readOfficeRelationships(zip, sheetPath);
  const drawingIds = Array.from(sheetDoc.getElementsByTagName("*"))
    .filter((element) => element.localName === "drawing")
    .map((element) => getXmlAttribute(element, "id"))
    .filter((id): id is string => Boolean(id));
  const images: WorkbookSheetImage[] = [];
  for (const drawingId of drawingIds) {
    const drawingRel = sheetRels.find((rel) => rel.id === drawingId && /\/drawing$/i.test(rel.type));
    const drawingPath = resolveOfficeRelationshipTarget(sheetPath, drawingRel?.target);
    if (drawingPath) {
      images.push(...(await readWorksheetDrawingImages(zip, drawingPath)));
    }
  }
  return images;
}

async function readWorksheetDrawingImages(zip: JSZip, drawingPath: string): Promise<WorkbookSheetImage[]> {
  const drawingXml = await zip.file(drawingPath)?.async("text");
  const drawingDoc = drawingXml ? parseOfficeXml(drawingXml) : undefined;
  if (!drawingDoc) {
    return [];
  }

  const drawingRels = await readOfficeRelationships(zip, drawingPath);
  const anchors = Array.from(drawingDoc.getElementsByTagName("*")).filter(
    (element) => element.localName === "twoCellAnchor" || element.localName === "oneCellAnchor"
  );
  const images: WorkbookSheetImage[] = [];
  for (const anchor of anchors) {
    const from = Array.from(anchor.children).find((element) => element.localName === "from");
    const embedId = findDrawingImageRelationshipId(anchor);
    const mediaRel = drawingRels.find((rel) => rel.id === embedId && /\/image$/i.test(rel.type));
    const mediaPath = resolveOfficeRelationshipTarget(drawingPath, mediaRel?.target);
    const mediaFile = mediaPath ? zip.file(mediaPath) : undefined;
    if (!from || !mediaPath || !mediaFile) {
      continue;
    }
    const mimeType = mimeTypeFromImagePath(mediaPath);
    images.push({
      row: readDrawingMarkerIndex(from, "row"),
      column: readDrawingMarkerIndex(from, "col"),
      fileName: mediaPath.split("/").pop() || "image",
      mimeType,
      dataUrl: `data:${mimeType};base64,${await mediaFile.async("base64")}`,
      title: readDrawingImageTitle(anchor)
    });
  }
  return images;
}

function findDrawingImageRelationshipId(anchor: Element): string | undefined {
  for (const element of Array.from(anchor.getElementsByTagName("*"))) {
    if (element.localName === "blip") {
      return getXmlAttribute(element, "embed") || getXmlAttribute(element, "link") || undefined;
    }
  }
  return undefined;
}

function readDrawingImageTitle(anchor: Element): string | undefined {
  const nonVisualProperties = Array.from(anchor.getElementsByTagName("*")).find((element) => element.localName === "cNvPr");
  return nonVisualProperties?.getAttribute("descr") || nonVisualProperties?.getAttribute("name") || undefined;
}

function readDrawingMarkerIndex(marker: Element, localName: "row" | "col"): number {
  const element = Array.from(marker.children).find((child) => child.localName === localName);
  const value = Number.parseInt(element?.textContent || "0", 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

type OfficeRelationship = {
  id: string;
  type: string;
  target: string;
};

async function readOfficeRelationships(zip: JSZip, partPath: string): Promise<OfficeRelationship[]> {
  const xml = await zip.file(relationshipPathForPart(partPath))?.async("text");
  const doc = xml ? parseOfficeXml(xml) : undefined;
  if (!doc) {
    return [];
  }
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "Relationship")
    .map((element) => ({
      id: element.getAttribute("Id") || "",
      type: element.getAttribute("Type") || "",
      target: element.getAttribute("Target") || ""
    }));
}

function parseOfficeXml(xml: string): Document | undefined {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return doc.querySelector("parsererror") ? undefined : doc;
}

function resolveOfficeRelationshipTarget(sourcePath: string, target?: string): string | undefined {
  return resolvePptxRelationshipTarget(sourcePath, target);
}

function mimeTypeFromImagePath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "svg":
      return "image/svg+xml";
    case "png":
    default:
      return "image/png";
  }
}

function renderEncryptedOfficeByFileInfo(panel: HTMLElement, fileLabel: string, title: string): void {
  const section = createSection(title);
  section.classList.add("ofv-encrypted");
  const message = document.createElement("p");
  message.textContent = `${fileLabel} 可能已加密或受保护。请下载后使用 Office/WPS 输入密码打开，或上传解密后的文件。`;
  section.append(message);
  panel.append(section);
}

function isEncryptedText(value: string): boolean {
  return /\b(password|encrypted|encrypt|protected|decrypt|permission|加密|密码|受保护)\b/i.test(value);
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
    summary.hidden = true;
    summary.setAttribute("aria-hidden", "true");
    summary.style.display = "none";
    const rowCount = sheet.rows.length;
    const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length));
    summary.textContent = `${rowCount} 行 x ${columnCount} 列${
      sheet.formulas.length > 0 ? `，包含 ${sheet.formulas.length} 个公式单元格` : ""
    }`;

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "ofv-table-scroll";
    const viewport = createSheetViewport(rowCount, columnCount);
    const columnSizing: SheetColumnSizing = { widths: new Map() };
    const windowControls = createSheetWindowControls(viewport, () => renderTableWindow());
    const renderTableWindow = () => {
      tableWrapper.replaceChildren(createParsedSheetTable(sheet, sheetIndex, viewport, columnSizing, renderTableWindow));
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
      hideSupplementalInfo(details);
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
  hideSupplementalInfo(details);
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

type SheetRange = {
  s: { r: number; c: number };
  e: { r: number; c: number };
};

type SheetMergeRenderInfo = {
  rowspan: number;
  colspan: number;
  sourceRow: number;
  sourceColumn: number;
};

type SheetColumnSizing = {
  widths: Map<number, number>;
};

type WorkbookSheetImage = {
  row: number;
  column: number;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  title?: string;
};

function trimWorkbookSheetRange(
  sheet: Record<string, any>,
  range: SheetRange,
  decodeCell: (address: string) => { r: number; c: number }
): SheetRange {
  let minRow = Number.POSITIVE_INFINITY;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let maxColumn = Number.NEGATIVE_INFINITY;
  const include = (row: number, column: number) => {
    minRow = Math.min(minRow, row);
    minColumn = Math.min(minColumn, column);
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);
  };

  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) {
      continue;
    }
    if (!cell || (cell.v == null && !cell.f && !cell.w && !cell.h)) {
      continue;
    }
    const decoded = decodeCell(address);
    include(decoded.r, decoded.c);
  }

  for (const merge of (sheet["!merges"] || []) as SheetRange[]) {
    include(merge.s.r, merge.s.c);
    include(merge.e.r, merge.e.c);
  }

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn) || !Number.isFinite(maxRow) || !Number.isFinite(maxColumn)) {
    return range;
  }

  return {
    s: {
      r: Math.max(range.s.r, minRow),
      c: Math.max(range.s.c, minColumn)
    },
    e: {
      r: Math.min(range.e.r, maxRow),
      c: Math.min(range.e.c, maxColumn)
    }
  };
}

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
  range: SheetRange,
  sheetIndex: number,
  viewport: SheetViewport,
  encodeCell: (cell: { r: number; c: number }) => string,
  formatCell: (cell: any) => string,
  columnSizing: SheetColumnSizing,
  rerender: () => void,
  images: WorkbookSheetImage[] = []
): HTMLTableElement {
  const table = document.createElement("table");
  table.id = `ofv-sheet-${sheetIndex + 1}`;
  table.className = "ofv-workbook-table";
  const rowEnd = Math.min(range.s.r + viewport.rowStart + SHEET_WINDOW_ROWS - 1, range.e.r);
  const columnEnd = Math.min(range.s.c + viewport.columnStart + SHEET_WINDOW_COLUMNS - 1, range.e.c);
  const columnStart = range.s.c + viewport.columnStart;
  const rowStart = range.s.r + viewport.rowStart;
  const mergePlan = createSheetMergePlan(sheet["!merges"] || [], rowStart, rowEnd, columnStart, columnEnd);
  const imagesByCell = groupWorkbookImagesByCell(images);

  const colGroup = document.createElement("colgroup");
  let tableWidth = 0;
  for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
    const col = document.createElement("col");
    const width = columnSizing.widths.get(columnIndex) ?? getSheetColumnWidth(sheet["!cols"]?.[columnIndex]);
    col.dataset.columnIndex = String(columnIndex);
    col.style.width = `${width}px`;
    tableWidth += width;
    colGroup.append(col);
  }
  table.style.width = `${tableWidth}px`;
  table.append(colGroup);

  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const row = document.createElement("tr");
    const rowHeight = getSheetRowHeight(sheet["!rows"]?.[rowIndex]);
    if (rowHeight) {
      row.style.height = `${rowHeight}px`;
    }
    for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
      const address = encodeCell({ r: rowIndex, c: columnIndex });
      const coordinateKey = `${rowIndex}:${columnIndex}`;
      if (mergePlan.covered.has(coordinateKey)) {
        continue;
      }
      const merge = mergePlan.anchors.get(coordinateKey);
      const sourceAddress = merge ? encodeCell({ r: merge.sourceRow, c: merge.sourceColumn }) : address;
      const sourceCell = sheet[sourceAddress];
      const cell = document.createElement(rowIndex === range.s.r ? "th" : "td");
      cell.dataset.cell = address;
      if (sourceAddress !== address) {
        cell.dataset.sourceCell = sourceAddress;
      }
      if (merge) {
        cell.classList.add("ofv-cell-merged");
        if (merge.rowspan > 1) {
          cell.rowSpan = merge.rowspan;
        }
        if (merge.colspan > 1) {
          cell.colSpan = merge.colspan;
        }
      }
      const text = sourceCell ? formatCell(sourceCell) : "";
      cell.textContent = text;
      if (text) {
        cell.title = text;
      }
      applyWorkbookCellStyle(cell, sourceCell);
      if (sourceCell?.f) {
        cell.classList.add("ofv-cell-formula");
        cell.title = `=${sourceCell.f}`;
      }
      if (text.includes("\n")) {
        cell.classList.add("ofv-cell-multiline");
      }
      appendWorkbookCellImages(cell, imagesByCell.get(`${rowIndex}:${columnIndex}`), text);
      appendColumnResizeHandle(cell, columnIndex, columnSizing);
      row.append(cell);
    }
    table.append(row);
  }

  return table;
}

function appendColumnResizeHandle(
  cell: HTMLTableCellElement,
  columnIndex: number,
  columnSizing: SheetColumnSizing
): void {
  const handle = document.createElement("span");
  handle.className = "ofv-column-resize-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnSizing.widths.get(columnIndex) ?? cell.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(48, Math.min(720, Math.round(startWidth + moveEvent.clientX - startX)));
      columnSizing.widths.set(columnIndex, nextWidth);
      updateRenderedColumnWidth(cell, columnIndex, nextWidth);
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  });
  cell.append(handle);
}

function updateRenderedColumnWidth(cell: HTMLTableCellElement, columnIndex: number, width: number): void {
  const table = cell.closest("table");
  if (!table) {
    return;
  }

  const column = Array.from(table.querySelectorAll<HTMLTableColElement>("col")).find(
    (col) => col.dataset.columnIndex === String(columnIndex)
  );
  if (column) {
    column.style.width = `${width}px`;
  }

  const tableWidth = Array.from(table.querySelectorAll<HTMLTableColElement>("col")).reduce((sum, col) => {
    const parsed = Number.parseFloat(col.style.width);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
  if (tableWidth > 0) {
    table.style.width = `${Math.round(tableWidth)}px`;
  }
}

function createSheetMergePlan(
  merges: SheetRange[],
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number
): { anchors: Map<string, SheetMergeRenderInfo>; covered: Set<string> } {
  const anchors = new Map<string, SheetMergeRenderInfo>();
  const covered = new Set<string>();
  const encode = (row: number, column: number) => `${row}:${column}`;

  for (const merge of merges) {
    if (merge.e.r < rowStart || merge.s.r > rowEnd || merge.e.c < columnStart || merge.s.c > columnEnd) {
      continue;
    }

    const visibleStartRow = Math.max(merge.s.r, rowStart);
    const visibleEndRow = Math.min(merge.e.r, rowEnd);
    const visibleStartColumn = Math.max(merge.s.c, columnStart);
    const visibleEndColumn = Math.min(merge.e.c, columnEnd);
    const anchor = encode(visibleStartRow, visibleStartColumn);
    anchors.set(anchor, {
      rowspan: visibleEndRow - visibleStartRow + 1,
      colspan: visibleEndColumn - visibleStartColumn + 1,
      sourceRow: merge.s.r,
      sourceColumn: merge.s.c
    });

    for (let rowIndex = visibleStartRow; rowIndex <= visibleEndRow; rowIndex += 1) {
      for (let columnIndex = visibleStartColumn; columnIndex <= visibleEndColumn; columnIndex += 1) {
        const address = encode(rowIndex, columnIndex);
        if (address !== anchor) {
          covered.add(address);
        }
      }
    }
  }

  return { anchors, covered };
}

function groupWorkbookImagesByCell(images: WorkbookSheetImage[]): Map<string, WorkbookSheetImage[]> {
  const grouped = new Map<string, WorkbookSheetImage[]>();
  for (const image of images) {
    const key = `${image.row}:${image.column}`;
    const items = grouped.get(key) || [];
    items.push(image);
    grouped.set(key, items);
  }
  return grouped;
}

function appendWorkbookCellImages(cell: HTMLTableCellElement, images: WorkbookSheetImage[] | undefined, text: string): void {
  if (!images?.length) {
    return;
  }
  if (isWorkbookImagePlaceholderValue(text)) {
    cell.textContent = "";
    cell.removeAttribute("title");
  }
  cell.classList.add("ofv-cell-image");
  for (const image of images) {
    const figure = document.createElement("figure");
    figure.className = "ofv-workbook-image";
    const element = document.createElement("img");
    element.src = image.dataUrl;
    element.alt = image.title || image.fileName || "Excel embedded image";
    element.loading = "lazy";
    figure.append(element);
    cell.append(figure);
  }
}

function isWorkbookImagePlaceholderValue(text: string): boolean {
  return /^#(?:VALUE|NAME|REF|N\/A|NULL|NUM|DIV\/0)!?$/i.test(text.trim());
}

function getSheetColumnWidth(column: { hidden?: boolean; wpx?: number; width?: number; wch?: number } | undefined): number {
  if (column?.hidden) {
    return 0;
  }
  const width = column?.wpx || (column?.wch ? column.wch * 7 + 5 : undefined) || (column?.width ? column.width * 7 : undefined) || 96;
  return Math.max(28, Math.min(360, Math.round(width)));
}

function getSheetRowHeight(row: { hidden?: boolean; hpx?: number; hpt?: number } | undefined): number | undefined {
  if (row?.hidden) {
    return 0;
  }
  const height = row?.hpx || (row?.hpt ? row.hpt * 1.333 : undefined);
  return height ? Math.max(18, Math.min(260, Math.round(height))) : undefined;
}

function applyWorkbookCellStyle(cell: HTMLTableCellElement, sourceCell: any): void {
  const style = sourceCell?.s;
  if (!style) {
    return;
  }

  const fill = readWorkbookColor(style.fgColor || style.fill?.fgColor);
  if (fill && style.patternType !== "none") {
    cell.style.backgroundColor = fill;
  }

  const font = style.font;
  if (font) {
    if (font.bold) {
      cell.style.fontWeight = "700";
    }
    if (font.italic) {
      cell.style.fontStyle = "italic";
    }
    if (font.sz) {
      cell.style.fontSize = `${Math.max(9, Math.min(24, Number(font.sz)))}pt`;
    }
    const fontColor = readWorkbookColor(font.color);
    if (fontColor) {
      cell.style.color = fontColor;
    }
  }

  const alignment = style.alignment;
  if (alignment) {
    const horizontal = normalizeSheetHorizontalAlign(alignment.horizontal);
    if (horizontal) {
      cell.style.textAlign = horizontal;
    }
    const vertical = normalizeSheetVerticalAlign(alignment.vertical);
    if (vertical) {
      cell.style.verticalAlign = vertical;
    }
    if (alignment.wrapText) {
      cell.classList.add("ofv-cell-multiline");
    }
  }
}

function readWorkbookColor(color: { rgb?: string; indexed?: number } | undefined): string | undefined {
  if (!color?.rgb) {
    return undefined;
  }
  const rgb = color.rgb.length === 8 ? color.rgb.slice(2) : color.rgb;
  return /^[\da-f]{6}$/i.test(rgb) ? `#${rgb}` : undefined;
}

function normalizeSheetHorizontalAlign(value: string | undefined): string | undefined {
  if (value === "center" || value === "right" || value === "left" || value === "justify") {
    return value;
  }
  return undefined;
}

function normalizeSheetVerticalAlign(value: string | undefined): string | undefined {
  if (value === "top" || value === "middle" || value === "bottom") {
    return value;
  }
  return undefined;
}

function createParsedSheetTable(
  sheet: ParsedSheet,
  sheetIndex: number,
  viewport: SheetViewport,
  columnSizing: SheetColumnSizing,
  rerender: () => void
): HTMLTableElement {
  const table = document.createElement("table");
  table.id = `ofv-sheet-${sheetIndex + 1}`;
  const formulaMap = new Map(sheet.formulas.map((item) => [item.address, item.formula]));
  const rowEnd = Math.min(viewport.rowStart + SHEET_WINDOW_ROWS, sheet.rows.length);
  const columnEnd = Math.min(viewport.columnStart + SHEET_WINDOW_COLUMNS, viewport.columnCount);
  const colGroup = document.createElement("colgroup");
  let tableWidth = 0;
  for (let columnIndex = viewport.columnStart; columnIndex < columnEnd; columnIndex += 1) {
    const width = columnSizing.widths.get(columnIndex) ?? 112;
    const col = document.createElement("col");
    col.dataset.columnIndex = String(columnIndex);
    col.style.width = `${width}px`;
    tableWidth += width;
    colGroup.append(col);
  }
  table.style.width = `${tableWidth}px`;
  table.append(colGroup);

  for (let rowIndex = viewport.rowStart; rowIndex < rowEnd; rowIndex += 1) {
    const sourceRow = sheet.rows[rowIndex] || [];
    const row = document.createElement("tr");
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
      if (value.includes("\n")) {
        cell.classList.add("ofv-cell-multiline");
      }
      appendColumnResizeHandle(cell, columnIndex, columnSizing);
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
  let insight: PresentationInsight | undefined;
  let zip: JSZip | undefined;

  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    insight = await inspectPptxPresentation(zip);
    await renderPresentationInsight(panel, insight);
  } catch (error) {
    console.warn("PPTX structure insight extraction failed:", error);
  }

  panel.append(container);
  try {
    const { PptxViewer } = await import("@aiden0z/pptx-renderer");
    await withTimeout(PptxViewer.open(arrayBuffer, container), pptxRenderTimeoutMs());
    normalizePptxLayout(container);
  } catch (error) {
    container.replaceChildren();
    if (insight) {
      renderPptxTextFallback(container, insight);
      return;
    }
    if (zip) {
      renderPptxTextFallback(container, await inspectPptxPresentation(zip));
      return;
    }
    container.textContent =
      error instanceof Error && error.message.includes("timed out")
        ? "PPTX 渲染超时，请稍后重试或转换为 PDF 后预览。"
        : "PPTX 渲染失败，请检查文件是否损坏。";
  }
}

function renderPptxTextFallback(container: HTMLElement, insight: PresentationInsight): void {
  container.classList.add("ofv-presentation-slides");
  const slides = insight.slides.length > 0 ? insight.slides : [{ title: "PPTX", textCount: 0, imageCount: 0, notesCount: 0, hasTransition: false, animationCount: 0, sampleTexts: [] }];
  for (const [index, slide] of slides.entries()) {
    const article = document.createElement("article");
    article.className = "ofv-slide";
    article.dataset.slideIndex = String(index);
    const title = document.createElement("h4");
    title.textContent = slide.title || `Slide ${index + 1}`;
    article.append(title);
    const bodyTexts = slide.sampleTexts.length > 0 ? slide.sampleTexts : ["该页没有可提取文本。"];
    for (const text of bodyTexts) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      article.append(paragraph);
    }
    container.append(article);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`PPTX rendering timed out after ${timeoutMs}ms.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function pptxRenderTimeoutMs(): number {
  const override = (globalThis as { __OFV_PPTX_RENDER_TIMEOUT_MS__?: unknown }).__OFV_PPTX_RENDER_TIMEOUT_MS__;
  return typeof override === "number" && override > 0 ? override : DEFAULT_PPTX_RENDER_TIMEOUT_MS;
}

function normalizePptxLayout(container: HTMLElement): void {
  const slideCanvases = findPptxSlideCanvases(container);
  for (const slide of slideCanvases) {
    slide.style.backgroundColor = "#FFFFFF";
  }
  normalizePptxMirroredText(container);
}

function normalizePptxMirroredText(container: HTMLElement): void {
  const mirroredContainers = Array.from(container.querySelectorAll<HTMLElement>("div")).filter((element) => {
    const text = element.textContent?.trim();
    if (!text || element.children.length === 0) {
      return false;
    }
    const styleTransform = element.style.transform;
    return hasPptxMirrorTransform(styleTransform, "x") || hasPptxMirrorTransform(styleTransform, "y");
  });

  for (const element of mirroredContainers) {
    const flipX = hasPptxMirrorTransform(element.style.transform, "x");
    const flipY = hasPptxMirrorTransform(element.style.transform, "y");
    const targets = findPptxMirroredTextTargets(element);

    for (const target of targets) {
      counterMirrorPptxTextTarget(target, flipX, flipY);
    }
  }
}

function findPptxMirroredTextTargets(element: HTMLElement): HTMLElement[] {
  const children = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const absoluteTextChildren = children.filter((child) => Boolean(child.textContent?.trim()) && child.style.position === "absolute");
  if (absoluteTextChildren.length > 0) {
    return absoluteTextChildren;
  }
  return children.filter((child) => Boolean(child.textContent?.trim()));
}

function hasPptxMirrorTransform(transform: string, axis: "x" | "y"): boolean {
  if (!transform) {
    return false;
  }
  if (axis === "x" && /scaleX\(\s*-1\s*\)/i.test(transform)) {
    return true;
  }
  if (axis === "y" && /scaleY\(\s*-1\s*\)/i.test(transform)) {
    return true;
  }
  const matrix = transform.match(/matrix\(\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)\s*,\s*([^,\s]+)/i);
  if (!matrix) {
    return false;
  }
  const xScale = Number(matrix[1]);
  const yScale = Number(matrix[4]);
  return axis === "x" ? xScale < 0 : yScale < 0;
}

function counterMirrorPptxTextTarget(target: HTMLElement, flipX: boolean, flipY: boolean): void {
  const applied = target.dataset.ofvPptxCounterMirror ?? "";
  const transforms: string[] = [];
  if (flipX && !applied.includes("x")) {
    transforms.push("scaleX(-1)");
  }
  if (flipY && !applied.includes("y")) {
    transforms.push("scaleY(-1)");
  }
  if (transforms.length === 0) {
    return;
  }

  target.style.transform = `${target.style.transform || ""} ${transforms.join(" ")}`.trim();
  if (!target.style.transformOrigin) {
    target.style.transformOrigin = "center center";
  }
  target.dataset.ofvPptxCounterMirror = `${applied}${flipX ? "x" : ""}${flipY ? "y" : ""}`;
}

function findPptxSlideCanvases(container: HTMLElement): HTMLElement[] {
  const slideWrappers = Array.from(container.querySelectorAll<HTMLElement>("div[data-slide-index]"));
  const candidates = slideWrappers.flatMap((wrapper) =>
    Array.from(wrapper.querySelectorAll<HTMLElement>("div")).filter(isPptxSlideCanvas)
  );
  if (candidates.length > 0) {
    return Array.from(new Set(candidates));
  }
  return Array.from(container.querySelectorAll<HTMLElement>("div")).filter(isPptxSlideCanvas);
}

function isPptxSlideCanvas(element: HTMLElement): boolean {
  return element.style.position === "relative" && parseCssPixelValue(element.style.width) > 0 && parseCssPixelValue(element.style.height) > 0;
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
    await renderDocx(panel, arrayBuffer);
    return true;
  }

  if (hasEntry("xl/workbook.xml")) {
    await renderSheet(panel, arrayBuffer, extension);
    return true;
  }

  if (hasEntry("ppt/presentation.xml")) {
    await renderPptx(panel, arrayBuffer);
    return true;
  }

  if (contentXml) {
    const xml = await contentXml.async("text");
    if (/<office:spreadsheet\b|<table:table\b/i.test(xml)) {
      renderParsedSheets(panel, parseFlatOds(xml), `${extension.toUpperCase()} 文件未解析到表格。`);
      return true;
    }
    if (/<office:presentation\b|<draw:page\b/i.test(xml)) {
      renderOpenDocumentPresentation(panel, `${extension.toUpperCase()} 演示文稿`, xml, await extractZipImages(zip, /^Pictures\//));
      return true;
    }
    if (/<office:text\b|<text:p\b/i.test(xml)) {
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
      hideSuccessfulSectionHeading(section);
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
  summary.style.display = "none";
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
  return ["doc", "dot", "wps", "xls", "xlt", "xlsb", "et", "ppt", "pps", "key", "dps"].includes(extension);
}

function legacyOfficeFormatLabel(extension: string): string {
  if (extension === "doc" || extension === "dot" || extension === "wps") {
    return "Word Binary File Format";
  }
  if (extension === "xls" || extension === "xlt" || extension === "xlsb" || extension === "et") {
    return "Excel Binary File Format";
  }
  if (extension === "key") {
    return "Apple Keynote / legacy presentation package";
  }
  if (extension === "dps") {
    return "WPS Presentation legacy format";
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
  return [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => cleanOpenXmlText(decodeXml(match[1] || match[2] || "")).trim())
    .filter(Boolean);
}

function extractWordParagraphs(xml: string): string[] {
  const documentXml = parseWordXml(xml);
  if (documentXml) {
    const paragraphs = Array.from(documentXml.getElementsByTagName("*"))
      .filter((element) => element.localName === "p")
      .map((paragraph) => extractOpenXmlTextFromElement(paragraph).join(""))
      .map((text) => text.trim())
      .filter(Boolean);
    if (paragraphs.length > 0) {
      return paragraphs;
    }
  }
  return extractWordParagraphsByRegex(xml);
}

function extractWordTextboxText(xml: string): string[] {
  return [...xml.matchAll(/<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g)]
    .map((match) => extractOpenXmlText(match[0]).join(""))
    .map((text) => text.trim())
    .filter(Boolean);
}

function extractWordTextboxParagraphs(xml: string): string[] {
  const paragraphs = extractWordTextboxParagraphsByRegex(xml);
  if (paragraphs.length > 0) {
    return paragraphs;
  }
  const documentXml = parseWordXml(xml);
  return documentXml
    ? Array.from(documentXml.getElementsByTagName("*"))
        .filter((element) => element.localName === "txbxContent")
        .flatMap((textbox) =>
          Array.from(textbox.getElementsByTagName("*"))
            .filter((element) => element.localName === "p")
            .map((paragraph) => extractOpenXmlTextFromElement(paragraph).join(""))
            .map((text) => text.trim())
            .filter(Boolean)
        )
    : [];
}

function parseWordXml(xml: string): Document | undefined {
  if (typeof DOMParser === "undefined") {
    return undefined;
  }
  try {
    const documentXml = new DOMParser().parseFromString(xml, "application/xml");
    if (documentXml.getElementsByTagName("parsererror").length > 0) {
      return undefined;
    }
    return documentXml;
  } catch {
    return undefined;
  }
}

function extractWordParagraphsByRegex(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => extractOpenXmlText(match[0]).join(""))
    .map((text) => text.trim())
    .filter(Boolean);
}

function extractWordTextboxParagraphsByRegex(xml: string): string[] {
  return [...xml.matchAll(/<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g)].flatMap((match) => {
    const textboxXml = ensureWordXmlWrapper(match[0]);
    const textboxDocument = parseWordXml(textboxXml);
    if (textboxDocument) {
      const paragraphs = Array.from(textboxDocument.getElementsByTagName("*"))
        .filter((element) => element.localName === "p")
        .map((paragraph) => extractOpenXmlTextFromElement(paragraph).join(""))
        .map((text) => text.trim())
        .filter(Boolean);
      if (paragraphs.length > 0) {
        return paragraphs;
      }
    }
    return extractWordParagraphsByRegex(match[0]);
  });
}

function ensureWordXmlWrapper(xml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <ofv:root
      xmlns:ofv="urn:open-file-viewer"
      xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:v="urn:schemas-microsoft-com:vml">
      ${xml}
    </ofv:root>`;
}

function extractOpenXmlTextFromElement(element: Element): string[] {
  return Array.from(element.getElementsByTagName("*"))
    .filter((child) => child.localName === "t")
    .map((child) => cleanOpenXmlText(child.textContent || "").trim())
    .filter(Boolean);
}

function cleanOpenXmlText(value: string): string {
  return value.replace(/<\/?[A-Za-z][\w:.-]*(?:\s+[^<>]*)?>/g, "");
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    const key = normalizePreviewText(paragraph);
    if (!key || key === normalizePreviewText(result[result.length - 1] || "") || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(paragraph);
  }
  return result;
}

function filterCombinedTextboxParagraphs(documentParagraphs: string[], textboxParagraphs: string[]): string[] {
  const textboxKeys = textboxParagraphs.map((paragraph) => normalizePreviewText(paragraph)).filter(Boolean);
  if (textboxKeys.length < 2) {
    return documentParagraphs;
  }
  const combinedTextboxKey = textboxKeys.join("");
  const sortedTextboxKeys = [...textboxKeys].sort((a, b) => b.length - a.length);
  return documentParagraphs.filter((paragraph) => {
    const key = normalizePreviewText(paragraph);
    return (
      key &&
      key !== combinedTextboxKey &&
      key !== `${combinedTextboxKey}${combinedTextboxKey}` &&
      !isComposedOfTextboxParagraphs(key, sortedTextboxKeys)
    );
  });
}

function isComposedOfTextboxParagraphs(value: string, textboxKeys: string[]): boolean {
  let remaining = value;
  let matchedCount = 0;
  for (const key of textboxKeys) {
    if (!key || !remaining.includes(key)) {
      continue;
    }
    const before = remaining.length;
    remaining = remaining.split(key).join("");
    if (remaining.length !== before) {
      matchedCount += Math.floor((before - remaining.length) / key.length);
    }
  }
  return matchedCount >= 2 && remaining.length === 0;
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

function hideSupplementalInfo(element: HTMLElement): void {
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
}

function hideSuccessfulSectionHeading(section: HTMLElement): void {
  const heading = section.querySelector<HTMLElement>("h3");
  if (heading) {
    hideSupplementalInfo(heading);
  }
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
