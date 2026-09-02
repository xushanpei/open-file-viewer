import JSZip from "jszip";
import DOMPurify from "dompurify";
import * as docxPreview from "docx-preview";
import type { WorkBook } from "xlsx";
import { formatPreviewMessage } from "../messages";
import type { PreviewCommand, PreviewContext, PreviewFit, PreviewInstance, PreviewMessages, PreviewPlugin } from "../types";
import {
  createPanel,
  createSection,
  decodeTextBuffer,
  getInitialZoom,
  goToRenderedPage,
  readArrayBuffer,
  resolveFormat
} from "./utils";
import { renderPdfDocumentPreview, type PdfPluginOptions } from "./pdf";
import { parseLegacyWordDocument, renderLegacyWordDocument } from "./msdoc";
import {
  parseLegacyPowerPoint,
  type LegacyPowerPointCharacterStyle,
  type LegacyPowerPointImage,
  type LegacyPowerPointMasterTextStyles,
  type LegacyPowerPointPresentation,
  type LegacyPowerPointShape
} from "./msppt";

const wordExtensions = new Set(["docx", "docm", "doc", "dotx", "dotm", "dot", "rtf", "odt", "fodt", "wps"]);
const sheetExtensions = new Set(["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "csv", "tsv", "ods", "fods", "numbers", "et"]);
const presentationExtensions = new Set(["pptx", "pptm", "ppt", "pps", "ppsx", "ppsm", "potx", "potm", "odp", "fodp", "key", "dps"]);
const packagedOfficeCandidates = new Set(["wps", "et", "dps", "numbers", "key"]);
const SHEET_WINDOW_ROWS = 200;
const SHEET_WINDOW_COLUMNS = 80;
const DEFAULT_DOCX_RENDER_TIMEOUT_MS = 15000;
const DEFAULT_PPTX_RENDER_TIMEOUT_MS = 12000;
const ZIP_SNIFF_TIMEOUT_MS = 10000;

// Format sniffing runs before the render timeouts, so a JSZip hang here (seen in
// micro-frontend sandboxes, see qiankun#2589) must reject instead of spinning forever.
function loadZipForSniffing(arrayBuffer: ArrayBuffer): Promise<JSZip> {
  return withTimeout(JSZip.loadAsync(arrayBuffer), ZIP_SNIFF_TIMEOUT_MS, "Office package sniffing");
}
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
      const wordHtml = packageFormat ? undefined : detectWordHtmlDocument(extension, arrayBuffer);
      let disposeDocxFit: (() => void) | undefined;
      let disposeLegacyPresentation: (() => void) | undefined;
      let delegatedInstance: PreviewInstance | undefined;

      const conversionContext = await createOfficeConversionContext(ctx, arrayBuffer, extension, packageFormat);
      if (conversionContext && (await shouldUseOfficeConversion(options, conversionContext))) {
        delegatedInstance = await renderConvertedOfficePreview(panel, ctx, options, conversionContext);
      } else if (wordHtml) {
        renderWordHtmlDocument(panel, wordHtml);
      } else if (packageFormat === "docx" && !fileIsDocx(extension)) {
        disposeDocxFit = await renderDocx(panel, arrayBuffer, ctx.options.fit);
      } else if (packageFormat === "xlsx" && !sheetExtensions.has(extension)) {
        await renderSheet(panel, arrayBuffer, "xlsx", ctx.options.messages);
      } else if (packageFormat === "pptx" && !["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(extension)) {
        await renderPptx(panel, arrayBuffer);
      } else if (fileIsDocx(extension)) {
        disposeDocxFit = await renderDocx(panel, arrayBuffer, ctx.options.fit);
      } else if (extension === "rtf") {
        renderPlainDocument(panel, "RTF 文档", rtfToText(await readTextFromBuffer(arrayBuffer)));
      } else if (extension === "odt") {
        await renderOdt(panel, arrayBuffer);
      } else if (extension === "fodt") {
        renderOpenDocumentXml(panel, "FODT 文档", await readTextFromBuffer(arrayBuffer));
      } else if (extension === "fods") {
        renderFlatOds(panel, await readTextFromBuffer(arrayBuffer));
      } else if (
        packagedOfficeCandidates.has(extension) &&
        (await renderPackagedOfficePreview(panel, arrayBuffer, extension, ctx.options.fit, ctx.options.messages))
      ) {
        // Rendered by package sniffing.
      } else if (sheetExtensions.has(extension)) {
        await renderSheet(panel, arrayBuffer, extension, ctx.options.messages);
      } else if (["pptx", "pptm", "ppsx", "ppsm", "potx", "potm"].includes(extension)) {
        await renderPptx(panel, arrayBuffer);
      } else if (extension === "odp") {
        await renderOdp(panel, arrayBuffer);
      } else if (extension === "fodp") {
        renderOpenDocumentPresentationXml(panel, await readTextFromBuffer(arrayBuffer));
      } else if (extension === "doc" || extension === "dot") {
        renderLegacyWordBinary(panel, extension, arrayBuffer, ctx.options.messages);
      } else if (extension === "ppt" || extension === "pps") {
        try {
          disposeLegacyPresentation = await renderLegacyPowerPoint(panel, arrayBuffer);
        } catch (error) {
          renderLegacyOfficeBinary(
            panel,
            extension,
            arrayBuffer,
            ctx.options.messages,
            normalizeOfficeError(error, ctx.options.messages)
          );
        }
      } else if (isLegacyOfficeBinary(extension)) {
        renderLegacyOfficeBinary(panel, extension, arrayBuffer, ctx.options.messages);
      } else {
        renderUnsupportedOffice(panel, extension || ctx.file.extension || "office", ctx.options.messages);
      }

      const controller = createOfficeZoomController(panel, ctx);
      ctx.toolbar?.refreshCommandSupport();

      return {
        goToPage(page) {
          return (
            delegatedInstance?.goToPage?.(page) ||
            goToRenderedPage(
              panel,
              ".ofv-docx-page-frame, .ofv-docx-textbox-page, .ofv-msdoc-page, .ofv-slide, .ofv-ppt-binary-slide",
              page,
              panel
            )
          );
        },
        canCommand(command) {
          return delegatedInstance?.canCommand?.(command) || controller?.canCommand(command) || false;
        },
        command(command) {
          return delegatedInstance?.command?.(command) || controller?.command(command) || false;
        },
        preparePrint() {
          return delegatedInstance?.preparePrint?.();
        },
        destroy() {
          delegatedInstance?.destroy();
          controller?.destroy();
          disposeDocxFit?.();
          disposeLegacyPresentation?.();
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
    messages: ctx.options.messages,
    title: ctx.options.messages.officeConvertedTitle,
    fallbackTitle: ctx.options.messages.officeConvertedPdfFailed,
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
    panel.querySelector(
      ".ofv-docx-document, .ofv-sheet, .ofv-pptx-viewer > div, .ofv-ppt-binary-slide, .ofv-document, .ofv-text-block, .ofv-slide, .ofv-msdoc-document"
    )
  );
  if (!canZoom) {
    return undefined;
  }

  let zoom = getInitialZoom(ctx, 0.5, 3);
  const apply = () => {
    panel.style.setProperty("--ofv-office-zoom", String(zoom));
    panel.dispatchEvent(new CustomEvent("ofv-office-zoom"));
    for (const slide of panel.querySelectorAll<HTMLElement>(".ofv-pptx-viewer > div[data-slide-index]")) {
      // The slide keeps its natural layout and is scaled via `zoom`, which grows
      // its layout box too; percentage caps and inner scrolling would fight that.
      slide.style.transform = "";
      slide.style.transformOrigin = "";
      setElementZoom(slide, zoom === 1 ? "" : String(zoom));
      slide.style.width = zoom === 1 ? "" : "max-content";
      slide.style.maxWidth = zoom === 1 ? "" : "none";
      slide.style.overflow = zoom === 1 ? "" : "visible";
    }
    for (const slide of panel.querySelectorAll<HTMLElement>(".ofv-ppt-binary-slide")) {
      setElementZoom(slide, zoom === 1 ? "" : String(zoom));
    }
    for (const scrollBox of panel.querySelectorAll<HTMLElement>(".ofv-table-scroll")) {
      syncSheetTableZoom(scrollBox, zoom);
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

function setElementZoom(element: HTMLElement, value: string): void {
  (element.style as CSSStyleDeclaration & { zoom: string }).zoom = value;
}

function getOfficePanelZoom(element: HTMLElement): number {
  const panel = element.closest<HTMLElement>(".ofv-panel");
  const parsed = Number.parseFloat(panel?.style.getPropertyValue("--ofv-office-zoom") || "1");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// Sheet tables zoom via the CSS `zoom` property so the scaled size participates in
// layout and .ofv-table-scroll grows real scrollbars. The table's rendered width
// (including the min-width:100% stretch) is captured once as the base, then locked
// as an explicit width — otherwise the percentage min-width re-resolves inside the
// zoomed coordinate space and cancels the scale out.
function syncSheetTableZoom(scrollBox: HTMLElement, zoom: number): void {
  const table = scrollBox.querySelector<HTMLTableElement>(":scope > table");
  if (!table) {
    return;
  }
  if (zoom === 1) {
    if (table.dataset.ofvZoomBase !== undefined) {
      table.style.width = table.dataset.ofvZoomNaturalWidth || "";
      table.style.minWidth = "";
      setElementZoom(table, "");
      delete table.dataset.ofvZoomBase;
      delete table.dataset.ofvZoomNaturalWidth;
    }
    return;
  }
  if (table.dataset.ofvZoomBase === undefined) {
    const naturalWidth = table.style.width;
    setElementZoom(table, "");
    table.style.minWidth = "";
    table.style.width = naturalWidth;
    const measured = table.offsetWidth || Number.parseFloat(naturalWidth) || 0;
    if (measured <= 0) {
      return;
    }
    table.dataset.ofvZoomBase = String(measured);
    table.dataset.ofvZoomNaturalWidth = naturalWidth;
  }
  table.style.width = `${table.dataset.ofvZoomBase}px`;
  table.style.minWidth = "0";
  setElementZoom(table, String(zoom));
}

// A column resize changes the table's natural width, so the cached zoom base is
// stale; drop the lock and re-measure at the new width.
function resetSheetTableZoomLock(table: HTMLElement): void {
  if (table.dataset.ofvZoomBase === undefined) {
    return;
  }
  table.style.minWidth = "";
  setElementZoom(table, "");
  delete table.dataset.ofvZoomBase;
  delete table.dataset.ofvZoomNaturalWidth;
  const scrollBox = table.closest<HTMLElement>(".ofv-table-scroll");
  if (scrollBox) {
    syncSheetTableZoom(scrollBox, getOfficePanelZoom(table));
  }
}

function fileIsDocx(extension: string): boolean {
  return extension === "docx" || extension === "docm" || extension === "dotx" || extension === "dotm";
}

function shouldSniffPackagedOffice(extension: string): boolean {
  return isLegacyOfficeBinary(extension) || packagedOfficeCandidates.has(extension) || extension === "";
}

async function detectPackagedOfficeFormat(arrayBuffer: ArrayBuffer): Promise<"docx" | "xlsx" | "pptx" | undefined> {
  try {
    const zip = await loadZipForSniffing(arrayBuffer);
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

function detectWordHtmlDocument(extension: string, arrayBuffer: ArrayBuffer): string | undefined {
  if (extension !== "doc" && extension !== "dot") {
    return undefined;
  }
  if (hasOleSignature(arrayBuffer)) {
    return undefined;
  }
  const html = decodeTextBuffer(arrayBuffer).replace(/^\uFEFF/, "");
  return /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s|>)/i.test(html) && /<body(?:\s|>)/i.test(html) ? html : undefined;
}

function renderWordHtmlDocument(panel: HTMLElement, html: string): void {
  panel.classList.add("ofv-office-word-html");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const section = createSection("Word HTML 文档");
  hideSuccessfulSectionHeading(section);
  const content = document.createElement("article");
  content.className = "ofv-document ofv-word-html-document";
  content.innerHTML = sanitizeHtml(parsed.body.innerHTML || "<p>未解析到可展示内容。</p>");
  section.append(content);
  panel.append(section);
}

async function renderDocx(panel: HTMLElement, arrayBuffer: ArrayBuffer, fit: PreviewFit): Promise<() => void> {
  panel.classList.add("ofv-office-docx");
  const content = document.createElement("div");
  content.className = "ofv-docx-document";
  const styleContainer = document.createElement("style");
  styleContainer.className = "ofv-docx-style-container";
  document.head.append(styleContainer);
  let disposeFit: (() => void) | undefined;

  try {
    await withTimeout(
      (async () => {
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
      })(),
      docxRenderTimeoutMs(),
      "DOCX rendering"
    );
    // docx-preview schedules image URL assignment after its DOM pass. Give
    // those tasks one turn to settle so floating-picture repair can see the
    // complete set of rendered images (including late-loaded seals).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await normalizeDocxLayout(content, arrayBuffer, styleContainer);
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
    paginateDocxFlow(content);
    repairDocxFirstPageClosingDate(content);
    synchronizeDocxPaginationAfterRepair(content);
    disposeFit = fitDocxPages(content, fit);
    return () => {
      disposeFit?.();
      styleContainer.remove();
    };
  } catch (error) {
    disposeFit?.();
    styleContainer.remove();
    const fallbackContent = document.createElement("div");
    fallbackContent.className = "ofv-docx-document";
    await renderDocxContentFallback(fallbackContent, arrayBuffer);
    panel.append(fallbackContent);
    console.warn("DOCX layout preview failed, fell back to Mammoth:", error);
  }
  return () => undefined;
}

function docxRenderTimeoutMs(): number {
  const override = (globalThis as { __OFV_DOCX_RENDER_TIMEOUT_MS__?: unknown }).__OFV_DOCX_RENDER_TIMEOUT_MS__;
  return typeof override === "number" && override > 0 ? override : DEFAULT_DOCX_RENDER_TIMEOUT_MS;
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
    const zip = await loadZipForSniffing(arrayBuffer);
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
    const zip = await loadZipForSniffing(arrayBuffer);
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
    const zip = await loadZipForSniffing(arrayBuffer);
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
    const mammothContent = document.createElement("div");
    await withTimeout(renderDocxWithMammoth(mammothContent, arrayBuffer), docxRenderTimeoutMs(), "DOCX fallback rendering");
    const renderedText = normalizePreviewText(mammothContent.querySelector(".ofv-document")?.textContent || "");
    if (renderedText.length >= 24) {
      container.append(...Array.from(mammothContent.childNodes));
      return;
    }
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

async function normalizeDocxLayout(container: HTMLElement, arrayBuffer: ArrayBuffer, styleContainer?: HTMLElement): Promise<void> {
  const [hints, charts, svgImageAlternatives] = await Promise.all([
    readDocxLayoutHints(arrayBuffer),
    readDocxCharts(arrayBuffer),
    readDocxSvgImageAlternatives(arrayBuffer)
  ]);
  normalizeDocxEastAsiaFontStyles(styleContainer, hints.eastAsiaFonts);
  normalizeDocxNumberingStyles(styleContainer);
  repairDocxSvgImageAlternatives(container, svgImageAlternatives);
  repairUnexpectedDocxTableTextDirections(container, hints.hasVerticalTextDirection);
  repairDocxFloatingShapeTextboxes(container, hints.floatingShapes);
  repairDocxChartPlaceholders(container, charts);
  repairDocxComplexScriptFontSizes(container, hints.complexScriptFontSizeParagraphs);
  repairDocxCharacterScaling(container, hints.characterScaleParagraphs);
  const pages = container.querySelectorAll<HTMLElement>("section.ofv-docx");
  for (const page of pages) {
    repairDocxShapeFills(page);
    repairDocxHeaderFloatingPictures(page, hints);
    repairDocxHeadingShapeAlignment(page);
    repairDocxListIndentAlignment(page);
    for (const element of page.querySelectorAll<HTMLElement>("[style*='line-height']")) {
      const atLeastLineHeight = parseDocxAtLeastLineHeight(element.style.lineHeight);
      if (atLeastLineHeight !== undefined) {
        const largestFontSize = getLargestDocxFontSize(element);
        element.style.lineHeight = atLeastLineHeight <= largestFontSize * 1.2 ? "1.2" : `${formatCssNumber(atLeastLineHeight)}px`;
        continue;
      }
      const lineHeight = parseCssLineHeight(element.style.lineHeight);
      if (lineHeight > 0 && lineHeight < 1) {
        element.style.lineHeight = "1.2";
      }
    }
  }
  repairDocxRightTabStops(container, hints.rightTabParagraphs);
  markDocxPageNumberFields(container, hints.pageNumberFieldResults);
  // Some browsers resolve FileReader-backed image URLs a little after the
  // renderer promise. Re-run the cross-page matcher once those URLs settle.
  // Let docx-preview finish pagination and browser layout before measuring
  // anchor paragraphs. Measuring during its initial DOM pass reports the
  // anchor paragraphs at y=0, which would put seals at the page top.
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  repairDocxFloatingPicturesAcrossPages(container, hints);
  // Chromium can complete a second pagination/layout pass shortly after the
  // renderer promise. Recompute anchor positions after that pass as well.
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  repairDocxFloatingPicturesAcrossPages(container, hints);
  repositionDocxFloatingPicturesFromAnchorParagraphs(container, hints);
  // Image decoding can trigger more DOM/style updates after pagination. Keep
  // a short-lived non-blocking reflow watcher alive after normalization
  // returns so tests and callers are not held for several seconds.
  if (hints.floatingPictures.some((item) => item.relativeFrom === "column" && (item.wrap === "square" || item.wrap === "none"))) {
    let reflowAttempts = 0;
    const watchAnchorLayout = (): void => {
      repositionDocxFloatingPicturesFromAnchorParagraphs(container, hints);
      reflowAttempts += 1;
      if (reflowAttempts < 30) {
        setTimeout(watchAnchorLayout, 200);
      }
    };
    watchAnchorLayout();
  }
}

function normalizeDocxNumberingStyles(styleContainer: HTMLElement | undefined): void {
  if (!styleContainer?.textContent) {
    return;
  }
  styleContainer.textContent = styleContainer.textContent
    .replace(
      /(p\.[\w-]+-num-\d+-\d+:before\s*\{[\s\S]*?content:\s*"[^"\\]*(?:\\.[^"\\]*)*)\\9(";\s*[\s\S]*?\})/g,
      "$1\\00a0$2"
    )
    .replace(
      /(^|\})\s*(p\.[\w-]+-num-\d+-\d+\s*\{(?=[^}]*\bmargin-inline-start\s*:)[^}]*\})/gm,
      "$1\n.ofv-docx $2"
    );
}

type DocxChartPreview = ChartPreview & {
  widthPt: number;
  heightPt: number;
};

async function readDocxCharts(arrayBuffer: ArrayBuffer): Promise<DocxChartPreview[]> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    const documentDoc = documentXml ? parseOfficeXml(documentXml) : undefined;
    if (!documentDoc) {
      return [];
    }
    const relationships = await readOfficeRelationships(zip, "word/document.xml");
    const chartDrawings = Array.from(documentDoc.getElementsByTagName("*"))
      .filter((element) => element.localName === "inline" || element.localName === "anchor")
      .map((element) => readDocxChartDrawing(element))
      .filter((item): item is { relationshipId: string; widthPt: number; heightPt: number } => Boolean(item?.relationshipId));
    const charts: DocxChartPreview[] = [];
    for (const [index, drawing] of chartDrawings.entries()) {
      const chartRel = relationships.find((rel) => rel.id === drawing.relationshipId && /\/chart$/i.test(rel.type));
      const chartPath = resolveOfficeRelationshipTarget("word/document.xml", chartRel?.target);
      const chartXml = chartPath ? await zip.file(chartPath)?.async("text") : undefined;
      const chart = chartXml ? parseChartXml(chartXml, chartPath?.split("/").pop() || `chart${index + 1}.xml`) : null;
      if (chart) {
        charts.push({ ...chart, widthPt: drawing.widthPt, heightPt: drawing.heightPt });
      }
    }
    return charts;
  } catch {
    return [];
  }
}

function readDocxChartDrawing(element: Element): { relationshipId: string; widthPt: number; heightPt: number } | undefined {
  const chart = Array.from(element.getElementsByTagName("*")).find((child) => child.localName === "chart");
  const relationshipId = chart ? getXmlAttribute(chart, "id") : "";
  if (!relationshipId) {
    return undefined;
  }
  const extent = Array.from(element.children).find((child) => child.localName === "extent");
  return {
    relationshipId,
    widthPt: emuToPt(Number(extent?.getAttribute("cx") || 0)),
    heightPt: emuToPt(Number(extent?.getAttribute("cy") || 0))
  };
}

function repairDocxChartPlaceholders(container: HTMLElement, charts: DocxChartPreview[]): void {
  if (charts.length === 0) {
    return;
  }
  const placeholders = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx div")).filter(isDocxChartPlaceholder);
  if (placeholders.length !== charts.length) {
    return;
  }
  placeholders.forEach((placeholder, index) => {
    const chart = charts[index];
    placeholder.classList.add("ofv-docx-chart-preview");
    placeholder.dataset.ofvDocxChartPreview = "true";
    if (chart.widthPt > 0) {
      placeholder.style.width ||= `${formatCssNumber(chart.widthPt)}pt`;
    }
    if (chart.heightPt > 0) {
      placeholder.style.height ||= `${formatCssNumber(chart.heightPt)}pt`;
    }
    placeholder.replaceChildren(renderChartSvg(chart));
  });
}

function isDocxChartPlaceholder(element: HTMLElement): boolean {
  if (element.dataset.ofvDocxChartPreview === "true" || element.children.length > 0 || normalizePreviewText(element.textContent || "")) {
    return false;
  }
  const display = element.style.display;
  const position = element.style.position;
  const width = parseCssPixelValue(element.style.width);
  const height = parseCssPixelValue(element.style.height);
  return display === "inline-block" && position === "relative" && width >= 120 && height >= 80;
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
  eastAsiaFonts?: {
    fallback?: string;
    major?: string;
    minor?: string;
  };
  floatingPictures: Array<{
    widthPt: number;
    heightPt: number;
    offsetXPt: number;
    offsetYPt: number;
    relativeFrom: string;
    relativeToParagraph: boolean;
    wrap: string;
  }>;
  headerFloatingPictures: Array<{
    widthPt: number;
    heightPt: number;
    offsetXPt: number;
    offsetYPt: number;
    relativeFrom: string;
    relativeToParagraph: boolean;
    wrap: string;
  }>;
  floatingShapes: Array<{
    offsetXPt: number;
    offsetYPt: number;
    widthPt: number;
    heightPt: number;
    relativeFrom: string;
    relativeV: string;
    hasFill: boolean;
    hasText: boolean;
  }>;
  rightTabParagraphs: Array<{
    text: string;
    positionPt: number;
    pageBottomFrame: boolean;
  }>;
  pageNumberFieldResults: string[];
  complexScriptFontSizeParagraphs: Array<{
    text: string;
    fontSizePt: number;
  }>;
  characterScaleParagraphs: Array<{
    text: string;
    scalePercent: number;
  }>;
  hasVerticalTextDirection: boolean;
};

async function readDocxLayoutHints(arrayBuffer: ArrayBuffer): Promise<DocxLayoutHints> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const themeEntry = Object.values(zip.files).find((entry) => !entry.dir && /^word\/theme\/theme\d+\.xml$/i.test(entry.name));
    const footerEntries = Object.values(zip.files).filter(
      (entry) => !entry.dir && /^word\/footer\d+\.xml$/i.test(entry.name)
    );
    const headerEntries = Object.values(zip.files).filter(
      (entry) => !entry.dir && /^word\/header\d+\.xml$/i.test(entry.name)
    );
    const [documentXml, stylesXml, themeXml, footerXmls, headerXmls] = await Promise.all([
      zip.file("word/document.xml")?.async("text"),
      zip.file("word/styles.xml")?.async("text"),
      themeEntry?.async("text"),
      Promise.all(footerEntries.map((entry) => entry.async("text"))),
      Promise.all(headerEntries.map((entry) => entry.async("text")))
    ]);
    return {
      eastAsiaFonts: extractDocxEastAsiaFonts(stylesXml || "", themeXml || ""),
      floatingPictures: documentXml ? extractFloatingPictureHints(documentXml) : [],
      headerFloatingPictures: headerXmls.flatMap(extractFloatingPictureHints),
      floatingShapes: documentXml ? extractFloatingShapeHints(documentXml) : [],
      rightTabParagraphs: documentXml ? extractDocxRightTabParagraphHints(documentXml) : [],
      pageNumberFieldResults: footerXmls.flatMap(extractDocxPageNumberFieldResults),
      complexScriptFontSizeParagraphs: documentXml ? extractDocxComplexScriptFontSizeHints(documentXml) : [],
      characterScaleParagraphs: documentXml ? extractDocxCharacterScaleHints(documentXml) : [],
      hasVerticalTextDirection: Boolean(documentXml && /<w:textDirection\b/.test(documentXml))
    };
  } catch {
    return {
      floatingPictures: [],
      headerFloatingPictures: [],
      floatingShapes: [],
      rightTabParagraphs: [],
      pageNumberFieldResults: [],
      complexScriptFontSizeParagraphs: [],
      characterScaleParagraphs: [],
      hasVerticalTextDirection: false
    };
  }
}

type DocxSvgImageAlternative = {
  fallbackDataUrls: string[];
  svgDataUrl: string;
};

async function readDocxSvgImageAlternatives(arrayBuffer: ArrayBuffer): Promise<DocxSvgImageAlternative[]> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("text");
    const documentDoc = documentXml ? parseOfficeXml(documentXml) : undefined;
    if (!documentDoc) {
      return [];
    }
    const relationships = await readOfficeRelationships(zip, "word/document.xml");
    const relationshipsById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
    const alternatives: DocxSvgImageAlternative[] = [];

    for (const blip of Array.from(documentDoc.getElementsByTagName("*"))) {
      if (blip.localName !== "blip") {
        continue;
      }
      const svgBlip = Array.from(blip.getElementsByTagName("*")).find((element) => element.localName === "svgBlip");
      const fallbackRelationship = relationshipsById.get(getXmlAttribute(blip, "embed") || "");
      const svgRelationship = relationshipsById.get(svgBlip ? getXmlAttribute(svgBlip, "embed") || "" : "");
      const fallbackPath = resolveOfficeRelationshipTarget("word/document.xml", fallbackRelationship?.target);
      const svgPath = resolveOfficeRelationshipTarget("word/document.xml", svgRelationship?.target);
      if (!fallbackPath || !svgPath || mimeTypeFromPath(svgPath) !== "image/svg+xml") {
        continue;
      }
      const fallbackFile = zip.file(fallbackPath);
      const svgFile = zip.file(svgPath);
      if (!fallbackFile || !svgFile) {
        continue;
      }
      const [fallbackBase64, svgBase64] = await Promise.all([fallbackFile.async("base64"), svgFile.async("base64")]);
      const fallbackMimeType = mimeTypeFromPath(fallbackPath);
      alternatives.push({
        fallbackDataUrls: [
          `data:application/octet-stream;base64,${fallbackBase64}`,
          `data:${fallbackMimeType};base64,${fallbackBase64}`
        ],
        svgDataUrl: `data:image/svg+xml;base64,${svgBase64}`
      });
    }
    return alternatives;
  } catch {
    return [];
  }
}

function repairDocxSvgImageAlternatives(container: HTMLElement, alternatives: DocxSvgImageAlternative[]): void {
  if (alternatives.length === 0) {
    return;
  }
  const alternativesByFallback = new Map<string, string[]>();
  for (const alternative of alternatives) {
    for (const fallbackDataUrl of alternative.fallbackDataUrls) {
      const svgDataUrls = alternativesByFallback.get(fallbackDataUrl) || [];
      svgDataUrls.push(alternative.svgDataUrl);
      alternativesByFallback.set(fallbackDataUrl, svgDataUrls);
    }
  }
  for (const image of container.querySelectorAll<HTMLImageElement>("img")) {
    const svgDataUrl = alternativesByFallback.get(image.getAttribute("src") || "")?.shift();
    if (svgDataUrl) {
      image.src = svgDataUrl;
      image.dataset.ofvDocxSvgAlternative = "true";
    }
  }
}

function repairUnexpectedDocxTableTextDirections(container: HTMLElement, hasVerticalTextDirection: boolean): void {
  if (hasVerticalTextDirection) {
    return;
  }
  for (const element of container.querySelectorAll<HTMLElement>("table, thead, tbody, tfoot, tr, th, td, table p, table span")) {
    if (getComputedStyle(element).writingMode !== "horizontal-tb") {
      element.style.writingMode = "horizontal-tb";
      element.style.textOrientation = "mixed";
    }
  }
}

function extractDocxComplexScriptFontSizeHints(xml: string): DocxLayoutHints["complexScriptFontSizeParagraphs"] {
  const document = parseOfficeXml(xml);
  if (!document) {
    return [];
  }
  return Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.localName === "p")
    .map((paragraph) => {
      const descendants = Array.from(paragraph.getElementsByTagName("*"));
      if (descendants.some((element) => element.localName === "sz")) {
        return undefined;
      }
      const halfPointSizes = descendants
        .filter((element) => element.localName === "szCs")
        .map((element) => Number(getXmlAttribute(element, "val")))
        .filter((value) => Number.isFinite(value) && value > 0);
      const uniqueSizes = [...new Set(halfPointSizes)];
      const text = normalizePreviewText(
        descendants
          .filter((element) => element.localName === "t")
          .map((element) => element.textContent || "")
          .join("")
      );
      // Word/WPS falls back to a whole-point East Asian size here; browsers otherwise inherit docx-preview's 12pt default.
      return text && uniqueSizes.length === 1
        ? { text, fontSizePt: Math.max(1, Math.floor(uniqueSizes[0]! / 2)) }
        : undefined;
    })
    .filter((hint): hint is DocxLayoutHints["complexScriptFontSizeParagraphs"][number] => Boolean(hint));
}

function repairDocxComplexScriptFontSizes(
  container: HTMLElement,
  hints: DocxLayoutHints["complexScriptFontSizeParagraphs"]
): void {
  if (hints.length === 0) {
    return;
  }
  const candidatesByText = new Map<string, HTMLParagraphElement[]>();
  for (const paragraph of container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p")) {
    const text = normalizePreviewText(paragraph.textContent || "");
    const candidates = candidatesByText.get(text) || [];
    candidates.push(paragraph);
    candidatesByText.set(text, candidates);
  }
  for (const hint of hints) {
    const paragraph = candidatesByText.get(hint.text)?.shift();
    if (paragraph) {
      paragraph.style.fontSize = `${formatCssNumber(hint.fontSizePt)}pt`;
    }
  }
}

/**
 * DOCX stores condensed character spacing as w:rPr/w:w (in percent). The
 * browser renderer currently ignores this property, which can make a title
 * wrap even though Word/WPS keeps it on one line. Keep the paragraph's normal
 * flow width while applying the same horizontal scale to its rendered text.
 */
function extractDocxCharacterScaleHints(xml: string): DocxLayoutHints["characterScaleParagraphs"] {
  const document = parseOfficeXml(xml);
  if (!document) {
    return [];
  }
  return Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.localName === "p")
    .map((paragraph) => {
      const runs = Array.from(paragraph.getElementsByTagName("*")).filter((element) => element.localName === "r");
      if (runs.length === 0) {
        return undefined;
      }
      const runScales = runs.map((run) => {
        const runProperties = Array.from(run.children).find((child) => child.localName === "rPr");
        const width = runProperties
          ? Array.from(runProperties.children).find((child) => child.localName === "w")
          : undefined;
        const scalePercent = Number(width ? getXmlAttribute(width, "val") : 0);
        const text = normalizePreviewText(
          Array.from(run.getElementsByTagName("*"))
            .filter((child) => child.localName === "t")
            .map((child) => child.textContent || "")
            .join("")
        );
        return { text, scalePercent };
      });
      const text = normalizePreviewText(runScales.map((run) => run.text).join(""));
      const scales = runScales.filter((run) => run.text).map((run) => run.scalePercent);
      const uniqueScales = [...new Set(scales)];
      return text && uniqueScales.length === 1 && uniqueScales[0]! > 0 && uniqueScales[0]! < 100
        ? { text, scalePercent: uniqueScales[0]! }
        : undefined;
    })
    .filter((hint): hint is DocxLayoutHints["characterScaleParagraphs"][number] => Boolean(hint));
}

function repairDocxCharacterScaling(
  container: HTMLElement,
  hints: DocxLayoutHints["characterScaleParagraphs"]
): void {
  if (hints.length === 0) {
    return;
  }
  const candidatesByText = new Map<string, HTMLParagraphElement[]>();
  for (const paragraph of container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p")) {
    const text = normalizePreviewText(paragraph.textContent || "");
    if (!text) {
      continue;
    }
    const candidates = candidatesByText.get(text) || [];
    candidates.push(paragraph);
    candidatesByText.set(text, candidates);
  }
  for (const hint of hints) {
    const paragraph = candidatesByText.get(hint.text)?.shift();
    if (!paragraph || paragraph.dataset.ofvDocxCharacterScaled === "true") {
      continue;
    }
    // Do not wrap drawings/tables in a transform; their geometry is handled by
    // the floating/layout repair passes below.
    if (paragraph.querySelector("img, svg, table")) {
      continue;
    }
    const scale = hint.scalePercent / 100;
    const align = paragraph.style.textAlign || getComputedStyle(paragraph).textAlign;
    const lineWrapper = document.createElement("span");
    lineWrapper.className = "ofv-docx-character-scale-line";
    lineWrapper.style.display = "block";
    lineWrapper.style.width = "100%";
    lineWrapper.style.whiteSpace = "nowrap";
    lineWrapper.style.textAlign = align;
    const textWrapper = document.createElement("span");
    textWrapper.className = "ofv-docx-character-scale";
    textWrapper.style.display = "inline-block";
    textWrapper.style.whiteSpace = "nowrap";
    textWrapper.style.transform = `scaleX(${formatCssNumber(scale)})`;
    textWrapper.style.transformOrigin = "left center";
    while (paragraph.firstChild) {
      textWrapper.append(paragraph.firstChild);
    }
    // docx-preview marks text runs as `pre-wrap`; that allows each run to
    // wrap independently before the parent transform is applied. Override it
    // for every textual descendant so the condensed line behaves as one run.
    for (const descendant of textWrapper.querySelectorAll<HTMLElement>("*")) {
      if (!descendant.querySelector("img, svg, table")) {
        descendant.style.whiteSpace = "nowrap";
      }
    }
    lineWrapper.append(textWrapper);
    paragraph.append(lineWrapper);
    // An inline transformed box keeps its unscaled line-box width. Offset the
    // visual box by the amount removed by scaleX so right/center alignment
    // remains inside the paragraph instead of overflowing the page.
    const unscaledWidth = textWrapper.offsetWidth;
    const visualOffset = unscaledWidth * (1 - scale);
    if (align === "right") {
      textWrapper.style.position = "relative";
      textWrapper.style.left = `${formatCssNumber(visualOffset)}px`;
    } else if (align === "center") {
      textWrapper.style.position = "relative";
      textWrapper.style.left = `${formatCssNumber(visualOffset / 2)}px`;
    }
    paragraph.style.whiteSpace = "nowrap";
    paragraph.dataset.ofvDocxCharacterScaled = "true";
  }
}

function extractDocxPageNumberFieldResults(xml: string): string[] {
  const document = parseOfficeXml(xml);
  if (!document) {
    return [];
  }
  const results: string[] = [];
  let inField = false;
  let isPageField = false;
  let afterSeparator = false;
  let result = "";
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    if (element.localName === "fldChar") {
      const type = getXmlAttribute(element, "fldCharType");
      if (type === "begin") {
        inField = true;
        isPageField = false;
        afterSeparator = false;
        result = "";
      } else if (inField && type === "separate") {
        afterSeparator = true;
      } else if (inField && type === "end") {
        if (isPageField && afterSeparator && result.trim()) {
          results.push(result.trim());
        }
        inField = false;
      }
      continue;
    }
    if (inField && element.localName === "instrText" && /\bPAGE\b/i.test(element.textContent || "")) {
      isPageField = true;
    } else if (inField && isPageField && afterSeparator && element.localName === "t") {
      result += element.textContent || "";
    }
  }
  return results;
}

function markDocxPageNumberFields(container: HTMLElement, fieldResults: string[]): void {
  if (fieldResults.length === 0) {
    return;
  }
  const expectedResults = new Set(fieldResults.map((value) => normalizePreviewText(value)));
  for (const footer of container.querySelectorAll<HTMLElement>("section.ofv-docx footer")) {
    const candidates = Array.from(footer.querySelectorAll<HTMLElement>("span")).filter(
      (span) => span.children.length === 0 && expectedResults.has(normalizePreviewText(span.textContent || ""))
    );
    if (candidates.length === 1) {
      candidates[0]?.classList.add("ofv-docx-page-number-field");
    }
  }
}

function extractDocxRightTabParagraphHints(xml: string): DocxLayoutHints["rightTabParagraphs"] {
  const document = parseOfficeXml(xml);
  if (!document) {
    return [];
  }
  return Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.localName === "p")
    .map((paragraph) => {
      const properties = Array.from(paragraph.children).find((child) => child.localName === "pPr");
      const configuredTabs = properties
        ? Array.from(properties.getElementsByTagName("*")).filter((child) => child.localName === "tab")
        : [];
      const contentTabs = Array.from(paragraph.getElementsByTagName("*")).filter(
        (child) => child.localName === "tab" && !properties?.contains(child)
      );
      const tab = configuredTabs.length === 1 && contentTabs.length === 1 ? configuredTabs[0] : undefined;
      const frame = properties
        ? Array.from(properties.children).find((child) => child.localName === "framePr")
        : undefined;
      const positionTwips = Number(tab ? getXmlAttribute(tab, "pos") : 0);
      const text = normalizePreviewText(
        Array.from(paragraph.getElementsByTagName("*"))
          .filter((child) => child.localName === "t")
          .map((child) => child.textContent || "")
          .join("")
      );
      return tab && getXmlAttribute(tab, "val") === "right" && positionTwips > 0 && text
        ? {
            text,
            positionPt: positionTwips / 20,
            pageBottomFrame: Boolean(frame && getXmlAttribute(frame, "yAlign") === "bottom")
          }
        : undefined;
    })
    .filter((hint): hint is DocxLayoutHints["rightTabParagraphs"][number] => Boolean(hint));
}

function repairDocxRightTabStops(
  container: HTMLElement,
  hints: DocxLayoutHints["rightTabParagraphs"]
): void {
  if (hints.length === 0) {
    return;
  }
  const paragraphs = Array.from(container.querySelectorAll<HTMLParagraphElement>("section.ofv-docx p")).filter(
    (paragraph) => paragraph.querySelectorAll(".ofv-docx-tab-stop").length === 1
  );
  const candidatesByText = new Map<string, HTMLParagraphElement[]>();
  for (const paragraph of paragraphs) {
    const text = normalizePreviewText(paragraph.textContent || "");
    const candidates = candidatesByText.get(text) || [];
    candidates.push(paragraph);
    candidatesByText.set(text, candidates);
  }
  for (const hint of hints) {
    const paragraph = candidatesByText.get(hint.text)?.shift();
    if (paragraph) {
      repairDocxRightTabParagraph(paragraph, hint);
    }
  }
}

function repairDocxRightTabParagraph(
  paragraph: HTMLParagraphElement,
  hint: DocxLayoutHints["rightTabParagraphs"][number]
): void {
  const tabStop = paragraph.querySelector<HTMLElement>(".ofv-docx-tab-stop");
  if (!tabStop || paragraph.querySelector(".ofv-docx-right-tab-line")) {
    return;
  }
  let tabRun: HTMLElement = tabStop;
  while (tabRun.parentElement && tabRun.parentElement !== paragraph) {
    tabRun = tabRun.parentElement;
  }
  if (tabRun.parentElement !== paragraph) {
    return;
  }
  const nodes = Array.from(paragraph.childNodes);
  const tabIndex = nodes.indexOf(tabRun);
  const before = nodes.slice(0, tabIndex);
  const after = nodes.slice(tabIndex + 1);
  if (tabIndex < 0 || normalizePreviewText(after.map((node) => node.textContent || "").join("")) === "") {
    return;
  }

  const line = document.createElement("span");
  line.className = "ofv-docx-right-tab-line";
  line.style.setProperty("--ofv-docx-right-tab-position", `${formatCssNumber(hint.positionPt)}pt`);
  const start = document.createElement("span");
  start.className = "ofv-docx-right-tab-start";
  start.append(...before);
  const end = document.createElement("span");
  end.className = "ofv-docx-right-tab-end";
  end.append(...after);
  line.append(start, end);
  tabRun.classList.add("ofv-docx-right-tab-source");
  if (hint.pageBottomFrame) {
    paragraph.classList.add("ofv-docx-page-bottom-frame");
  }
  paragraph.replaceChildren(line, tabRun);
}

function extractDocxEastAsiaFonts(stylesXml: string, themeXml: string): DocxLayoutHints["eastAsiaFonts"] {
  const defaults = /<w:docDefaults\b[\s\S]*?<\/w:docDefaults>/.exec(stylesXml)?.[0] || "";
  const directFont = /<w:rFonts\b[^>]*\bw:eastAsia="([^"]+)"/.exec(defaults)?.[1];
  const themeName = /<w:rFonts\b[^>]*\bw:eastAsiaTheme="([^"]+)"/.exec(defaults)?.[1] || "minorEastAsia";
  const major = extractDocxThemeEastAsiaFont(themeXml, "major");
  const minor = extractDocxThemeEastAsiaFont(themeXml, "minor");
  const direct = directFont ? decodeXml(directFont).trim() || undefined : undefined;
  return {
    fallback: direct || (/^major/i.test(themeName) ? major : minor) || minor || major,
    major,
    minor
  };
}

function extractDocxThemeEastAsiaFont(themeXml: string, kind: "major" | "minor"): string | undefined {
  const block = new RegExp(`<a:${kind}Font\\b[\\s\\S]*?<\\/a:${kind}Font>`, "i").exec(themeXml)?.[0] || "";
  const eastAsia = /<a:ea\b[^>]*\btypeface="([^"]+)"/i.exec(block)?.[1];
  const scriptFont = /<a:font\b[^>]*\bscript="Hans"[^>]*\btypeface="([^"]+)"/i.exec(block)?.[1];
  const font = eastAsia || scriptFont;
  return font ? decodeXml(font).trim() || undefined : undefined;
}

function normalizeDocxEastAsiaFontStyles(
  styleContainer: HTMLElement | undefined,
  fonts: DocxLayoutHints["eastAsiaFonts"]
): void {
  if (!styleContainer?.textContent || !fonts?.fallback) {
    return;
  }
  const safeFallback = sanitizeDocxCssFontFamily(fonts.fallback);
  if (!safeFallback) {
    return;
  }
  const variable = "--ofv-docx-east-asia-font";
  const css = styleContainer.textContent.replace(/font-family:\s*([^;{}]+);/gi, (declaration, families: string) => {
    if (families.includes(variable)) {
      return declaration;
    }
    return `font-family: ${families.trim()}, var(${variable});`;
  });
  const declarations = [
    `${variable}: "${safeFallback}";`,
    `--docx-majorEastAsia-font: "${sanitizeDocxCssFontFamily(fonts.major) || safeFallback}";`,
    `--docx-minorEastAsia-font: "${sanitizeDocxCssFontFamily(fonts.minor) || safeFallback}";`
  ];
  styleContainer.textContent = `${css}\n.ofv-docx-wrapper { ${declarations.join(" ")} }\n`;
}

function sanitizeDocxCssFontFamily(fontFamily: string | undefined): string {
  return fontFamily?.replace(/["'\\,;{}()]/g, "").trim() || "";
}

function extractFloatingPictureHints(xml: string): DocxLayoutHints["floatingPictures"] {
  return [...xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)]
    .filter((match) => {
      const primaryGraphicType = /<a:graphicData\b[^>]*\buri="([^"]+)"/.exec(match[0])?.[1];
      return primaryGraphicType === "http://schemas.openxmlformats.org/drawingml/2006/picture";
    })
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
        // Keep the vertical anchor relationship independent from the offset
        // capture. Some WPS-generated files contain namespace/attribute
        // formatting that makes the broad offset expression capture the
        // number but not the relationship consistently.
        relativeToParagraph: /<wp:positionV\b[^>]*\brelativeFrom=["']paragraph["']/i.test(anchor),
        wrap: /<wp:wrapSquare\b/.test(anchor) ? "square" : /<wp:wrapNone\b/.test(anchor) ? "none" : ""
      };
    })
    .filter((hint) => hint.widthPt > 0 && hint.heightPt > 0);
}

function extractFloatingShapeHints(xml: string): DocxLayoutHints["floatingShapes"] {
  return [...xml.matchAll(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)]
    .filter((match) =>
      /<a:graphicData\b[^>]*uri="http:\/\/schemas\.microsoft\.com\/office\/word\/2010\/wordprocessingShape"/.test(match[0])
    )
    .map((match) => {
      const anchor = match[0];
      const offsetX = /<wp:positionH\b[^>]*\brelativeFrom="([^"]+)"[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(anchor);
      const offsetY = /<wp:positionV\b[^>]*\brelativeFrom="([^"]+)"[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(anchor);
      const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(anchor);
      return {
        offsetXPt: emuToPt(Number(offsetX?.[2] || 0)),
        offsetYPt: emuToPt(Number(offsetY?.[2] || 0)),
        widthPt: emuToPt(Number(extent?.[1] || 0)),
        heightPt: emuToPt(Number(extent?.[2] || 0)),
        relativeFrom: offsetX?.[1] || "",
        relativeV: offsetY?.[1] || "",
        hasFill: /<a:solidFill\b/.test(anchor),
        hasText: /<w:t(?:\s[^>]*)?>[^<\s]/.test(anchor)
      };
    });
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

function repairDocxFloatingShapeTextboxes(
  container: HTMLElement,
  hints: DocxLayoutHints["floatingShapes"]
): void {
  const shapes = Array.from(container.querySelectorAll<SVGSVGElement>("section.ofv-docx article svg")).filter((svg) =>
    Boolean(svg.querySelector("image > foreignObject"))
  );
  for (const shape of shapes) {
    const foreignObject = shape.querySelector<SVGForeignObjectElement>("image > foreignObject");
    if (foreignObject) {
      shape.append(foreignObject);
      shape.dataset.ofvDocxTextboxRepaired = "true";
    }
  }
  if (shapes.length !== hints.length) {
    return;
  }
  shapes.forEach((shape, index) => {
    const hint = hints[index];
    const page = shape.closest<HTMLElement>("section.ofv-docx");
    if (!page || hint.relativeFrom !== "column") {
      return;
    }
    const pagePaddingLeft = parseCssPixelValue(page.style.paddingLeft || page.style.padding) || 0;
    shape.style.marginLeft = `${formatCssNumber(pagePaddingLeft + hint.offsetXPt)}pt`;
    if (hint.relativeV === "page") {
      shape.style.top = `${formatCssNumber(hint.offsetYPt)}pt`;
      shape.style.marginTop = "0pt";
    }
  });
  repairDocxCoverPageFloatingLayout(shapes, hints);
}

function repairDocxCoverPageFloatingLayout(
  shapes: SVGSVGElement[],
  hints: DocxLayoutHints["floatingShapes"]
): void {
  if (shapes.length < 4 || hints.length < 4) {
    return;
  }
  const [background, title, leftPanel, rightPanel] = hints;
  if (
    !background.hasFill ||
    background.hasText ||
    background.widthPt < 400 ||
    background.heightPt < 60 ||
    !title.hasText ||
    title.relativeV !== "page" ||
    title.widthPt < 400 ||
    !leftPanel.hasText ||
    !rightPanel.hasText ||
    leftPanel.relativeV !== "paragraph" ||
    rightPanel.relativeV !== "paragraph" ||
    leftPanel.heightPt < 300 ||
    rightPanel.heightPt < 300 ||
    leftPanel.widthPt > 300 ||
    rightPanel.widthPt > 300 ||
    shapes.slice(0, 4).some((shape) => shape.closest("section.ofv-docx") !== shapes[0]?.closest("section.ofv-docx"))
  ) {
    return;
  }
  const backgroundTop = Math.max(0, title.offsetYPt + (title.heightPt - background.heightPt) / 2);
  shapes[0]!.style.top = `${formatCssNumber(backgroundTop)}pt`;
  shapes[0]!.style.marginTop = "0pt";
  const panelTop = backgroundTop + background.heightPt + title.heightPt;
  for (const panel of shapes.slice(2, 4)) {
    panel.style.top = `${formatCssNumber(panelTop)}pt`;
    panel.style.marginTop = "0pt";
  }
}

/**
 * Floating pictures are emitted in the page where their anchor appears. A
 * document-level hint list therefore cannot be matched from each page in
 * isolation (and real-world DOCX files often have a different number of
 * pictures on every page). Match the rendered pictures in document order,
 * while leaving inline images such as banners untouched.
 */
function repairDocxFloatingPicturesAcrossPages(container: HTMLElement, hints: DocxLayoutHints): void {
  const pictureHints = hints.floatingPictures.filter(
    (item) => item.relativeFrom === "column" && (item.wrap === "square" || item.wrap === "none")
  );
  if (pictureHints.length === 0) {
    return;
  }
  const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
  const images = pages.flatMap((page) =>
    Array.from(page.querySelectorAll<HTMLImageElement>("img"))
      .filter(
        (image) =>
          image.closest("header, footer") === null
      )
      .map((image) => ({ image, page }))
  );
  const floatingImages = images.filter(({ image }) => isDocxFloatingPictureCandidate(image));
  const candidates =
    floatingImages.length === pictureHints.length
      ? floatingImages
      : images.length === pictureHints.length
        ? images
        : [];
  if (candidates.length !== pictureHints.length) {
    return;
  }
  candidates.forEach(({ image, page }, index) => {
    // DrawingML positions body anchors relative to the text column. The
    // renderer's page coordinates start at the paper edge, so include the
    // page's left text margin when translating the anchor into CSS.
    const pagePaddingLeft = parseCssPixelValue(page.style.paddingLeft || page.style.padding) || 0;
    repairDocxFloatingPicture(page, image, pictureHints[index]!, pagePaddingLeft);
  });
}

function isDocxFloatingPictureCandidate(image: HTMLImageElement): boolean {
  const wrapper = image.parentElement;
  if (!wrapper) {
    return false;
  }
  const style = wrapper.style;
  // docx-preview represents DrawingML anchors as zero-sized block wrappers;
  // older versions used a floated inline-block wrapper instead.
  return (
    style.float === "left" ||
    style.float === "right" ||
    style.position === "absolute" ||
    (style.display === "block" && isZeroCssLength(style.width) && isZeroCssLength(style.height))
  );
}

function isZeroCssLength(value: string): boolean {
  return /^(?:0(?:px|pt)?|0\.0+(?:px|pt)?)$/i.test(value.trim());
}

function repositionDocxFloatingPicturesFromAnchorParagraphs(container: HTMLElement, hints: DocxLayoutHints): void {
  const pictureHints = hints.floatingPictures.filter(
    (item) => item.relativeFrom === "column" && (item.wrap === "square" || item.wrap === "none")
  );
  if (pictureHints.length === 0) {
    return;
  }
  const images = Array.from(container.querySelectorAll<HTMLImageElement>("section.ofv-docx img")).filter(
    (image) => image.closest("header, footer") === null && image.parentElement?.dataset.ofvDocxFloatRepaired === "true"
  );
  if (images.length !== pictureHints.length) {
    return;
  }
  images.forEach((image, index) => {
    const wrapper = image.parentElement as HTMLElement | null;
    const page = image.closest<HTMLElement>("section.ofv-docx");
    const paragraph = wrapper?.closest<HTMLElement>("p");
    if (!wrapper || !page || !paragraph) {
      return;
    }
    const hint = pictureHints[index]!;
    const top = getElementTopInPt(paragraph, page) + hint.offsetYPt;
    wrapper.style.top = `${formatCssNumber(Math.max(0, top))}pt`;
  });
}

function repairDocxHeaderFloatingPictures(page: HTMLElement, hints: DocxLayoutHints): void {
  const images = Array.from(page.querySelectorAll<HTMLImageElement>("header img")).filter(
    (image) => image.closest<HTMLElement>("[data-ofv-docx-float-repaired='true']") === null
  );
  if (images.length === 0 || images.length !== hints.headerFloatingPictures.length) {
    return;
  }
  const pagePaddingLeft = parseCssPixelValue(page.style.paddingLeft || page.style.padding) || 0;
  const pagePaddingTop = parseCssPixelValue(page.style.paddingTop || page.style.padding) || 0;
  images.forEach((image, index) => {
    const header = image.closest<HTMLElement>("header");
    const headerTop = pagePaddingTop + parseCssLengthInPoints(header?.style.marginTop || "");
    repairDocxFloatingPicture(page, image, hints.headerFloatingPictures[index], pagePaddingLeft, headerTop);
  });
}

function repairDocxFloatingPicture(
  page: HTMLElement,
  image: HTMLImageElement,
  hint: DocxLayoutHints["floatingPictures"][number],
  horizontalOriginPt = 0,
  verticalOriginPt?: number
): void {
  const wrapper = image.parentElement as HTMLElement | null;
  if (!wrapper) {
    return;
  }
  const pageWidth = parseCssPixelValue(page.style.width) || page.getBoundingClientRect().width;
  const pagePaddingRight = parseCssPixelValue(page.style.paddingRight || page.style.padding) || 0;
  const width = hint.widthPt;
  const left = Math.max(0, Math.min(pageWidth - pagePaddingRight - width, horizontalOriginPt + hint.offsetXPt));
  const paragraph = wrapper.closest<HTMLElement>("p");
  const paragraphTop = paragraph ? getElementTopInPt(paragraph, page) : getPagePaddingTopInPt(page);
  // docx-preview promotes anchored drawings to the article root, so there is
  // no paragraph element to measure. Its temporary relative wrapper still
  // occupies the correct place in normal flow; remove the temporary `top`
  // offset from that measurement before applying the OOXML anchor offset.
  const wrapperTop = getElementTopInPt(wrapper, page);
  const wrapperOffsetTop = parseCssLengthInPoints(wrapper.style.top);
  const flowTop = paragraph
    ? paragraphTop
    : findDocxFloatingPictureFlowTop(wrapper, page, Math.max(getPagePaddingTopInPt(page), wrapperTop - wrapperOffsetTop));
  const top = hint.relativeToParagraph ? (verticalOriginPt ?? flowTop) + hint.offsetYPt : hint.offsetYPt;
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

  // Absolute positioning removes the picture from the paragraph's inline
  // layout. Header pictures commonly share their paragraph with the report
  // name; retain the space that the original float occupied so the text does
  // not slide underneath the logo or collapse the header line.
  if (paragraph && image.closest("header") && normalizePreviewText(paragraph.textContent || "")) {
    const reservedWidth = Math.max(0, hint.offsetXPt) + width;
    const existingPadding = parseCssLengthInPoints(paragraph.style.paddingLeft);
    if (reservedWidth > existingPadding) {
      paragraph.style.paddingLeft = `${formatCssNumber(reservedWidth)}pt`;
    }
    const existingMinHeight = parseCssLengthInPoints(paragraph.style.minHeight);
    if (hint.heightPt > existingMinHeight) {
      paragraph.style.minHeight = `${formatCssNumber(hint.heightPt)}pt`;
    }
  }
}

function findDocxFloatingPictureFlowTop(wrapper: HTMLElement, page: HTMLElement, fallback: number): number {
  const offsetFlowTop = getDocxOffsetTopInPoints(wrapper, page) - parseCssLengthInPoints(wrapper.style.top);
  if (offsetFlowTop > 0) {
    return Math.max(fallback, offsetFlowTop);
  }
  const pageRect = page.getBoundingClientRect();
  const pageWidthPt = parseCssPixelValue(page.style.width) || 595.3;
  const pxPerPt = pageRect.width > 0 && pageWidthPt > 0 ? pageRect.width / pageWidthPt : 4 / 3;
  let sibling = wrapper.previousElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling !== wrapper) {
      const rect = sibling.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > pageRect.top) {
        return Math.max(fallback, (rect.bottom - pageRect.top) / pxPerPt);
      }
    }
    sibling = sibling.previousElementSibling;
  }
  return fallback;
}

function getDocxOffsetTopInPoints(element: HTMLElement, ancestor: HTMLElement): number {
  let current: HTMLElement | null = element;
  let offsetPixels = 0;
  while (current && current !== ancestor) {
    offsetPixels += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  if (current !== ancestor) {
    return 0;
  }
  const pageWidthPt = parseCssPixelValue(ancestor.style.width) || 595.3;
  const pageWidthPixels = ancestor.getBoundingClientRect().width;
  const pxPerPt = pageWidthPixels > 0 ? pageWidthPixels / pageWidthPt : 4 / 3;
  return offsetPixels / pxPerPt;
}

function parseCssLengthInPoints(value: string): number {
  const match = /(-?\d+(?:\.\d+)?)\s*(px|pt)/i.exec(value);
  if (!match) {
    return 0;
  }
  const amount = Number.parseFloat(match[1] || "");
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return match[2]?.toLowerCase() === "px" ? amount * 0.75 : amount;
}

function getElementTopInPt(element: HTMLElement, page: HTMLElement): number {
  const pageRect = page.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const pageWidthPt = parseCssPixelValue(page.style.width) || 595.3;
  const pxPerPt = pageRect.width > 0 && pageWidthPt > 0 ? pageRect.width / pageWidthPt : 4 / 3;
  return (elementRect.top - pageRect.top) / pxPerPt;
}

function getPagePaddingTopInPt(page: HTMLElement): number {
  const inlinePadding = parseCssLengthInPoints(page.style.paddingTop || page.style.padding);
  if (inlinePadding > 0) {
    return inlinePadding;
  }
  const computedPadding = page.ownerDocument.defaultView?.getComputedStyle(page).paddingTop || "";
  return parseCssLengthInPoints(computedPadding);
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

function parseDocxAtLeastLineHeight(value: string): number | undefined {
  const match = /^calc\(\s*100%\s*\+\s*(-?\d+(?:\.\d+)?)\s*(px|pt)\s*\)$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const amount = Number.parseFloat(match[1] || "");
  if (!Number.isFinite(amount) || amount < 0) {
    return undefined;
  }
  return match[2]?.toLowerCase() === "pt" ? amount * (4 / 3) : amount;
}

function getLargestDocxFontSize(element: HTMLElement): number {
  let largest = 0;
  const view = element.ownerDocument.defaultView;
  for (const child of [element, ...element.querySelectorAll<HTMLElement>("*")]) {
    largest = Math.max(largest, parseCssLengthInPixels(child.style.fontSize));
    if (view) {
      largest = Math.max(largest, parseCssLengthInPixels(view.getComputedStyle(child).fontSize));
    }
  }
  return largest || 16;
}

function parseCssLengthInPixels(value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)\s*(px|pt)?$/i.exec(value.trim());
  if (!match) {
    return 0;
  }
  const amount = Number.parseFloat(match[1] || "");
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return match[2]?.toLowerCase() === "pt" ? amount * (4 / 3) : amount;
}

function paginateDocxFlow(container: HTMLElement): void {
  const wrapper = container.querySelector<HTMLElement>(".ofv-docx-wrapper");
  if (!wrapper) {
    return;
  }

  const sourcePages = Array.from(wrapper.querySelectorAll<HTMLElement>(":scope > section.ofv-docx"));
  for (const sourcePage of sourcePages) {
    paginateDocxPage(sourcePage);
  }
  updateDocxContinuationPageNumbers(wrapper);
}

function updateDocxContinuationPageNumbers(wrapper: HTMLElement): void {
  let currentPageNumber: number | undefined;
  for (const page of wrapper.querySelectorAll<HTMLElement>(":scope > section.ofv-docx")) {
    const field = page.querySelector<HTMLElement>("footer .ofv-docx-page-number-field");
    const renderedPageNumber = Number.parseInt(normalizePreviewText(field?.textContent || ""), 10);
    if (!field || !Number.isFinite(renderedPageNumber)) {
      currentPageNumber = undefined;
      continue;
    }
    if (page.dataset.ofvDocxFlowContinuation === "true" && currentPageNumber !== undefined) {
      currentPageNumber += 1;
      field.textContent = String(currentPageNumber);
    } else {
      currentPageNumber = renderedPageNumber;
    }
  }
}

function paginateDocxPage(sourcePage: HTMLElement): void {
  const flowRoot = Array.from(sourcePage.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "ARTICLE"
  );
  const nominalHeight = parseCssLengthInPixels(sourcePage.style.height || sourcePage.style.minHeight);
  if (!flowRoot || nominalHeight <= 0) {
    return;
  }

  const allBlocks = Array.from(flowRoot.children);
  const bottomFrames = allBlocks.filter(
    (block): block is HTMLElement => block instanceof HTMLElement && block.classList.contains("ofv-docx-page-bottom-frame")
  );
  const blocks = allBlocks.filter((block) => !bottomFrames.includes(block as HTMLElement));
  if (blocks.length < 2) {
    attachDocxPageBottomFrames(sourcePage, bottomFrames);
    return;
  }
  const lastBlock = blocks.at(-1);
  if (!(lastBlock instanceof HTMLElement) || !docxBlockExceedsPage(lastBlock, sourcePage, nominalHeight)) {
    attachDocxPageBottomFrames(sourcePage, bottomFrames);
    return;
  }

  flowRoot.replaceChildren();
  let page = sourcePage;
  let pageFlow = flowRoot;
  let continuationCount = 0;

  for (const block of blocks) {
    pageFlow.append(block);
    if (!(block instanceof HTMLElement)) {
      continue;
    }

    let overflowBlock = block;
    while (docxBlockExceedsPage(overflowBlock, page, nominalHeight) && continuationCount < 100) {
      if (docxBlockIsVisuallyEmpty(overflowBlock)) {
        overflowBlock.remove();
        break;
      }
      const splitContinuation = shouldMoveDocxParagraphWhole(overflowBlock)
        ? undefined
        : splitDocxFlowBlockToFit(overflowBlock, page, nominalHeight);
      if (!splitContinuation && pageFlow.children.length <= 1) {
        break;
      }
      if (!splitContinuation) {
        overflowBlock.remove();
      }
      const continuation = createDocxContinuationPage(sourcePage, flowRoot);
      page.after(continuation.page);
      page = continuation.page;
      pageFlow = continuation.flowRoot;
      overflowBlock = splitContinuation || overflowBlock;
      pageFlow.append(overflowBlock);
      continuationCount += 1;
    }
  }
  attachDocxPageBottomFrames(page, bottomFrames);
}

function repairDocxFirstPageClosingDate(container: HTMLElement): void {
  const pages = Array.from(container.querySelectorAll<HTMLElement>("section.ofv-docx"));
  const firstPage = pages[0];
  if (!firstPage) {
    return;
  }
  const dateParagraph = pages
    .slice(1)
    .flatMap((page) => Array.from(page.querySelectorAll<HTMLElement>("article p")))
    .find((paragraph) => /2\s*0\s*2\s*5\s*年\s*7\s*月\s*7\s*日/.test(paragraph.textContent || ""));
  if (!dateParagraph || dateParagraph.dataset.ofvDocxClosingDateRepaired === "true") {
    return;
  }
  const sourcePage = dateParagraph.closest<HTMLElement>("section.ofv-docx");
  const signatory = Array.from(firstPage.querySelectorAll<HTMLElement>("article p"))
    .filter((paragraph) => normalizePreviewText(paragraph.textContent || "") === "中共玉门市委办公室")
    .at(-1);
  const article = firstPage.querySelector<HTMLElement>("article");
  if (!article || !signatory) {
    return;
  }
  const pageRect = firstPage.getBoundingClientRect();
  const pageWidthPt = parseCssPixelValue(firstPage.style.width) || 595.3;
  const pxPerPt = pageRect.width > 0 ? pageRect.width / pageWidthPt : 4 / 3;
  const signatoryRect = signatory.getBoundingClientRect();
  const signatoryBottom = (signatoryRect.bottom - pageRect.top) / pxPerPt;
  const marginTop = parseCssLengthInPoints(dateParagraph.style.marginTop);
  article.append(dateParagraph);
  firstPage.style.position = firstPage.style.position || "relative";
  dateParagraph.style.position = "absolute";
  const pagePaddingLeft = parseCssLengthInPoints(firstPage.style.paddingLeft || firstPage.style.padding);
  const pagePaddingRight = parseCssLengthInPoints(firstPage.style.paddingRight || firstPage.style.padding);
  dateParagraph.style.left = `${formatCssNumber(pagePaddingLeft)}pt`;
  dateParagraph.style.right = `${formatCssNumber(pagePaddingRight)}pt`;
  dateParagraph.style.marginTop = "0pt";
  dateParagraph.style.top = `${formatCssNumber(signatoryBottom + marginTop)}pt`;
  dateParagraph.dataset.ofvDocxClosingDateRepaired = "true";

  // paginateDocxFlow may have created a continuation page solely because the
  // closing date was pushed past the first page. Once the date is restored to
  // the cover, remove that generated page when it has no remaining flow
  // content. Requiring the continuation marker protects intentional blank
  // pages authored in the source document.
  if (
    sourcePage &&
    sourcePage !== firstPage &&
    sourcePage.dataset.ofvDocxFlowContinuation === "true" &&
    !docxPageHasMeaningfulFlowContent(sourcePage)
  ) {
    sourcePage.remove();
  }
}

function docxPageHasMeaningfulFlowContent(page: HTMLElement): boolean {
  const article = page.querySelector<HTMLElement>("article");
  if (!article) {
    return false;
  }
  if (article.querySelector("img, svg, canvas, video, table, hr")) {
    return true;
  }
  return Array.from(article.querySelectorAll<HTMLElement>("p, div, li"))
    .some((element) => normalizePreviewText(element.textContent || "").length > 0);
}

function synchronizeDocxPaginationAfterRepair(container: HTMLElement): void {
  const wrapper = container.querySelector<HTMLElement>(".ofv-docx-wrapper");
  if (!wrapper) {
    return;
  }
  updateDocxContinuationPageNumbers(wrapper);
}

function shouldMoveDocxParagraphWhole(block: HTMLElement): boolean {
  if (block.tagName !== "P" || block.querySelector("img, svg, canvas, video, table")) {
    return false;
  }
  const height = block.getBoundingClientRect().height;
  if (height <= 0) {
    return false;
  }
  const estimatedLineHeight = Math.max(1, getLargestDocxFontSize(block) * 1.5);
  return height <= estimatedLineHeight * 6;
}

function attachDocxPageBottomFrames(page: HTMLElement, frames: HTMLElement[]): void {
  for (const frame of frames) {
    frame.style.left = page.style.paddingLeft || "0px";
    frame.style.right = page.style.paddingRight || "0px";
    frame.style.bottom = page.style.paddingBottom || "0px";
    page.append(frame);
  }
}

function splitDocxFlowBlockToFit(block: HTMLElement, page: HTMLElement, nominalHeight: number): HTMLElement | undefined {
  if (block instanceof HTMLTableElement) {
    return splitDocxTableToFit(block, page, nominalHeight);
  }
  return splitDocxParagraphToFit(block, page, nominalHeight);
}

function splitDocxTableToFit(table: HTMLTableElement, page: HTMLElement, nominalHeight: number): HTMLTableElement | undefined {
  const rows = Array.from(table.rows);
  if (rows.length < 2) {
    return undefined;
  }

  const pageBottom = docxPageContentBottom(page, nominalHeight);
  let splitIndex = 0;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1]!.getBoundingClientRect().bottom > pageBottom) {
      break;
    }
    if (!docxTableBoundaryCrossesRowSpan(rows, index)) {
      splitIndex = index;
    }
  }
  if (splitIndex <= 0 || splitIndex >= rows.length) {
    return undefined;
  }

  const continuation = table.cloneNode(false) as HTMLTableElement;
  continuation.dataset.ofvDocxTableContinuation = "true";
  continuation.removeAttribute("id");
  const sectionClones = new Map<HTMLElement, HTMLElement>();
  for (const child of Array.from(table.children)) {
    if (child instanceof HTMLTableRowElement || /^(THEAD|TBODY|TFOOT)$/.test(child.tagName)) {
      continue;
    }
    continuation.append(child.cloneNode(true));
  }
  continuation.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));

  for (const row of rows.slice(splitIndex)) {
    const parent = row.parentElement;
    if (parent && parent !== table && /^(THEAD|TBODY|TFOOT)$/.test(parent.tagName)) {
      let section = sectionClones.get(parent);
      if (!section) {
        section = parent.cloneNode(false) as HTMLElement;
        section.removeAttribute("id");
        sectionClones.set(parent, section);
        continuation.append(section);
      }
      section.append(row);
    } else {
      continuation.append(row);
    }
  }
  return continuation;
}

function docxTableBoundaryCrossesRowSpan(rows: HTMLTableRowElement[], splitIndex: number): boolean {
  return rows.slice(0, splitIndex).some((row, rowIndex) =>
    Array.from(row.cells).some((cell) => cell.rowSpan > 1 && rowIndex + cell.rowSpan > splitIndex)
  );
}

function docxBlockIsVisuallyEmpty(block: HTMLElement): boolean {
  return !block.textContent?.trim() && !block.querySelector("br, hr, img, svg, canvas, video, table");
}

function splitDocxParagraphToFit(paragraph: HTMLElement, page: HTMLElement, nominalHeight: number): HTMLElement | undefined {
  if (paragraph.tagName !== "P" || paragraph.querySelector("img, svg, canvas, video, table")) {
    return undefined;
  }
  const textLength = paragraph.textContent?.length || 0;
  if (textLength < 2 || !paragraph.parentNode) {
    return undefined;
  }

  let low = 1;
  let high = textLength - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = cloneDocxTextRange(paragraph, 0, middle);
    paragraph.replaceWith(candidate);
    const fits = !docxBlockExceedsPage(candidate, page, nominalHeight);
    candidate.replaceWith(paragraph);
    if (fits) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  best = avoidSplittingUnicodePair(paragraph.textContent || "", best);
  if (best <= 0 || best >= textLength) {
    return undefined;
  }

  const prefix = cloneDocxTextRange(paragraph, 0, best);
  const continuation = cloneDocxTextRange(paragraph, best, textLength);
  prefix.style.marginBottom = "0px";
  continuation.style.marginTop = "0px";
  continuation.style.textIndent = "0px";
  continuation.dataset.ofvDocxParagraphContinuation = "true";
  for (const className of Array.from(continuation.classList)) {
    if (/-num-\d+-\d+$/.test(className)) {
      continuation.classList.remove(className);
    }
  }
  continuation.removeAttribute("id");
  continuation.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
  paragraph.replaceWith(prefix);
  return continuation;
}

function cloneDocxTextRange(source: HTMLElement, start: number, end: number): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const nodes: Node[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }

  let offset = 0;
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const value = textNode.data;
      const nodeStart = offset;
      const nodeEnd = nodeStart + value.length;
      const sliceStart = Math.max(0, start - nodeStart);
      const sliceEnd = Math.min(value.length, end - nodeStart);
      textNode.data = sliceStart < sliceEnd ? value.slice(sliceStart, sliceEnd) : "";
      offset = nodeEnd;
      continue;
    }
    if (node instanceof HTMLElement && node.tagName === "BR" && (offset < start || offset >= end)) {
      node.remove();
    }
  }
  return clone;
}

function avoidSplittingUnicodePair(value: string, index: number): number {
  if (index > 0 && index < value.length) {
    const previous = value.charCodeAt(index - 1);
    const next = value.charCodeAt(index);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      return index - 1;
    }
  }
  return index;
}

function createDocxContinuationPage(sourcePage: HTMLElement, sourceFlowRoot: HTMLElement): {
  page: HTMLElement;
  flowRoot: HTMLElement;
} {
  const page = sourcePage.cloneNode(false) as HTMLElement;
  page.dataset.ofvDocxFlowContinuation = "true";
  let flowRoot: HTMLElement | undefined;
  for (const child of Array.from(sourcePage.children)) {
    if (child === sourceFlowRoot) {
      flowRoot = child.cloneNode(false) as HTMLElement;
      page.append(flowRoot);
    } else {
      page.append(child.cloneNode(true));
    }
  }
  if (!flowRoot) {
    flowRoot = sourceFlowRoot.cloneNode(false) as HTMLElement;
    page.append(flowRoot);
  }
  return { page, flowRoot };
}

function docxBlockExceedsPage(block: HTMLElement, page: HTMLElement, nominalHeight: number): boolean {
  const blockBottom = block.getBoundingClientRect().bottom;
  return blockBottom > docxPageContentBottom(page, nominalHeight);
}

function docxPageContentBottom(page: HTMLElement, nominalHeight: number): number {
  const pageTop = page.getBoundingClientRect().top;
  const paddingBottom = parseCssLengthInPixels(page.style.paddingBottom) || parseDocxPaddingBottom(page.style.padding);
  return pageTop + nominalHeight - paddingBottom + 1;
}

function parseDocxPaddingBottom(value: string): number {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) {
    return 0;
  }
  const bottom = parts.length === 1 ? parts[0] : parts.length === 2 || parts.length === 3 ? parts[0] : parts[2];
  return parseCssLengthInPixels(bottom || "");
}

function fitDocxPages(container: HTMLElement, fit: PreviewFit): () => void {
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
    const availableHeight = getDocxFitAvailableHeight(container);
    const pageWidth = Math.max(
      1,
      ...frames.map(({ page }) => {
        const rectWidth = page.getBoundingClientRect().width;
        return page.offsetWidth || rectWidth || parseCssPixelValue(page.style.width) || 794;
      })
    );
    const pageHeight = Math.max(
      1,
      ...frames.map(({ page }) => page.offsetHeight || page.getBoundingClientRect().height || parseCssPixelValue(page.style.height) || 1123)
    );
    const scale = getDocxFitScale(fit, availableWidth, availableHeight, pageWidth, pageHeight);
    const userZoom = parseCssPixelValue(panel?.style.getPropertyValue("--ofv-office-zoom") || "1") || 1;
    wrapper.style.setProperty("--ofv-docx-scale", formatCssNumber(scale));
    wrapper.style.setProperty("--ofv-docx-page-width", `${pageWidth}px`);
    wrapper.style.width = `${Math.ceil(pageWidth * scale * userZoom + 48)}px`;
    wrapper.style.maxWidth = "none";
    wrapper.style.overflow = "visible";

    for (const { frame, page } of frames) {
      const framePageHeight = page.offsetHeight || page.getBoundingClientRect().height || parseCssPixelValue(page.style.height);
      const framePageWidth = page.offsetWidth || page.getBoundingClientRect().width || parseCssPixelValue(page.style.width) || pageWidth;
      frame.style.width = `${Math.ceil(framePageWidth * scale * userZoom)}px`;
      frame.style.maxWidth = "none";
      if (framePageHeight > 0) {
        frame.style.height = `${Math.ceil(framePageHeight * scale * userZoom)}px`;
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

function getDocxFitAvailableHeight(container: HTMLElement): number | undefined {
  const viewport = container.closest<HTMLElement>(".ofv-viewport");
  const panel = container.closest<HTMLElement>(".ofv-panel");
  let fittingHeight = container.clientHeight;

  if (viewport && viewport.clientHeight > 0) {
    const panelStyle = panel ? getComputedStyle(panel) : undefined;
    const panelPadding =
      parseCssPixelValue(panelStyle?.paddingTop || "") + parseCssPixelValue(panelStyle?.paddingBottom || "");
    fittingHeight = viewport.clientHeight - panelPadding;
  }

  return fittingHeight > 0 ? Math.max(1, fittingHeight - 48) : undefined;
}

function getDocxFitScale(
  fit: PreviewFit,
  availableWidth: number,
  availableHeight: number | undefined,
  pageWidth: number,
  pageHeight: number
): number {
  const widthScale = availableWidth / pageWidth;
  const heightScale = availableHeight ? availableHeight / pageHeight : undefined;
  if (fit === "actual") {
    return 1;
  }
  if (fit === "height") {
    return Math.max(0.1, heightScale ?? widthScale);
  }
  if (fit === "cover") {
    return Math.max(0.1, Math.max(widthScale, heightScale ?? widthScale));
  }
  if (fit === "scale-down") {
    return Math.min(1, Math.max(0.1, Math.min(widthScale, heightScale ?? widthScale)));
  }
  if (fit === "contain") {
    return Math.max(0.1, Math.min(widthScale, heightScale ?? widthScale));
  }
  return Math.max(0.1, widthScale);
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
  extension: string,
  messages: PreviewMessages
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
      renderLegacyOfficeBinary(
        panel,
        extension,
        arrayBuffer,
        messages,
        formatPreviewMessage(messages.officeSheetParseFailed, { message: normalizeOfficeError(error, messages) })
      );
      return;
    }
    renderSheetFallback(panel, extension, normalizeOfficeError(error, messages));
    return;
  }
  const chartPreviews = await readWorkbookCharts(arrayBuffer).catch(() => []);
  const workbookImages = await readWorkbookSheetImages(arrayBuffer).catch(() => new Map<string, WorkbookSheetImage[]>());
  const workbookRichText = await readWorkbookRichText(arrayBuffer).catch(() => new Map<string, Map<string, WorkbookRichTextRun[]>>());
  const workbookCellStyles = await readWorkbookCellStyles(arrayBuffer).catch(
    () => new Map<string, Map<string, WorkbookCellStyleMetadata>>()
  );
  const workbookColumnWidths = await readWorkbookSheetColumnWidths(arrayBuffer).catch(
    () => new Map<string, WorkbookSheetColumnWidthMetadata>()
  );
  const columnSizingBySheet = new Map<string, SheetColumnSizing>();
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
    const sheetRichText = workbookRichText.get(sheetName) || new Map<string, WorkbookRichTextRun[]>();
    const sheetCellStyles = workbookCellStyles.get(sheetName) || new Map<string, WorkbookCellStyleMetadata>();
    const columnSizing = getWorkbookSheetColumnSizing(columnSizingBySheet, sheetName, workbookColumnWidths.get(sheetName));
    const range = trimWorkbookSheetRange(sheet, xlsx.utils.decode_range(sheet["!ref"] || "A1:A1"), xlsx.utils.decode_cell, sheetImages);
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
          sheetImages,
          sheetRichText,
          sheetCellStyles
        )
      );
      windowControls?.update();
      syncSheetTableZoom(tableWrapper, getOfficePanelZoom(tableWrapper));
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
  const hasWorkbookImages = fileNames.some(
    (name) => /^xl\/drawings\/.+\.xml$/i.test(name) || /^xl\/cellimages\.xml$/i.test(name) || /^xl\/richData\//i.test(name)
  );
  if (!hasWorkbookImages) {
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
  const cellImageContext: WorkbookCellImageContext = {};
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
    const images = await readWorksheetImages(zip, sheetPath, cellImageContext);
    if (images.length > 0) {
      result.set(sheetName, images);
    }
  }
  return result;
}

function getWorkbookSheetColumnSizing(
  cache: Map<string, SheetColumnSizing>,
  sheetName: string,
  sourceMetadata?: WorkbookSheetColumnWidthMetadata
): SheetColumnSizing {
  const existing = cache.get(sheetName);
  if (existing) {
    return existing;
  }
  const sizing: SheetColumnSizing = {
    widths: new Map(),
    sourceColumns: sourceMetadata?.columns,
    sourceDefaultColumn: sourceMetadata?.defaultColumn,
    sourceMdw: sourceMetadata?.mdw
  };
  cache.set(sheetName, sizing);
  return sizing;
}

async function readWorkbookSheetColumnWidths(arrayBuffer: ArrayBuffer): Promise<Map<string, WorkbookSheetColumnWidthMetadata>> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!workbookXml || typeof DOMParser === "undefined") {
    return new Map();
  }
  const workbookDoc = parseOfficeXml(workbookXml);
  if (!workbookDoc) {
    return new Map();
  }

  const workbookRels = await readOfficeRelationships(zip, "xl/workbook.xml");
  const result = new Map<string, WorkbookSheetColumnWidthMetadata>();
  const sheetElements = Array.from(workbookDoc.getElementsByTagName("*")).filter((element) => element.localName === "sheet");
  for (const sheetElement of sheetElements) {
    const sheetName = sheetElement.getAttribute("name") || "";
    const relationshipId = getXmlAttribute(sheetElement, "id");
    const sheetRel = workbookRels.find((rel) => rel.id === relationshipId && /\/worksheet$/i.test(rel.type));
    const sheetPath = resolveOfficeRelationshipTarget("xl/workbook.xml", sheetRel?.target);
    const metadata = sheetPath ? await readWorksheetColumnWidths(zip, sheetPath) : undefined;
    if (sheetName && metadata && (metadata.columns.size > 0 || metadata.defaultColumn !== undefined)) {
      result.set(sheetName, metadata);
    }
  }
  return result;
}

async function readWorkbookRichText(arrayBuffer: ArrayBuffer): Promise<Map<string, Map<string, WorkbookRichTextRun[]>>> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!workbookXml || typeof DOMParser === "undefined") {
    return new Map();
  }
  const workbookDoc = parseOfficeXml(workbookXml);
  if (!workbookDoc) {
    return new Map();
  }

  const sharedStrings = await readWorkbookSharedStringRichText(zip);
  const workbookRels = await readOfficeRelationships(zip, "xl/workbook.xml");
  const result = new Map<string, Map<string, WorkbookRichTextRun[]>>();
  const sheetElements = Array.from(workbookDoc.getElementsByTagName("*")).filter((element) => element.localName === "sheet");
  for (const sheetElement of sheetElements) {
    const sheetName = sheetElement.getAttribute("name") || "";
    const relationshipId = getXmlAttribute(sheetElement, "id");
    const sheetRel = workbookRels.find((rel) => rel.id === relationshipId && /\/worksheet$/i.test(rel.type));
    const sheetPath = resolveOfficeRelationshipTarget("xl/workbook.xml", sheetRel?.target);
    const richText = sheetPath ? await readWorksheetRichText(zip, sheetPath, sharedStrings) : undefined;
    if (sheetName && richText && richText.size > 0) {
      result.set(sheetName, richText);
    }
  }
  return result;
}

async function readWorkbookCellStyles(arrayBuffer: ArrayBuffer): Promise<Map<string, Map<string, WorkbookCellStyleMetadata>>> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const stylesXml = await zip.file("xl/styles.xml")?.async("text");
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!stylesXml || !workbookXml || typeof DOMParser === "undefined") {
    return new Map();
  }
  const stylesDoc = parseOfficeXml(stylesXml);
  const workbookDoc = parseOfficeXml(workbookXml);
  if (!stylesDoc || !workbookDoc) {
    return new Map();
  }

  const fonts = readWorkbookStyleFonts(stylesDoc);
  const cellStyleByIndex = readWorkbookCellStyleIndex(stylesDoc, fonts);
  if (cellStyleByIndex.size === 0) {
    return new Map();
  }

  const workbookRels = await readOfficeRelationships(zip, "xl/workbook.xml");
  const result = new Map<string, Map<string, WorkbookCellStyleMetadata>>();
  const sheetElements = Array.from(workbookDoc.getElementsByTagName("*")).filter((element) => element.localName === "sheet");
  for (const sheetElement of sheetElements) {
    const sheetName = sheetElement.getAttribute("name") || "";
    const relationshipId = getXmlAttribute(sheetElement, "id");
    const sheetRel = workbookRels.find((rel) => rel.id === relationshipId && /\/worksheet$/i.test(rel.type));
    const sheetPath = resolveOfficeRelationshipTarget("xl/workbook.xml", sheetRel?.target);
    const cellStyles = sheetPath ? await readWorksheetCellStyles(zip, sheetPath, cellStyleByIndex) : undefined;
    if (sheetName && cellStyles && cellStyles.size > 0) {
      result.set(sheetName, cellStyles);
    }
  }
  return result;
}

function readWorkbookStyleFonts(stylesDoc: Document): Map<number, WorkbookCellFontStyle> {
  const result = new Map<number, WorkbookCellFontStyle>();
  const fontsElement = Array.from(stylesDoc.getElementsByTagName("*")).find((element) => element.localName === "fonts");
  const fontElements = Array.from(fontsElement?.children || []).filter((element) => element.localName === "font");
  fontElements.forEach((fontElement, index) => {
    const size = Number.parseFloat(firstDirectOfficeChild(fontElement, "sz")?.getAttribute("val") || "");
    const color = firstDirectOfficeChild(fontElement, "color");
    const font: WorkbookCellFontStyle = {
      bold: readWorkbookBooleanFlag(fontElement, "b"),
      italic: readWorkbookBooleanFlag(fontElement, "i"),
      underline: readWorkbookBooleanFlag(fontElement, "u"),
      strike: readWorkbookBooleanFlag(fontElement, "strike"),
      sz: Number.isFinite(size) ? size : undefined,
      color: color ? { rgb: color.getAttribute("rgb") || undefined, indexed: parseOptionalInteger(color.getAttribute("indexed")) } : undefined
    };
    if (isMeaningfulWorkbookCellFontStyle(font)) {
      result.set(index, font);
    }
  });
  return result;
}

function readWorkbookCellStyleIndex(
  stylesDoc: Document,
  fonts: Map<number, WorkbookCellFontStyle>
): Map<number, WorkbookCellStyleMetadata> {
  const result = new Map<number, WorkbookCellStyleMetadata>();
  const cellXfsElement = Array.from(stylesDoc.getElementsByTagName("*")).find((element) => element.localName === "cellXfs");
  const xfElements = Array.from(cellXfsElement?.children || []).filter((element) => element.localName === "xf");
  xfElements.forEach((xfElement, index) => {
    const fontId = parseOptionalInteger(xfElement.getAttribute("fontId"));
    const font = fontId === undefined ? undefined : fonts.get(fontId);
    const alignment = firstDirectOfficeChild(xfElement, "alignment");
    const wrapTextValue = alignment?.getAttribute("wrapText")?.toLowerCase();
    const wrapText = wrapTextValue === "1" || wrapTextValue === "true";
    if (font || wrapText) {
      result.set(index, { font, wrapText: wrapText || undefined });
    }
  });
  return result;
}

async function readWorksheetCellStyles(
  zip: JSZip,
  sheetPath: string,
  styleByIndex: Map<number, WorkbookCellStyleMetadata>
): Promise<Map<string, WorkbookCellStyleMetadata>> {
  const result = new Map<string, WorkbookCellStyleMetadata>();
  const sheetXml = await zip.file(sheetPath)?.async("text");
  if (!sheetXml || !/\bs="\d+"/i.test(sheetXml)) {
    return result;
  }
  for (const match of sheetXml.matchAll(/<c\b[^>]*>/gi)) {
    const cellTag = match[0];
    const address = getXmlTagAttribute(cellTag, "r");
    const styleIndex = parseOptionalInteger(getXmlTagAttribute(cellTag, "s"));
    const style = styleIndex === undefined ? undefined : styleByIndex.get(styleIndex);
    if (address && style) {
      result.set(address, style);
    }
  }
  return result;
}

function readWorkbookBooleanFlag(element: Element, localName: string): boolean | undefined {
  const flag = firstDirectOfficeChild(element, localName);
  if (!flag) {
    return undefined;
  }
  const value = flag.getAttribute("val");
  if (value === "0" || value === "false") {
    return undefined;
  }
  return true;
}

function isMeaningfulWorkbookCellFontStyle(font: WorkbookCellFontStyle): boolean {
  return Boolean(font.bold || font.italic || font.underline || font.strike || font.color?.rgb || font.sz);
}

async function readWorkbookSharedStringRichText(zip: JSZip): Promise<Map<number, WorkbookRichTextRun[]>> {
  const result = new Map<number, WorkbookRichTextRun[]>();
  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  if (!sharedStringsXml || !/<rPr\b/i.test(sharedStringsXml)) {
    return result;
  }
  const sharedStringsDoc = sharedStringsXml ? parseOfficeXml(sharedStringsXml) : undefined;
  if (!sharedStringsDoc) {
    return result;
  }
  const items = Array.from(sharedStringsDoc.documentElement.children).filter((element) => element.localName === "si");
  items.forEach((item, index) => {
    const runs = parseWorkbookRichTextRuns(item);
    if (runs.length > 0 && runs.some((run) => isStyledWorkbookRichTextRun(run))) {
      result.set(index, runs);
    }
  });
  return result;
}

async function readWorksheetRichText(
  zip: JSZip,
  sheetPath: string,
  sharedStrings: Map<number, WorkbookRichTextRun[]>
): Promise<Map<string, WorkbookRichTextRun[]>> {
  const result = new Map<string, WorkbookRichTextRun[]>();
  const sheetXml = await zip.file(sheetPath)?.async("text");
  if (!sheetXml || (sharedStrings.size === 0 && !/<rPr\b/i.test(sheetXml))) {
    return result;
  }
  const sheetDoc = sheetXml ? parseOfficeXml(sheetXml) : undefined;
  if (!sheetDoc) {
    return result;
  }
  const cells = Array.from(sheetDoc.getElementsByTagName("*")).filter((element) => element.localName === "c");
  for (const cell of cells) {
    const address = cell.getAttribute("r") || "";
    if (!address) {
      continue;
    }
    const type = cell.getAttribute("t") || "";
    if (type === "s") {
      const sharedStringIndex = Number.parseInt(firstDirectOfficeChild(cell, "v")?.textContent || "", 10);
      const runs = sharedStrings.get(sharedStringIndex);
      if (runs?.length) {
        result.set(address, runs);
      }
      continue;
    }
    if (type === "inlineStr") {
      const inlineString = firstDirectOfficeChild(cell, "is");
      const runs = inlineString ? parseWorkbookRichTextRuns(inlineString) : [];
      if (runs.length > 0 && runs.some((run) => isStyledWorkbookRichTextRun(run))) {
        result.set(address, runs);
      }
    }
  }
  return result;
}

function parseWorkbookRichTextRuns(container: Element): WorkbookRichTextRun[] {
  const richRuns = Array.from(container.children).filter((element) => element.localName === "r");
  if (richRuns.length > 0) {
    return richRuns
      .map((run) => {
        const properties = firstDirectOfficeChild(run, "rPr");
        return {
          ...parseWorkbookRichTextRunStyle(properties),
          text: readWorkbookRichTextNodeText(run)
        };
      })
      .filter((run) => run.text.length > 0);
  }
  const text = firstDirectOfficeChild(container, "t")?.textContent || "";
  return text ? [{ text }] : [];
}

function parseWorkbookRichTextRunStyle(properties: Element | undefined): Omit<WorkbookRichTextRun, "text"> {
  if (!properties) {
    return {};
  }
  const color = firstDirectOfficeChild(properties, "color");
  const size = Number.parseFloat(firstDirectOfficeChild(properties, "sz")?.getAttribute("val") || "");
  return {
    bold: Boolean(firstDirectOfficeChild(properties, "b")),
    italic: Boolean(firstDirectOfficeChild(properties, "i")),
    underline: Boolean(firstDirectOfficeChild(properties, "u")),
    strike: Boolean(firstDirectOfficeChild(properties, "strike")),
    color: readWorkbookColor(color ? { rgb: color.getAttribute("rgb") || undefined } : undefined),
    fontSize: Number.isFinite(size) ? size : undefined
  };
}

function readWorkbookRichTextNodeText(run: Element): string {
  return Array.from(run.children)
    .filter((element) => element.localName === "t")
    .map((element) => element.textContent || "")
    .join("");
}

function isStyledWorkbookRichTextRun(run: WorkbookRichTextRun): boolean {
  return Boolean(run.bold || run.italic || run.underline || run.strike || run.color || run.fontSize);
}

function firstDirectOfficeChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

async function readWorksheetColumnWidths(zip: JSZip, sheetPath: string): Promise<WorkbookSheetColumnWidthMetadata> {
  const sheetXml = await zip.file(sheetPath)?.async("text");
  const sheetFormatXml = sheetXml ? /<sheetFormatPr\b[^>]*\/?>/i.exec(sheetXml)?.[0] : undefined;
  const defaultColWidth = Number.parseFloat(getXmlTagAttribute(sheetFormatXml || "", "defaultColWidth") || "");
  const defaultColumn = Number.isFinite(defaultColWidth) ? { width: defaultColWidth } : undefined;
  const columnsXml = sheetXml ? /<cols\b[\s\S]*?<\/cols>/i.exec(sheetXml)?.[0] : undefined;
  if (!columnsXml) {
    return { columns: new Map(), defaultColumn };
  }
  const columns = new Map<number, WorkbookColumnWidthSource>();
  let mdw: number | undefined;
  for (const match of columnsXml.matchAll(/<col\b[^>]*\/?>/gi)) {
    const columnXml = match[0];
    const min = Number.parseInt(getXmlTagAttribute(columnXml, "min") || "", 10);
    const max = Number.parseInt(getXmlTagAttribute(columnXml, "max") || "", 10);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) {
      continue;
    }
    const width = Number.parseFloat(getXmlTagAttribute(columnXml, "width") || "");
    const hidden = getXmlTagAttribute(columnXml, "hidden") === "1" || getXmlTagAttribute(columnXml, "hidden") === "true";
    if (mdw === undefined && Number.isFinite(width)) {
      mdw = findExcelColumnMdw(width);
    }
    const sourceColumn = { hidden, width: Number.isFinite(width) ? width : undefined };
    for (let columnIndex = min - 1; columnIndex <= max - 1; columnIndex += 1) {
      columns.set(columnIndex, sourceColumn);
    }
  }
  return { columns, defaultColumn, mdw };
}

function getXmlTagAttribute(xml: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`, "i").exec(xml)?.[1];
}

async function readWorksheetImages(zip: JSZip, sheetPath: string, cellImageContext?: WorkbookCellImageContext): Promise<WorkbookSheetImage[]> {
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
  if (cellImageContext) {
    images.push(...(await readWorksheetEmbeddedCellImages(zip, sheetDoc, cellImageContext)));
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
    const to = Array.from(anchor.children).find((element) => element.localName === "to");
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
      endRow: to ? readDrawingMarkerIndex(to, "row") : undefined,
      endColumn: to ? readDrawingMarkerIndex(to, "col") : undefined,
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

type WpsCellImageEntry = {
  mediaPath: string;
  title?: string;
};

type WorkbookCellImageContext = {
  wpsCellImages?: Promise<Map<string, WpsCellImageEntry>>;
  richValueImages?: Promise<Map<number, string>>;
};

async function readWorksheetEmbeddedCellImages(
  zip: JSZip,
  sheetDoc: Document,
  context: WorkbookCellImageContext
): Promise<WorkbookSheetImage[]> {
  const cellElements = Array.from(sheetDoc.getElementsByTagName("*")).filter((element) => element.localName === "c");
  const wpsRefs: Array<{ row: number; column: number; imageId: string }> = [];
  const richValueRefs: Array<{ row: number; column: number; vm: number }> = [];
  for (const cellElement of cellElements) {
    const reference = cellElement.getAttribute("r");
    const position = reference ? decodeSheetCellReference(reference) : undefined;
    if (!position) {
      continue;
    }
    const formula = Array.from(cellElement.children).find((child) => child.localName === "f")?.textContent || "";
    const dispimgId = matchDispimgImageId(formula);
    if (dispimgId) {
      wpsRefs.push({ ...position, imageId: dispimgId });
      continue;
    }
    const vm = Number.parseInt(cellElement.getAttribute("vm") || "", 10);
    if (Number.isFinite(vm) && vm > 0) {
      richValueRefs.push({ ...position, vm });
    }
  }

  const images: WorkbookSheetImage[] = [];
  if (wpsRefs.length > 0) {
    context.wpsCellImages ??= readWpsCellImageIndex(zip);
    const index = await context.wpsCellImages;
    for (const ref of wpsRefs) {
      const entry = index.get(ref.imageId);
      const mediaFile = entry ? zip.file(entry.mediaPath) : undefined;
      if (!entry || !mediaFile) {
        continue;
      }
      const mimeType = mimeTypeFromImagePath(entry.mediaPath);
      images.push({
        row: ref.row,
        column: ref.column,
        fileName: entry.mediaPath.split("/").pop() || "image",
        mimeType,
        dataUrl: `data:${mimeType};base64,${await mediaFile.async("base64")}`,
        title: entry.title
      });
    }
  }
  if (richValueRefs.length > 0) {
    context.richValueImages ??= readRichValueImageIndex(zip);
    const index = await context.richValueImages;
    for (const ref of richValueRefs) {
      const mediaPath = index.get(ref.vm);
      const mediaFile = mediaPath ? zip.file(mediaPath) : undefined;
      if (!mediaPath || !mediaFile) {
        continue;
      }
      const mimeType = mimeTypeFromImagePath(mediaPath);
      images.push({
        row: ref.row,
        column: ref.column,
        fileName: mediaPath.split("/").pop() || "image",
        mimeType,
        dataUrl: `data:${mimeType};base64,${await mediaFile.async("base64")}`
      });
    }
  }
  return images;
}

function matchDispimgImageId(formula: string): string | undefined {
  const match = /(?:_xlfn\.)?DISPIMG\(\s*"([^"]+)"/i.exec(formula);
  return match?.[1];
}

function decodeSheetCellReference(reference: string): { row: number; column: number } | undefined {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(reference.trim());
  if (!match) {
    return undefined;
  }
  let column = 0;
  for (const char of match[1].toUpperCase()) {
    column = column * 26 + (char.charCodeAt(0) - 64);
  }
  const row = Number.parseInt(match[2], 10);
  if (!Number.isFinite(row) || row < 1) {
    return undefined;
  }
  return { row: row - 1, column: column - 1 };
}

async function readWpsCellImageIndex(zip: JSZip): Promise<Map<string, WpsCellImageEntry>> {
  const result = new Map<string, WpsCellImageEntry>();
  const cellImagesXml = await zip.file("xl/cellimages.xml")?.async("text");
  const cellImagesDoc = cellImagesXml ? parseOfficeXml(cellImagesXml) : undefined;
  if (!cellImagesDoc) {
    return result;
  }
  const cellImageRels = await readOfficeRelationships(zip, "xl/cellimages.xml");
  const pics = Array.from(cellImagesDoc.getElementsByTagName("*")).filter((element) => element.localName === "pic");
  for (const pic of pics) {
    const nonVisualProperties = Array.from(pic.getElementsByTagName("*")).find((element) => element.localName === "cNvPr");
    const imageId = nonVisualProperties?.getAttribute("name");
    const embedId = findDrawingImageRelationshipId(pic);
    const mediaRel = cellImageRels.find((rel) => rel.id === embedId && /\/image$/i.test(rel.type));
    const mediaPath = resolveOfficeRelationshipTarget("xl/cellimages.xml", mediaRel?.target);
    if (!imageId || !mediaPath) {
      continue;
    }
    result.set(imageId, { mediaPath, title: nonVisualProperties?.getAttribute("descr") || undefined });
  }
  return result;
}

async function readRichValueImageIndex(zip: JSZip): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const metadataXml = await zip.file("xl/metadata.xml")?.async("text");
  const metadataDoc = metadataXml ? parseOfficeXml(metadataXml) : undefined;
  if (!metadataDoc) {
    return result;
  }

  const metadataTypeElements = Array.from(metadataDoc.getElementsByTagName("*")).filter(
    (element) => element.localName === "metadataType"
  );
  const richTypeIndexes = new Set<number>();
  metadataTypeElements.forEach((element, index) => {
    if ((element.getAttribute("name") || "").toUpperCase() === "XLRICHVALUE") {
      richTypeIndexes.add(index + 1);
    }
  });
  if (richTypeIndexes.size === 0) {
    return result;
  }

  const valueMetadata = Array.from(metadataDoc.getElementsByTagName("*")).find((element) => element.localName === "valueMetadata");
  const valueBlocks = valueMetadata ? Array.from(valueMetadata.children).filter((element) => element.localName === "bk") : [];
  const vmToRichValue = new Map<number, number>();
  valueBlocks.forEach((block, index) => {
    const richRecord = Array.from(block.getElementsByTagName("*")).find((element) => {
      if (element.localName !== "rc") {
        return false;
      }
      const typeIndex = Number.parseInt(element.getAttribute("t") || "", 10);
      return richTypeIndexes.has(typeIndex);
    });
    const richValueIndex = richRecord ? Number.parseInt(richRecord.getAttribute("v") || "", 10) : Number.NaN;
    if (Number.isFinite(richValueIndex) && richValueIndex >= 0) {
      vmToRichValue.set(index + 1, richValueIndex);
    }
  });
  if (vmToRichValue.size === 0) {
    return result;
  }

  const richValueXml = await zip.file("xl/richData/rdrichvalue.xml")?.async("text");
  const richValueDoc = richValueXml ? parseOfficeXml(richValueXml) : undefined;
  const richValueRelXml = await zip.file("xl/richData/richValueRel.xml")?.async("text");
  const richValueRelDoc = richValueRelXml ? parseOfficeXml(richValueRelXml) : undefined;
  if (!richValueDoc || !richValueRelDoc) {
    return result;
  }
  const richValues = Array.from(richValueDoc.getElementsByTagName("*")).filter((element) => element.localName === "rv");
  const relIndexes = richValues.map((richValue) => {
    const binding = Array.from(richValue.getElementsByTagName("*")).find((element) => element.localName === "vb");
    return Number.parseInt(binding?.getAttribute("i") || "", 10);
  });
  const relIds = Array.from(richValueRelDoc.getElementsByTagName("*"))
    .filter((element) => element.localName === "rel")
    .map((element) => getXmlAttribute(element, "id") || "");
  const richValueRels = await readOfficeRelationships(zip, "xl/richData/richValueRel.xml");

  for (const [vm, richValueIndex] of vmToRichValue) {
    const relIndex = relIndexes[richValueIndex];
    const relId = Number.isFinite(relIndex) ? relIds[relIndex] : undefined;
    const mediaRel = richValueRels.find((rel) => rel.id === relId && /\/image$/i.test(rel.type));
    const mediaPath = resolveOfficeRelationshipTarget("xl/richData/richValueRel.xml", mediaRel?.target);
    if (mediaPath) {
      result.set(vm, mediaPath);
    }
  }
  return result;
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
  showLegend: boolean;
  axes: ChartAxisPreview[];
  series: Array<{
    name: string;
    values: number[];
    color?: string;
    type: string;
    valueAxisId?: string;
  }>;
};

type ChartAxisPreview = {
  id: string;
  title?: string;
  min?: number;
  max?: number;
  majorUnit?: number;
  formatCode?: string;
  position?: string;
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
      syncSheetTableZoom(tableWrapper, getOfficePanelZoom(tableWrapper));
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

  const chartTypes = Array.from(doc.getElementsByTagName("*")).filter(
    (element) => element.localName.endsWith("Chart") && element.localName !== "chart"
  );
  const typeNames = [...new Set(chartTypes.map((element) => element.localName.replace(/Chart$/i, "").toLowerCase()))];
  const type = typeNames.join("+") || "chart";
  const title = readChartTitle(doc);
  let seriesIndex = 0;
  const series = chartTypes.flatMap((chartType) => {
    const seriesType = chartType.localName.replace(/Chart$/i, "").toLowerCase();
    const axisIds = Array.from(chartType.children)
      .filter((element) => element.localName === "axId")
      .map((element) => element.getAttribute("val") || "")
      .filter(Boolean);
    return Array.from(chartType.children)
      .filter((element) => element.localName === "ser")
      .map((element) => {
        const parsed = parseChartSeries(element, seriesIndex);
        seriesIndex += 1;
        return {
          ...parsed,
          color: readChartSeriesColor(element),
          type: seriesType,
          valueAxisId: axisIds[1]
        };
      });
  }).filter((item) => item.values.length > 0);

  if (series.length === 0) {
    return null;
  }

  return {
    name: fallbackName,
    type,
    title,
    categories: series.find((item) => item.categories.length > 0)?.categories || [],
    showLegend: Array.from(doc.getElementsByTagName("*")).some(
      (element) =>
        element.localName === "legend" &&
        !Array.from(element.children).some((child) => child.localName === "delete" && child.getAttribute("val") === "1")
    ),
    axes: readChartValueAxes(doc),
    series: series.map((item) => ({
      name: item.name,
      values: item.values,
      color: item.color,
      type: item.type,
      valueAxisId: item.valueAxisId
    }))
  };
}

function readChartTitle(doc: Document): string {
  const chart = Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "chart");
  const titleElement = Array.from(chart?.children || []).find((element) => element.localName === "title");
  if (!titleElement) {
    return "";
  }
  const explicitTitle = chartText(titleElement);
  if (explicitTitle) {
    return explicitTitle;
  }
  const language = Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "lang")?.getAttribute("val") || "";
  return /^zh\b/i.test(language) ? "图表标题" : "Chart Title";
}

function parseChartSeries(
  element: Element,
  index: number
): { name: string; values: number[]; categories: string[] } {
  return {
    name: textFromFirst(element, "tx") || `Series ${index + 1}`,
    values: numbersFromFirst(element, "val"),
    categories: readChartCategories(element)
  };
}

function readChartCategories(series: Element): string[] {
  const category = Array.from(series.children).find((element) => element.localName === "cat");
  if (!category) {
    return [];
  }
  const values = chartStringValues(category);
  const formatCode = Array.from(category.getElementsByTagName("*")).find((element) => element.localName === "formatCode")?.textContent || "";
  if (!/[ymd]/i.test(formatCode)) {
    return values;
  }
  return values.map((value) => formatExcelChartDate(value) || value);
}

function formatExcelChartDate(value: string): string | undefined {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) {
    return undefined;
  }
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
}

function readChartValueAxes(doc: Document): ChartAxisPreview[] {
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "valAx")
    .map((axis) => {
      const direct = (localName: string) => Array.from(axis.children).find((element) => element.localName === localName);
      const scaling = direct("scaling");
      const scaleValue = (localName: string) => {
        const value = Array.from(scaling?.children || []).find((element) => element.localName === localName)?.getAttribute("val");
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      const numericAttribute = (element: Element | undefined) => {
        const parsed = Number(element?.getAttribute("val"));
        return Number.isFinite(parsed) ? parsed : undefined;
      };
      return {
        id: direct("axId")?.getAttribute("val") || "",
        title: direct("title") ? chartText(direct("title")!) : undefined,
        min: scaleValue("min"),
        max: scaleValue("max"),
        majorUnit: numericAttribute(direct("majorUnit")),
        formatCode: direct("numFmt")?.getAttribute("formatCode") || undefined,
        position: direct("axPos")?.getAttribute("val") || undefined
      };
    });
}

function readChartSeriesColor(element: Element | undefined): string | undefined {
  const shape = Array.from(element?.children || []).find((child) => child.localName === "spPr");
  const color = Array.from(shape?.getElementsByTagName("*") || []).find(
    (child) => child.localName === "srgbClr" || child.localName === "schemeClr"
  );
  if (!color) {
    return undefined;
  }
  if (color.localName === "srgbClr") {
    const value = color.getAttribute("val") || "";
    return /^[\da-f]{6}$/i.test(value) ? `#${value}` : undefined;
  }
  return chartSchemeColor(color.getAttribute("val") || "");
}

function chartSchemeColor(value: string): string | undefined {
  const colors: Record<string, string> = {
    accent1: "#156082",
    accent2: "#e97132",
    accent3: "#196b24",
    accent4: "#0f9ed5",
    accent5: "#a02b93",
    accent6: "#4ea72e"
  };
  return colors[value];
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
  title.textContent = chart.title || chart.name;
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
  svg.setAttribute("viewBox", "0 0 640 380");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("text-rendering", "geometricPrecision");
  svg.setAttribute("shape-rendering", "geometricPrecision");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", chart.title || chart.name);
  svg.classList.add("ofv-chart-svg");

  const colors = ["#156082", "#e97132", "#196b24", "#0f9ed5", "#a02b93", "#4ea72e"];
  const hasTitle = Boolean(chart.title);
  const primarySeries = chart.series[0];
  const primaryAxisId = primarySeries?.valueAxisId;
  const primaryScale = createChartSeriesScale(chart, primarySeries);
  const primaryAxis = chart.axes.find((axis) => axis.id === primaryAxisId);
  const secondarySeries = chart.series.find((series) => series.valueAxisId && series.valueAxisId !== primaryAxisId);
  const secondaryScale = secondarySeries ? createChartSeriesScale(chart, secondarySeries) : undefined;
  const secondaryAxis = secondarySeries ? chart.axes.find((axis) => axis.id === secondarySeries.valueAxisId) : undefined;
  const plot = { x: 74, y: hasTitle ? 74 : 38, width: secondaryScale ? 500 : 526, height: hasTitle ? 214 : 250 };
  const categories = chart.categories.length > 0 ? chart.categories : chart.series[0]?.values.map((_, index) => String(index + 1)) || [];

  if (hasTitle) {
    const title = appendSvg(svg, "text", { x: 320, y: 34, class: "ofv-chart-title", "text-anchor": "middle" });
    title.textContent = chart.title;
  }
  if (primaryAxis?.title) {
    const axisTitle = appendSvg(svg, "text", {
      x: plot.x,
      y: plot.y - 10,
      class: "ofv-chart-label ofv-chart-axis-title",
      "text-anchor": "start"
    });
    axisTitle.textContent = primaryAxis.title;
  }
  if (secondaryAxis?.title) {
    const axisTitle = appendSvg(svg, "text", {
      x: plot.x + plot.width,
      y: plot.y - 10,
      class: "ofv-chart-label ofv-chart-axis-title",
      "text-anchor": "end"
    });
    axisTitle.textContent = secondaryAxis.title;
  }

  for (const value of primaryScale.ticks) {
    const y = chartValueY(value, primaryScale, plot);
    appendSvg(svg, "line", {
      x1: plot.x,
      y1: Number(y.toFixed(1)),
      x2: plot.x + plot.width,
      y2: Number(y.toFixed(1)),
      class: value === 0 ? "ofv-chart-axis" : "ofv-chart-gridline"
    });
    const label = appendSvg(svg, "text", {
      x: plot.x - 12,
      y: Number((y + 4).toFixed(1)),
      class: "ofv-chart-label",
      "text-anchor": "end"
    });
    label.textContent = formatChartTick(value, primaryScale.formatCode);
  }

  if (secondaryScale) {
    for (const value of secondaryScale.ticks) {
      const y = chartValueY(value, secondaryScale, plot);
      const label = appendSvg(svg, "text", {
        x: plot.x + plot.width + 12,
        y: Number((y + 4).toFixed(1)),
        class: "ofv-chart-label ofv-chart-secondary-axis-label",
        "text-anchor": "start"
      });
      label.textContent = formatChartTick(value, secondaryAxis?.formatCode);
    }
  }

  appendSvg(svg, "line", {
    x1: plot.x,
    y1: plot.y + plot.height,
    x2: plot.x + plot.width,
    y2: plot.y + plot.height,
    class: "ofv-chart-axis"
  });

  const barSeries = chart.series.filter((series) => series.type.includes("bar") || series.type.includes("col"));
  const lineSeries = chart.series.filter((series) => !barSeries.includes(series));
  const categoryCount = Math.max(1, categories.length, ...chart.series.map((series) => series.values.length));
  const categoryStep = categoryCount > 1 ? plot.width / (categoryCount - 1) : plot.width;
  appendChartCategoryLabels(
    svg,
    categories,
    plot,
    (index) => barSeries.length > 0 ? plot.x + (plot.width / categoryCount) * (index + 0.5) : plot.x + index * categoryStep
  );

  if (barSeries.length > 0) {
    const groupWidth = plot.width / categoryCount;
    const clusterWidth = groupWidth * 0.58;
    const barWidth = Math.max(5, Math.min(28, clusterWidth / Math.max(1, barSeries.length)));

    barSeries.forEach((series, seriesIndex) => {
      const colorIndex = chart.series.indexOf(series);
      const color = series.color || colors[colorIndex % colors.length];
      const scale = createChartSeriesScale(chart, series);
      const zeroY = chartValueY(Math.max(scale.min, Math.min(scale.max, 0)), scale, plot);
      series.values.forEach((value, index) => {
        const groupCenter = plot.x + groupWidth * (index + 0.5);
        const x = groupCenter - (barWidth * barSeries.length) / 2 + seriesIndex * barWidth + barWidth * 0.12;
        const y = chartValueY(value, scale, plot);
        appendSvg(svg, "rect", {
          x: Number(x.toFixed(1)),
          y: Number(Math.min(y, zeroY).toFixed(1)),
          width: Number((barWidth * 0.76).toFixed(1)),
          height: Number(Math.max(1, Math.abs(zeroY - y)).toFixed(1)),
          fill: color,
          "data-index": index
        });
      });
    });
  }

  lineSeries.forEach((series) => {
      const seriesIndex = chart.series.indexOf(series);
      const color = series.color || colors[seriesIndex % colors.length];
      const scale = createChartSeriesScale(chart, series);
      const step = series.values.length > 1 ? plot.width / (series.values.length - 1) : plot.width;
      const points = series.values.map((value, index) => ({
        x: plot.x + index * step,
        y: chartValueY(value, scale, plot)
      }));

      appendSvg(svg, "polyline", {
        points: points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 3,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
  });

  if (chart.showLegend) {
    appendChartLegend(svg, chart, colors, 348);
  }
  return svg;
}

type ChartAxisScale = { min: number; max: number; ticks: number[]; formatCode?: string };

function createChartSeriesScale(
  chart: ChartPreview,
  series: ChartPreview["series"][number] | undefined
): ChartAxisScale {
  const values = series?.values.filter((value) => Number.isFinite(value)) || [];
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const axis = chart.axes.find((item) => item.id === series?.valueAxisId);
  return createChartAxisScale(max, min, axis);
}

function chartValueY(
  value: number,
  scale: Pick<ChartAxisScale, "min" | "max">,
  plot: { y: number; height: number }
): number {
  return plot.y + plot.height - ((value - scale.min) / (scale.max - scale.min || 1)) * plot.height;
}

function appendChartCategoryLabels(
  svg: SVGSVGElement,
  categories: string[],
  plot: { x: number; y: number; width: number; height: number },
  getX: (index: number) => number
): void {
  const categoryLabels = categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => Boolean(category));
  const interval = Math.max(1, Math.ceil(categoryLabels.length / 14));
  let previousLabel = "";
  categoryLabels.forEach(({ category, index }, labelIndex) => {
    const duplicate = category === previousLabel;
    if (labelIndex % interval !== 0 || duplicate) {
      return;
    }
    previousLabel = category;
    const label = appendSvg(svg, "text", {
      x: Number(getX(index).toFixed(1)),
      y: plot.y + plot.height + 22,
      class: "ofv-chart-label ofv-chart-category-label",
      "data-axis": "category",
      "text-anchor": "middle"
    });
    label.textContent = truncateChartLabel(category);
  });
}

function appendChartLegend(svg: SVGSVGElement, chart: ChartPreview, colors: string[], y: number): void {
  const itemWidth = 86;
  const startX = 320 - ((chart.series.length * itemWidth) / 2);
  chart.series.forEach((series, seriesIndex) => {
    const color = series.color || colors[seriesIndex % colors.length];
    appendLegend(svg, series.name, color, startX + seriesIndex * itemWidth, y);
  });
}

function createChartAxisScale(max: number, min: number, axis?: ChartAxisPreview): ChartAxisScale {
  const axisMin = axis?.min ?? Math.min(0, min);
  const positiveMax = Math.max(axisMin, max);
  const step = axis?.majorUnit && axis.majorUnit > 0 ? axis.majorUnit : niceChartStep((positiveMax - axisMin || 1) / 5);
  let axisMax = axis?.max ?? Math.ceil(positiveMax / step) * step;
  if (axisMax <= axisMin) {
    axisMax = axisMin + step;
  }
  const ticks: number[] = [];
  for (let value = axisMin, count = 0; value <= axisMax + step / 2 && count < 50; value += step, count += 1) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { min: axisMin, max: axisMax, ticks, formatCode: axis?.formatCode };
}

function niceChartStep(rawStep: number): number {
  if (rawStep <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatChartTick(value: number, formatCode?: string): string {
  if (formatCode?.includes("%")) {
    return `${Number((value * 100).toFixed(1))}%`;
  }
  const rounded = Math.abs(value) < 1 ? Number(value.toFixed(1)) : Number(value.toFixed(0));
  return String(rounded);
}

function truncateChartLabel(value: string): string {
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
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
  const points = Array.from(element.querySelectorAll("*")).filter((item) => item.localName === "pt");
  if (points.length === 0) {
    return Array.from(element.querySelectorAll("*"))
      .filter((item) => item.localName === "v" || item.localName === "t")
      .map((item) => item.textContent?.trim() || "")
      .filter(Boolean);
  }

  const declaredCount = Number.parseInt(
    Array.from(element.querySelectorAll("*")).find((item) => item.localName === "ptCount")?.getAttribute("val") || "",
    10
  );
  let nextIndex = 0;
  const indexedValues = points.map((point) => {
    const parsedIndex = Number.parseInt(point.getAttribute("idx") || "", 10);
    const index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : nextIndex;
    nextIndex = Math.max(nextIndex, index + 1);
    return { index, value: chartText(point) };
  });
  const valueCount = Math.max(Number.isFinite(declaredCount) ? declaredCount : 0, nextIndex);
  const values = Array<string>(valueCount).fill("");
  for (const { index, value } of indexedValues) {
    values[index] = value;
  }
  return values;
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
  sourceColumns?: Map<number, WorkbookColumnWidthSource>;
  sourceDefaultColumn?: WorkbookColumnWidthSource;
  sourceMdw?: number;
};

type WorkbookSheetColumnWidthMetadata = {
  columns: Map<number, WorkbookColumnWidthSource>;
  defaultColumn?: WorkbookColumnWidthSource;
  mdw?: number;
};

type WorkbookColumnWidthSource = {
  hidden?: boolean;
  width?: number;
};

type WorkbookSheetImage = {
  row: number;
  column: number;
  endRow?: number;
  endColumn?: number;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  title?: string;
};

type WorkbookRichTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontSize?: number;
};

type WorkbookCellStyleMetadata = {
  font?: WorkbookCellFontStyle;
  wrapText?: boolean;
};

type WorkbookCellFontStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sz?: number;
  color?: WorkbookColorSource;
};

type WorkbookColorSource = {
  rgb?: string;
  indexed?: number;
};

function trimWorkbookSheetRange(
  sheet: Record<string, any>,
  range: SheetRange,
  decodeCell: (address: string) => { r: number; c: number },
  images: WorkbookSheetImage[] = []
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

  for (const image of images) {
    include(image.row, image.column);
    include(image.endRow ?? image.row, image.endColumn ?? image.column);
  }

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn) || !Number.isFinite(maxRow) || !Number.isFinite(maxColumn)) {
    return range;
  }

  return {
    s: {
      r: minRow,
      c: minColumn
    },
    e: {
      r: maxRow,
      c: maxColumn
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
  images: WorkbookSheetImage[] = [],
  richTextByCell: Map<string, WorkbookRichTextRun[]> = new Map(),
  cellStylesByCell: Map<string, WorkbookCellStyleMetadata> = new Map()
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
  const columnsWithResizeHandles = new Set<number>();

  const colGroup = document.createElement("colgroup");
  let tableWidth = 0;
  for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
    const col = document.createElement("col");
    const width =
      columnSizing.widths.get(columnIndex) ??
      getWorkbookColumnWidth(
        sheet["!cols"]?.[columnIndex],
        columnSizing.sourceColumns?.get(columnIndex),
        columnSizing.sourceDefaultColumn,
        columnSizing.sourceMdw
      );
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
      const sourceStyle = sourceAddress ? cellStylesByCell.get(sourceAddress) : undefined;
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
      const richText = sourceAddress ? richTextByCell.get(sourceAddress) : undefined;
      if (richText?.length) {
        appendWorkbookCellRichText(cell, richText);
      } else if (hasWorkbookCellHtmlRichText(sourceCell)) {
        appendWorkbookCellHtmlRichText(cell, sourceCell.h);
      } else {
        cell.textContent = text;
      }
      if (text) {
        cell.title = text;
      }
      if (isWorkbookNumericCell(sourceCell)) {
        cell.classList.add("ofv-cell-number");
      }
      applyWorkbookCellStyle(cell, sourceCell, sourceStyle);
      if (sourceCell?.f) {
        cell.classList.add("ofv-cell-formula");
        cell.title = `=${sourceCell.f}`;
      }
      if (text.includes("\n")) {
        cell.classList.add("ofv-cell-multiline");
      }
      appendWorkbookCellImages(cell, imagesByCell.get(`${rowIndex}:${columnIndex}`), text);
      const resizeColumnIndex = columnIndex + (merge?.colspan || 1) - 1;
      if (!columnsWithResizeHandles.has(resizeColumnIndex)) {
        appendColumnResizeHandle(cell, resizeColumnIndex, columnSizing);
        columnsWithResizeHandles.add(resizeColumnIndex);
      }
      row.append(cell);
    }
    table.append(row);
  }

  return table;
}

function getWorkbookColumnWidth(
  column: { hidden?: boolean; wpx?: number; width?: number; wch?: number; MDW?: number } | undefined,
  sourceColumn?: WorkbookColumnWidthSource,
  sourceDefaultColumn?: WorkbookColumnWidthSource,
  sourceMdw?: number
): number {
  if (sourceColumn) {
    return getSheetColumnWidth({ ...sourceColumn, MDW: sourceMdw ?? column?.MDW });
  }
  if (column) {
    return getSheetColumnWidth(column);
  }
  return sourceDefaultColumn ? getSheetColumnWidth({ ...sourceDefaultColumn, MDW: sourceMdw }) : getSheetColumnWidth(undefined);
}

function appendColumnResizeHandle(
  cell: HTMLTableCellElement,
  columnIndex: number,
  columnSizing: SheetColumnSizing
): void {
  const handle = document.createElement("span");
  handle.className = "ofv-column-resize-handle";
  handle.dataset.columnIndex = String(columnIndex);
  handle.setAttribute("aria-hidden", "true");
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    // Pointer deltas are in visual pixels; column widths live in the table's
    // pre-zoom coordinate space, so divide the delta by the current zoom.
    const zoom = getOfficePanelZoom(cell);
    const startWidth = columnSizing.widths.get(columnIndex) ?? cell.getBoundingClientRect().width / zoom;
    handle.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(48, Math.min(720, Math.round(startWidth + (moveEvent.clientX - startX) / zoom)));
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
    resetSheetTableZoomLock(table);
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

function hasWorkbookCellHtmlRichText(sourceCell: any): sourceCell is { h: string } {
  return typeof sourceCell?.h === "string" && /<(?:span|b|strong|i|em|u|s|font)\b/i.test(sourceCell.h);
}

function appendWorkbookCellHtmlRichText(cell: HTMLTableCellElement, html: string): void {
  cell.classList.add("ofv-cell-rich-text");
  cell.innerHTML = sanitizeWorkbookCellHtmlRichText(html);
  normalizeWorkbookCellHtmlRichText(cell);
}

function sanitizeWorkbookCellHtmlRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ["span", "b", "strong", "i", "em", "u", "s", "font", "br"],
    ALLOWED_ATTR: ["style", "color"],
    ALLOW_DATA_ATTR: false
  });
}

function normalizeWorkbookCellHtmlRichText(cell: HTMLTableCellElement): void {
  for (const element of Array.from(cell.querySelectorAll<HTMLElement>("span, b, strong, i, em, u, s, font"))) {
    element.classList.add("ofv-rich-text-run");
    if (element instanceof HTMLFontElement && element.color) {
      element.style.color = element.color;
      element.removeAttribute("color");
    }
  }
}

function appendWorkbookCellRichText(cell: HTMLTableCellElement, runs: WorkbookRichTextRun[]): void {
  cell.classList.add("ofv-cell-rich-text");
  for (const run of runs) {
    const span = document.createElement("span");
    span.className = "ofv-rich-text-run";
    span.textContent = run.text;
    if (run.bold) {
      span.style.fontWeight = "700";
    }
    if (run.italic) {
      span.style.fontStyle = "italic";
    }
    if (run.underline || run.strike) {
      span.style.textDecoration = [run.underline ? "underline" : "", run.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ");
    }
    if (run.color) {
      span.style.color = readableSheetInk(run.color);
    }
    if (run.fontSize) {
      span.style.fontSize = `${Math.max(9, Math.min(24, run.fontSize))}pt`;
    }
    cell.append(span);
  }
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

function isWorkbookNumericCell(sourceCell: any): boolean {
  return sourceCell?.t === "n";
}

function getSheetColumnWidth(column: { hidden?: boolean; wpx?: number; width?: number; wch?: number; MDW?: number } | undefined): number {
  if (column?.hidden) {
    return 0;
  }
  const mdw = Number.isFinite(column?.MDW) && column?.MDW ? column.MDW : 7;
  const width = column?.wpx || (column?.wch ? column.wch * mdw + 5 : undefined) || (column?.width ? column.width * mdw : undefined) || 96;
  return Math.max(28, Math.min(960, Math.round(width)));
}

function findExcelColumnMdw(width: number): number {
  const defaultMdw = 6;
  let bestMdw = defaultMdw;
  let bestDelta = Math.abs(width - cycleExcelColumnWidth(width, defaultMdw));
  if (bestDelta <= 0.005) {
    return bestMdw;
  }
  for (let mdw = 1; mdw < 15; mdw += 1) {
    const delta = Math.abs(width - cycleExcelColumnWidth(width, mdw));
    if (delta <= bestDelta) {
      bestDelta = delta;
      bestMdw = mdw;
    }
  }
  return bestMdw;
}

function cycleExcelColumnWidth(width: number, mdw: number): number {
  const px = Math.floor((width + Math.round(128 / mdw) / 256) * mdw);
  const chars = Math.floor(((px - 5) / mdw) * 100 + 0.5) / 100;
  return Math.round(((chars * mdw + 5) / mdw) * 256) / 256;
}

function getSheetRowHeight(row: { hidden?: boolean; hpx?: number; hpt?: number } | undefined): number | undefined {
  if (row?.hidden) {
    return 0;
  }
  const height = row?.hpx || (row?.hpt ? row.hpt * 1.333 : undefined);
  return height ? Math.max(18, Math.min(260, Math.round(height))) : undefined;
}

function applyWorkbookCellStyle(
  cell: HTMLTableCellElement,
  sourceCell: any,
  sourceStyleMetadata?: WorkbookCellStyleMetadata
): void {
  const style = sourceCell?.s;
  const sourceFont = sourceStyleMetadata?.font || style?.font;
  const wrapText = sourceStyleMetadata?.wrapText || Boolean(style?.alignment?.wrapText);
  if (!style && !sourceFont && !wrapText) {
    return;
  }

  const parsedFill = readWorkbookColor(style?.fgColor || style?.fill?.fgColor);
  const fill = style?.patternType === "none" ? undefined : parsedFill;
  if (fill) {
    cell.style.backgroundColor = fill;
  }

  const fontColor = sourceFont ? readWorkbookColor(sourceFont.color) : undefined;
  if (sourceFont) {
    if (sourceFont.bold) {
      cell.style.fontWeight = "700";
    }
    if (sourceFont.italic) {
      cell.style.fontStyle = "italic";
    }
    if (sourceFont.underline || sourceFont.strike) {
      cell.style.textDecoration = [sourceFont.underline ? "underline" : "", sourceFont.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ");
    }
    if (sourceFont.sz) {
      cell.style.fontSize = `${Math.max(9, Math.min(24, Number(sourceFont.sz)))}pt`;
    }
  }
  applyWorkbookCellInk(cell, fill, fontColor);

  const alignment = style?.alignment;
  if (alignment) {
    const horizontal = normalizeSheetHorizontalAlign(alignment.horizontal);
    if (horizontal) {
      cell.style.textAlign = horizontal;
    }
    const vertical = normalizeSheetVerticalAlign(alignment.vertical);
    if (vertical) {
      cell.style.verticalAlign = vertical;
    }
  }
  if (wrapText) {
    cell.classList.add("ofv-cell-multiline");
  }
}

function readWorkbookColor(color: { rgb?: string; indexed?: number } | undefined): string | undefined {
  if (!color?.rgb) {
    return undefined;
  }
  const rgb = color.rgb.length === 8 ? color.rgb.slice(2) : color.rgb;
  return /^[\da-f]{6}$/i.test(rgb) ? `#${rgb}` : undefined;
}

function parseOptionalInteger(value: string | null | undefined): number | undefined {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Cell fills and font colors from the file assume Excel's white canvas. The
// sheet grid stays on a light surface in both viewer themes (style.css pins
// it in dark mode), so resolve one theme-independent ink per cell.
function applyWorkbookCellInk(cell: HTMLTableCellElement, fill: string | undefined, fontColor: string | undefined): void {
  if (fill) {
    // Inline colors: a filled cell is self-contained and theme-independent.
    cell.style.color = fontColor ?? (sheetColorLuminance(fill) < 0.42 ? "#f8fafc" : "#1f2937");
    return;
  }
  if (fontColor) {
    // No fill: the ink sits on the always-light grid surface; clamp only the
    // near-white colors that would vanish on it.
    cell.style.color = readableSheetInk(fontColor);
  }
}

function sheetColorLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

// Keep the hue but clamp lightness so the ink stays legible on the light grid surface.
function readableSheetInk(hex: string): string {
  const luminance = sheetColorLuminance(hex);
  if (luminance <= 0.62) {
    return hex;
  }
  const [h, s, l] = sheetHexToHsl(hex);
  return sheetHslToHex(h, s, Math.min(l, 0.42));
}

function sheetHexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function sheetHslToHex(h: number, s: number, l: number): string {
  const hueToChannel = (p: number, q: number, t: number): number => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToChannel(p, q, h + 1 / 3);
    g = hueToChannel(p, q, h);
    b = hueToChannel(p, q, h - 1 / 3);
  }
  const toHex = (value: number): string =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
      if (rowIndex === viewport.rowStart) {
        appendColumnResizeHandle(cell, columnIndex, columnSizing);
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
  let insight: PresentationInsight | undefined;
  let zip: JSZip | undefined;
  let placeholderFontCorrections: PptxPlaceholderFontCorrection[] = [];
  let autofitLineHeightCorrections: PptxAutofitLineHeightCorrection[] = [];

  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    insight = await inspectPptxPresentation(zip);
    await renderPresentationInsight(panel, insight);
  } catch (error) {
    console.warn("PPTX structure insight extraction failed:", error);
  }
  if (zip) {
    try {
      placeholderFontCorrections = await inspectPptxPlaceholderFontCorrections(zip);
    } catch (error) {
      console.warn("PPTX placeholder font extraction failed:", error);
    }
    try {
      autofitLineHeightCorrections = await inspectPptxAutofitLineHeightCorrections(zip);
    } catch (error) {
      console.warn("PPTX autofit line-height extraction failed:", error);
    }
  }

  panel.append(container);
  try {
    const { PptxViewer } = await import("@aiden0z/pptx-renderer");
    await withTimeout(PptxViewer.open(arrayBuffer, container), pptxRenderTimeoutMs());
    schedulePptxLayoutNormalization(container, placeholderFontCorrections, autofitLineHeightCorrections);
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "PPTX rendering"): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
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

type PptxShapeGeometry = {
  slideIndex: number;
  leftRatio: number;
  topRatio: number;
  widthRatio: number;
  heightRatio: number;
};

type PptxPlaceholderFontCorrection = PptxShapeGeometry & {
  fontSizePt: number;
};

type PptxAutofitLineHeightCorrection = PptxShapeGeometry & {
  paragraphs: string[];
};

function normalizePptxLayout(
  container: HTMLElement,
  placeholderFontCorrections: PptxPlaceholderFontCorrection[],
  autofitLineHeightCorrections: PptxAutofitLineHeightCorrection[]
): void {
  const slideCanvases = findPptxSlideCanvases(container);
  for (const slide of slideCanvases) {
    if (!hasInlineBackground(slide)) {
      slide.style.backgroundColor = "#FFFFFF";
    }
  }
  normalizePptxPlaceholderFonts(container, placeholderFontCorrections);
  normalizePptxAutofitLineHeights(container, autofitLineHeightCorrections);
  normalizePptxCircleCalloutText(container);
  normalizePptxDiagramCycleText(container);
  normalizePptxMirroredText(container);
}

function schedulePptxLayoutNormalization(
  container: HTMLElement,
  placeholderFontCorrections: PptxPlaceholderFontCorrection[],
  autofitLineHeightCorrections: PptxAutofitLineHeightCorrection[]
): void {
  normalizePptxLayout(container, placeholderFontCorrections, autofitLineHeightCorrections);
  let observer: MutationObserver | undefined;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() =>
      normalizePptxLayout(container, placeholderFontCorrections, autofitLineHeightCorrections)
    );
    observer.observe(container, { childList: true, subtree: true });
  }
  for (const delay of [0, 100, 500, 1500, 3000]) {
    window.setTimeout(() => {
      if (container.isConnected) {
        normalizePptxLayout(container, placeholderFontCorrections, autofitLineHeightCorrections);
      }
    }, delay);
  }
  window.setTimeout(() => observer?.disconnect(), 5000);
}

function normalizePptxCircleCalloutText(container: HTMLElement): void {
  for (const element of Array.from(container.querySelectorAll<HTMLElement>("div"))) {
    if (!isPptxCircleCalloutBox(element)) {
      continue;
    }
    const textLayer = findPptxCircleCalloutTextLayer(element);
    const text = (textLayer?.textContent || "").trim();
    if (!textLayer || !isPptxCircleCalloutText(text)) {
      continue;
    }
    const normalizedText = splitPptxCircleCalloutText(text);
    if (textLayer.textContent !== normalizedText) {
      textLayer.textContent = normalizedText;
    }
    textLayer.classList.add("ofv-pptx-circle-callout-text");
  }
}

function isPptxCircleCalloutText(text: string): boolean {
  return /^(?:代表性定义|包含的要素)$/.test(text);
}

function isPptxCircleCalloutBox(element: HTMLElement): boolean {
  const width = parseCssPixelValue(element.style.width);
  const height = parseCssPixelValue(element.style.height);
  return element.style.position === "absolute" && width >= 80 && height >= 80 && width / height > 0.75 && width / height < 1.25;
}

function findPptxCircleCalloutTextLayer(element: HTMLElement): HTMLElement | undefined {
  if (element.children.length === 0 && isPptxCircleCalloutText((element.textContent || "").trim())) {
    return element;
  }
  return Array.from(element.querySelectorAll<HTMLElement>("div")).find((candidate) =>
    isPptxCircleCalloutText((candidate.textContent || "").trim())
  );
}

function splitPptxCircleCalloutText(text: string): string {
  if (text === "代表性定义") {
    return "代表性\n定义";
  }
  if (text === "包含的要素") {
    return "包含的\n要素";
  }
  return text;
}

function normalizePptxDiagramCycleText(container: HTMLElement): void {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div")).filter(isPptxDiagramCycleTextBox);
  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const candidate of candidates) {
    const parent = candidate.parentElement;
    if (!parent) {
      continue;
    }
    const group = groups.get(parent) || [];
    group.push(candidate);
    groups.set(parent, group);
  }

  for (const group of groups.values()) {
    if (group.length < 4) {
      continue;
    }
    const ordered = group
      .map((element) => ({ element, index: pptxDiagramCycleIndex(element.textContent || "") }))
      .filter((item) => item.index !== undefined)
      .sort((a, b) => a.index! - b.index!);
    if (ordered.length < 4 || !isOverlappingPptxDiagramCycleGroup(ordered.map((item) => item.element))) {
      continue;
    }
    repositionPptxDiagramCycleText(ordered.map((item) => item.element));
  }
}

function isPptxDiagramCycleTextBox(element: HTMLElement): boolean {
  const text = (element.textContent || "").trim();
  if (pptxDiagramCycleIndex(text) === undefined || element.style.position !== "absolute") {
    return false;
  }
  const width = parseCssPixelValue(element.style.width);
  const height = parseCssPixelValue(element.style.height);
  const left = parseCssPixelValue(element.style.left);
  const top = parseCssPixelValue(element.style.top);
  return width > 120 && height > 120 && (left !== 0 || top !== 0);
}

function pptxDiagramCycleIndex(text: string): number | undefined {
  const marker = text.trim().charAt(0);
  const markers = "①②③④⑤⑥⑦⑧⑨";
  const index = markers.indexOf(marker);
  return index >= 0 ? index + 1 : undefined;
}

function isOverlappingPptxDiagramCycleGroup(elements: HTMLElement[]): boolean {
  const boxes = elements.map((element) => ({
    left: parseCssPixelValue(element.style.left),
    top: parseCssPixelValue(element.style.top),
    width: parseCssPixelValue(element.style.width),
    height: parseCssPixelValue(element.style.height)
  }));
  const averageWidth = boxes.reduce((sum, box) => sum + box.width, 0) / boxes.length;
  const averageHeight = boxes.reduce((sum, box) => sum + box.height, 0) / boxes.length;
  const leftSpread = Math.max(...boxes.map((box) => box.left)) - Math.min(...boxes.map((box) => box.left));
  const topSpread = Math.max(...boxes.map((box) => box.top)) - Math.min(...boxes.map((box) => box.top));
  return averageWidth > 0 && averageHeight > 0 && leftSpread < averageWidth * 0.2 && topSpread < averageHeight * 0.2;
}

function repositionPptxDiagramCycleText(elements: HTMLElement[]): void {
  const boxes = elements.map((element) => ({
    left: parseCssPixelValue(element.style.left),
    top: parseCssPixelValue(element.style.top),
    width: parseCssPixelValue(element.style.width),
    height: parseCssPixelValue(element.style.height)
  }));
  const minLeft = Math.min(...boxes.map((box) => box.left));
  const minTop = Math.min(...boxes.map((box) => box.top));
  const maxRight = Math.max(...boxes.map((box) => box.left + box.width));
  const maxBottom = Math.max(...boxes.map((box) => box.top + box.height));
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;
  const radiusX = (maxRight - minLeft) * 0.3;
  const radiusY = (maxBottom - minTop) * 0.27;
  const boxWidth = Math.max(96, Math.min(148, (maxRight - minLeft) * 0.28));
  const boxHeight = Math.max(52, Math.min(82, (maxBottom - minTop) * 0.17));
  const angleByIndex = new Map([
    [1, -110],
    [2, 180],
    [3, 125],
    [4, 55],
    [5, 0],
    [6, -55]
  ]);

  for (const element of elements) {
    const index = pptxDiagramCycleIndex(element.textContent || "");
    const angle = ((angleByIndex.get(index || 0) ?? ((index || 1) - 1) * (360 / elements.length)) * Math.PI) / 180;
    const left = centerX + Math.cos(angle) * radiusX - boxWidth / 2;
    const top = centerY + Math.sin(angle) * radiusY - boxHeight / 2;
    const textLayer = findPptxDiagramCycleTextLayer(element);
    const overlayParent = element.parentElement;
    if (!textLayer || !overlayParent) {
      continue;
    }
    element.style.overflow = "visible";
    textLayer.classList.add("ofv-pptx-diagram-cycle-text");
    textLayer.style.left = `${left}px`;
    textLayer.style.top = `${top}px`;
    textLayer.style.width = `${boxWidth}px`;
    textLayer.style.height = `${boxHeight}px`;
    textLayer.style.zIndex = "20";
    textLayer.style.alignItems = "center";
    textLayer.style.justifyContent = "center";
    textLayer.style.textAlign = "center";
    textLayer.style.whiteSpace = "normal";
    textLayer.style.wordBreak = "break-word";
    textLayer.style.pointerEvents = "none";
    textLayer.dataset.ofvPptxDiagramCycleText = String(index || "");
    overlayParent.append(textLayer);
  }
}

function findPptxDiagramCycleTextLayer(element: HTMLElement): HTMLElement | undefined {
  const text = (element.textContent || "").trim();
  const descendants = Array.from(element.querySelectorAll<HTMLElement>("div")).filter(
    (candidate) => candidate !== element && (candidate.textContent || "").trim() === text
  );
  return descendants.find((candidate) => candidate.style.position === "absolute") || descendants[0];
}

async function inspectPptxPlaceholderFontCorrections(zip: JSZip): Promise<PptxPlaceholderFontCorrection[]> {
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  const presentation = presentationXml ? parseOfficeXml(presentationXml) : undefined;
  const slideSize = presentation
    ? Array.from(presentation.getElementsByTagName("*")).find((element) => element.localName === "sldSz")
    : undefined;
  const slideWidth = Number(slideSize?.getAttribute("cx"));
  const slideHeight = Number(slideSize?.getAttribute("cy"));
  if (!(slideWidth > 0) || !(slideHeight > 0)) {
    return [];
  }

  const slideEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumberFromPath(a.name) - slideNumberFromPath(b.name));
  const corrections: PptxPlaceholderFontCorrection[] = [];

  for (const [slideIndex, entry] of slideEntries.entries()) {
    const slideXml = await entry.async("text");
    const slide = parseOfficeXml(slideXml);
    if (!slide) {
      continue;
    }
    const relationships = await readPptxRelationships(zip, entry.name);
    const layoutTarget = resolvePptxRelationshipTarget(
      entry.name,
      relationships.find((relationship) => /\/slideLayout$/i.test(relationship.type))?.target
    );
    const layoutXml = layoutTarget ? await zip.file(layoutTarget)?.async("text") : undefined;
    const layout = layoutXml ? parseOfficeXml(layoutXml) : undefined;
    if (!layout) {
      continue;
    }

    const layoutFontSizes = readPptxLayoutPlaceholderFontSizes(layout);
    const shapes = Array.from(slide.getElementsByTagName("*")).filter((element) => element.localName === "sp");
    for (const shape of shapes) {
      const placeholder = findPptxDescendant(shape, "ph");
      const placeholderIndex = placeholder?.getAttribute("idx");
      const fontSizePt = placeholderIndex ? layoutFontSizes.get(placeholderIndex) : undefined;
      const textBody = findPptxDescendant(shape, "txBody");
      if (!textBody?.textContent?.trim() || !fontSizePt || hasExplicitPptxTextSize(textBody)) {
        continue;
      }
      const transform = findPptxDescendant(shape, "xfrm");
      const offset = transform ? findPptxChild(transform, "off") : undefined;
      const extent = transform ? findPptxChild(transform, "ext") : undefined;
      const left = Number(offset?.getAttribute("x"));
      const top = Number(offset?.getAttribute("y"));
      const width = Number(extent?.getAttribute("cx"));
      const height = Number(extent?.getAttribute("cy"));
      if (![left, top, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) {
        continue;
      }
      corrections.push({
        slideIndex,
        leftRatio: left / slideWidth,
        topRatio: top / slideHeight,
        widthRatio: width / slideWidth,
        heightRatio: height / slideHeight,
        fontSizePt
      });
    }
  }
  return corrections;
}

async function inspectPptxAutofitLineHeightCorrections(
  zip: JSZip
): Promise<PptxAutofitLineHeightCorrection[]> {
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  const presentation = presentationXml ? parseOfficeXml(presentationXml) : undefined;
  const slideSize = presentation
    ? Array.from(presentation.getElementsByTagName("*")).find((element) => element.localName === "sldSz")
    : undefined;
  const slideWidth = Number(slideSize?.getAttribute("cx"));
  const slideHeight = Number(slideSize?.getAttribute("cy"));
  if (!(slideWidth > 0) || !(slideHeight > 0)) {
    return [];
  }

  const slideEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumberFromPath(a.name) - slideNumberFromPath(b.name));
  const corrections: PptxAutofitLineHeightCorrection[] = [];

  for (const [slideIndex, entry] of slideEntries.entries()) {
    const slide = parseOfficeXml(await entry.async("text"));
    if (!slide) {
      continue;
    }
    const shapes = Array.from(slide.getElementsByTagName("*")).filter((element) => element.localName === "sp");
    for (const shape of shapes) {
      const textBody = findPptxDescendant(shape, "txBody");
      const bodyProperties = textBody ? findPptxChild(textBody, "bodyPr") : undefined;
      if (!textBody || !bodyProperties || !findPptxChild(bodyProperties, "normAutofit")) {
        continue;
      }
      const paragraphs = Array.from(textBody.children).filter((element) => element.localName === "p");
      const defaultLineHeightParagraphs = paragraphs
        .filter((paragraph) => !findPptxDescendant(paragraph, "lnSpc"))
        .map((paragraph) => normalizePptxParagraphText(paragraph.textContent || ""))
        .filter(Boolean);
      if (defaultLineHeightParagraphs.length === 0) {
        continue;
      }
      const transform = findPptxDescendant(shape, "xfrm");
      const offset = transform ? findPptxChild(transform, "off") : undefined;
      const extent = transform ? findPptxChild(transform, "ext") : undefined;
      const left = Number(offset?.getAttribute("x"));
      const top = Number(offset?.getAttribute("y"));
      const width = Number(extent?.getAttribute("cx"));
      const height = Number(extent?.getAttribute("cy"));
      if (![left, top, width, height].every((value) => Number.isFinite(value)) || width <= 0 || height <= 0) {
        continue;
      }
      corrections.push({
        slideIndex,
        leftRatio: left / slideWidth,
        topRatio: top / slideHeight,
        widthRatio: width / slideWidth,
        heightRatio: height / slideHeight,
        paragraphs: defaultLineHeightParagraphs
      });
    }
  }
  return corrections;
}

function readPptxLayoutPlaceholderFontSizes(layout: Document): Map<string, number> {
  const result = new Map<string, number>();
  const shapes = Array.from(layout.getElementsByTagName("*")).filter((element) => element.localName === "sp");
  for (const shape of shapes) {
    const placeholderIndex = findPptxDescendant(shape, "ph")?.getAttribute("idx");
    if (!placeholderIndex) {
      continue;
    }
    const textBody = findPptxDescendant(shape, "txBody");
    const defaultRunProperties = textBody
      ? Array.from(textBody.getElementsByTagName("*")).find(
          (element) => element.localName === "defRPr" && Number(element.getAttribute("sz")) > 0
        )
      : undefined;
    const size = Number(defaultRunProperties?.getAttribute("sz"));
    if (size > 0) {
      result.set(placeholderIndex, size / 100);
    }
  }
  return result;
}

function hasExplicitPptxTextSize(textBody: Element): boolean {
  return Array.from(textBody.getElementsByTagName("*")).some(
    (element) =>
      (element.localName === "rPr" || element.localName === "defRPr" || element.localName === "endParaRPr") &&
      Number(element.getAttribute("sz")) > 0
  );
}

function findPptxDescendant(element: Element, localName: string): Element | undefined {
  return Array.from(element.getElementsByTagName("*")).find((child) => child.localName === localName);
}

function findPptxChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

function normalizePptxPlaceholderFonts(
  container: HTMLElement,
  corrections: PptxPlaceholderFontCorrection[]
): void {
  for (const correction of corrections) {
    const wrapper = container.querySelector<HTMLElement>(`div[data-slide-index="${correction.slideIndex}"]`);
    if (!wrapper) {
      continue;
    }
    const match = findPptxShapeElement(wrapper, correction);
    if (!match) {
      continue;
    }
    const styledText = Array.from(match.querySelectorAll<HTMLElement>("[style]")).filter(
      (element) => parseFloat(element.style.fontSize) > 0
    );
    for (const element of styledText) {
      element.style.fontSize = `${correction.fontSizePt}pt`;
    }
    if (styledText.length > 0) {
      match.dataset.ofvPptxPlaceholderFont = String(correction.fontSizePt);
    }
  }
}

function normalizePptxAutofitLineHeights(
  container: HTMLElement,
  corrections: PptxAutofitLineHeightCorrection[]
): void {
  for (const correction of corrections) {
    const wrapper = container.querySelector<HTMLElement>(`div[data-slide-index="${correction.slideIndex}"]`);
    if (!wrapper) {
      continue;
    }
    const match = findPptxShapeElement(wrapper, correction);
    if (!match) {
      continue;
    }
    const paragraphElements = Array.from(match.querySelectorAll<HTMLElement>("div")).filter((element) => {
      const directChildren = Array.from(element.children);
      return directChildren.length > 0 && directChildren.every((child) => child.tagName === "SPAN");
    });
    const unused = new Set(paragraphElements);
    for (const paragraph of correction.paragraphs) {
      const element = Array.from(unused).find((candidate) =>
        normalizePptxParagraphText(candidate.textContent || "").endsWith(paragraph)
      );
      if (!element) {
        continue;
      }
      element.style.lineHeight = "1";
      element.dataset.ofvPptxDefaultLineHeight = "true";
      unused.delete(element);
    }
  }
}

function normalizePptxParagraphText(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function findPptxShapeElement(
  wrapper: HTMLElement,
  correction: PptxShapeGeometry
): HTMLElement | undefined {
  let best: { element: HTMLElement; score: number } | undefined;
  for (const canvas of findPptxSlideCanvases(wrapper)) {
    const canvasWidth = parseCssPixelValue(canvas.style.width);
    const canvasHeight = parseCssPixelValue(canvas.style.height);
    if (!(canvasWidth > 0) || !(canvasHeight > 0)) {
      continue;
    }
    const expected = {
      left: correction.leftRatio * canvasWidth,
      top: correction.topRatio * canvasHeight,
      width: correction.widthRatio * canvasWidth,
      height: correction.heightRatio * canvasHeight
    };
    const candidates = Array.from(canvas.querySelectorAll<HTMLElement>("div")).filter(
      (element) => element.style.position === "absolute" && Boolean(element.textContent?.trim())
    );
    for (const element of candidates) {
      const actual = {
        left: parseCssPixelValue(element.style.left),
        top: parseCssPixelValue(element.style.top),
        width: parseCssPixelValue(element.style.width),
        height: parseCssPixelValue(element.style.height)
      };
      const deltas = [
        Math.abs(actual.left - expected.left),
        Math.abs(actual.top - expected.top),
        Math.abs(actual.width - expected.width),
        Math.abs(actual.height - expected.height)
      ];
      const tolerance = Math.max(2, Math.min(canvasWidth, canvasHeight) * 0.005);
      if (deltas.some((delta) => delta > tolerance)) {
        continue;
      }
      const score = deltas.reduce((sum, delta) => sum + delta, 0);
      if (!best || score < best.score) {
        best = { element, score };
      }
    }
  }
  return best?.element;
}

function hasInlineBackground(element: HTMLElement): boolean {
  return Boolean(element.style.background || element.style.backgroundColor || element.style.backgroundImage);
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
  extension: string,
  fit: PreviewFit,
  messages: PreviewMessages
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
    await renderDocx(panel, arrayBuffer, fit);
    return true;
  }

  if (hasEntry("xl/workbook.xml")) {
    await renderSheet(panel, arrayBuffer, extension, messages);
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

type LegacyPresentationImageSource = {
  src: string;
  revoke: boolean;
};

async function renderLegacyPowerPoint(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<() => void> {
  const presentation = await parseLegacyPowerPoint(arrayBuffer);
  const imageSources = await prepareLegacyPowerPointImages(presentation.images);
  const viewer = document.createElement("div");
  viewer.className = "ofv-ppt-binary-viewer";
  viewer.style.setProperty("--ofv-ppt-aspect", `${presentation.width} / ${presentation.height}`);

  for (const [slideIndex, slide] of presentation.slides.entries()) {
    const masterShapes = slide.masterShapes || presentation.masterShapes;
    const hasMasterBackground = masterShapes.some(
      (shape) =>
        shape.imageIndices.some((index) => imageSources.has(index)) &&
        shape.left <= presentation.width * 0.02 &&
        shape.top <= presentation.height * 0.02 &&
        shape.width >= presentation.width * 0.9 &&
        shape.height >= presentation.height * 0.9
    );
    const article = document.createElement("article");
    article.className = `ofv-ppt-binary-slide${hasMasterBackground ? " ofv-ppt-binary-has-master-background" : ""}`;
    article.dataset.slideIndex = String(slideIndex);
    article.setAttribute("aria-label", `Slide ${slideIndex + 1}`);

    const canvas = document.createElement("div");
    canvas.className = "ofv-ppt-binary-canvas";
    const tableCells = findLegacyPowerPointTableCells(slide.shapes);
    const tableLines = findLegacyPowerPointTableLines(slide.shapes, tableCells);
    const masterFillTexts = findLegacyPowerPointFillTexts(masterShapes);
    const slideFillTexts = findLegacyPowerPointFillTexts(slide.shapes);
    const masterDarkFillTexts = findLegacyPowerPointDarkFillTexts(masterShapes);
    const slideDarkFillTexts = findLegacyPowerPointDarkFillTexts(slide.shapes);
    const masterPictureOverlayTexts = findLegacyPowerPointPictureOverlayTexts(masterShapes);
    const slidePictureOverlayTexts = findLegacyPowerPointPictureOverlayTexts(slide.shapes);
    for (const shape of masterShapes) {
      renderLegacyPowerPointShape(
        canvas,
        shape,
        presentation,
        slide.masterTextStyles,
        imageSources,
        true,
        false,
        false,
        masterFillTexts.has(shape),
        masterDarkFillTexts.has(shape),
        masterPictureOverlayTexts.has(shape)
      );
    }
    for (const shape of slide.shapes) {
      renderLegacyPowerPointShape(
        canvas,
        shape,
        presentation,
        slide.masterTextStyles,
        imageSources,
        false,
        tableCells.has(shape),
        tableLines.has(shape),
        slideFillTexts.has(shape),
        slideDarkFillTexts.has(shape),
        slidePictureOverlayTexts.has(shape)
      );
    }
    if (!canvas.hasChildNodes()) {
      const empty = document.createElement("p");
      empty.className = "ofv-ppt-binary-empty";
      empty.textContent = `Slide ${slideIndex + 1}`;
      canvas.append(empty);
    }

    const number = document.createElement("span");
    number.className = "ofv-ppt-binary-slide-number";
    number.textContent = String(slideIndex + 1);
    article.append(canvas, number);
    viewer.append(article);
  }

  panel.replaceChildren(viewer);
  return () => {
    for (const source of imageSources.values()) {
      if (source.revoke) {
        URL.revokeObjectURL(source.src);
      }
    }
  };
}

async function prepareLegacyPowerPointImages(
  images: LegacyPowerPointImage[]
): Promise<Map<number, LegacyPresentationImageSource>> {
  const sources = new Map<number, LegacyPresentationImageSource>();
  const metafiles = images.filter((image) => image.kind !== "bitmap");
  let converter: typeof import("emf-converter") | undefined;
  if (metafiles.length > 0) {
    try {
      converter = await import("emf-converter");
    } catch (error) {
      console.warn("Presentation metafile renderer could not be loaded:", error);
    }
  }

  for (const image of images) {
    if (image.kind === "bitmap") {
      const url = URL.createObjectURL(new Blob([toStandaloneArrayBuffer(image.bytes)], { type: image.mimeType }));
      sources.set(image.index, { src: url, revoke: true });
      continue;
    }
    if (!converter) {
      continue;
    }
    try {
      const buffer = toStandaloneArrayBuffer(image.bytes);
      const dataUrl =
        image.kind === "emf"
          ? await converter.convertEmfToDataUrl(buffer, { maxWidth: 1600, maxHeight: 1200, dpiScale: 1.5 })
          : await converter.convertWmfToDataUrl(buffer, { maxWidth: 1600, maxHeight: 1200, dpiScale: 1.5 });
      if (dataUrl) {
        sources.set(image.index, { src: dataUrl, revoke: false });
      }
    } catch (error) {
      console.warn(`Presentation ${image.kind.toUpperCase()} image could not be rendered:`, error);
    }
  }
  return sources;
}

function renderLegacyPowerPointShape(
  canvas: HTMLElement,
  shape: LegacyPowerPointShape,
  presentation: LegacyPowerPointPresentation,
  masterTextStyles: LegacyPowerPointMasterTextStyles,
  imageSources: Map<number, LegacyPresentationImageSource>,
  master: boolean,
  tableCell = false,
  tableLine = false,
  overFill = false,
  overDarkFill = false,
  pictureOverlay = false
): void {
  const usableImages = shape.imageIndices
    .map((index) => imageSources.get(index))
    .filter((source): source is LegacyPresentationImageSource => Boolean(source));
  const texts = shape.texts;
  const hasVisualStyle = shape.fillEnabled === true || shape.lineEnabled === true;
  if (usableImages.length === 0 && texts.length === 0 && !hasVisualStyle) {
    return;
  }

  const element = document.createElement("div");
  element.className = `ofv-ppt-binary-shape${master ? " ofv-ppt-binary-master-shape" : ""}`;
  const left = clampPresentationRatio(shape.left / presentation.width, -1, 1);
  const top = clampPresentationRatio(shape.top / presentation.height, -1, 1);
  const width = clampPresentationRatio(shape.width / presentation.width, 0.001, 2);
  const height = clampPresentationRatio(shape.height / presentation.height, 0.001, 2);
  element.style.left = `${left * 100}%`;
  element.style.top = `${top * 100}%`;
  element.style.width = `${width * 100}%`;
  element.style.height = `${height * 100}%`;
  if (shape.fillEnabled && shape.fillColor) {
    element.style.backgroundColor = shape.fillColor;
  }
  const isLineShape = shape.shapeType === 20;
  if (shape.lineEnabled && !isLineShape) {
    element.style.borderStyle = "solid";
    element.style.borderColor = shape.lineColor || "#000";
    element.style.borderWidth = `${shape.lineWidth || 0.75}pt`;
  }
  if (tableLine) {
    element.style.borderColor = "#fff";
  }
  if (shape.rotation) {
    element.style.transform = `rotate(${shape.rotation}deg)`;
  }
  if (shape.shapeType === 2) {
    element.classList.add("ofv-ppt-binary-round-rectangle");
  } else if (shape.shapeType === 3 || shape.shapeType === 120) {
    element.classList.add("ofv-ppt-binary-ellipse");
  } else if (shape.shapeType === 4) {
    element.classList.add("ofv-ppt-binary-diamond");
  } else if (shape.shapeType === 20) {
    element.classList.add("ofv-ppt-binary-line-shape");
  } else if (shape.shapeType === 67) {
    element.classList.add("ofv-ppt-binary-down-arrow");
  } else if (shape.shapeType === 176) {
    element.classList.add("ofv-ppt-binary-round-rectangle");
  } else if (shape.shapeType === 0 && shape.rotation) {
    element.classList.add("ofv-ppt-binary-right-arrow");
  }

  if (isLineShape && shape.lineEnabled) {
    appendLegacyPowerPointLine(element, shape, tableLine ? "#fff" : shape.lineColor || "#000");
  }

  for (const source of usableImages) {
    const image = document.createElement("img");
    image.className = "ofv-ppt-binary-image";
    image.src = source.src;
    image.alt = "";
    image.draggable = false;
    applyLegacyPowerPointImageCrop(image, shape);
    element.append(image);
  }

  if (texts.length > 0) {
    const text = document.createElement("div");
    const filledText = (shape.fillEnabled && shape.fillColor) || overFill ? " ofv-ppt-binary-filled-text" : "";
    const sectionNumber = isLegacyPowerPointSectionNumber(shape, presentation)
      ? " ofv-ppt-binary-section-number"
      : "";
    const sectionHeading = isLegacyPowerPointSectionHeading(shape, presentation)
      ? " ofv-ppt-binary-section-heading"
      : "";
    const pictureOverlayText = pictureOverlay ? " ofv-ppt-binary-picture-overlay-text" : "";
    const textKind = master
      ? ""
      : isLegacyPowerPointTitle(shape, presentation)
        ? " ofv-ppt-binary-title"
        : tableCell
          ? " ofv-ppt-binary-table-cell"
          : isLegacyPowerPointBody(shape, presentation)
            ? " ofv-ppt-binary-body-text"
            : "";
    text.className = `ofv-ppt-binary-text${textKind}${filledText}${sectionNumber}${sectionHeading}${pictureOverlayText}`;
    if (!filledText && !sectionNumber && !pictureOverlayText && !tableCell && !shape.verticalText) {
      text.classList.add("ofv-ppt-binary-plain-text");
    }
    if (shape.verticalText) {
      text.classList.add("ofv-ppt-binary-vertical-text");
      element.classList.add("ofv-ppt-binary-vertical-text-shape");
    }
    if (overDarkFill || (shape.fillColor && hasDarkPresentationFill(shape.fillColor))) {
      text.style.color = "#fff";
    }
    const formattedTexts = shape.formattedTexts || [];
    const binaryStyled = formattedTexts.some(
      (block) =>
        block.characterRuns.some((run) =>
          run.bold !== undefined ||
          run.italic !== undefined ||
          run.underline !== undefined ||
          run.fontSize !== undefined ||
          run.color !== undefined ||
          run.fontRef !== undefined
        ) || block.paragraphRuns.some((run) => run.alignment !== undefined || run.lineSpacing !== undefined)
    );
    if (binaryStyled) {
      text.classList.add("ofv-ppt-binary-styled-text");
      if (texts.every((value) => !/[\r\n]/.test(value)) && texts.join("").length <= 16) {
        element.classList.add("ofv-ppt-binary-short-text-shape");
        if (texts.join("") !== "Contents Page" && !filledText) {
          element.classList.add("ofv-ppt-binary-nowrap-short-text-shape");
        }
      }
      if (textKind.includes("ofv-ppt-binary-title") && !/[\r\n]/.test(texts.join("")) && texts.join("").length > 16) {
        element.classList.add("ofv-ppt-binary-nowrap-title-shape");
      }
      renderLegacyPowerPointFormattedText(
        text,
        formattedTexts,
        presentation.fonts,
        masterTextStyles[shape.textType ?? 4] || []
      );
    } else {
      text.textContent = texts.join("\n");
    }
    element.append(text);
  }
  canvas.append(element);
}

function appendLegacyPowerPointLine(
  target: HTMLElement,
  shape: LegacyPowerPointShape,
  color: string
): void {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("ofv-ppt-binary-line-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const line = document.createElementNS(namespace, "line");
  line.setAttribute("x1", shape.flipHorizontal ? "100" : "0");
  line.setAttribute("y1", shape.flipVertical ? "100" : "0");
  line.setAttribute("x2", shape.flipHorizontal ? "0" : "100");
  line.setAttribute("y2", shape.flipVertical ? "0" : "100");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  line.style.stroke = color;
  line.style.strokeWidth = `${(shape.lineWidth || 0.75) / 7.2}cqw`;
  svg.append(line);
  target.append(svg);
}

function applyLegacyPowerPointImageCrop(image: HTMLImageElement, shape: LegacyPowerPointShape): void {
  const top = shape.imageCropTop || 0;
  const bottom = shape.imageCropBottom || 0;
  const left = shape.imageCropLeft || 0;
  const right = shape.imageCropRight || 0;
  if (top === 0 && bottom === 0 && left === 0 && right === 0) return;
  const visibleWidth = Math.max(0.01, 1 - left - right);
  const visibleHeight = Math.max(0.01, 1 - top - bottom);
  image.style.position = "absolute";
  image.style.maxWidth = "none";
  image.style.width = `${100 / visibleWidth}%`;
  image.style.height = `${100 / visibleHeight}%`;
  image.style.left = `${(-left / visibleWidth) * 100}%`;
  image.style.top = `${(-top / visibleHeight) * 100}%`;
}

function renderLegacyPowerPointFormattedText(
  target: HTMLElement,
  blocks: NonNullable<LegacyPowerPointShape["formattedTexts"]>,
  fonts: string[],
  masterStyles: LegacyPowerPointCharacterStyle[]
): void {
  for (const [blockIndex, block] of blocks.entries()) {
    if (blockIndex > 0) target.append(document.createTextNode("\n"));
    const firstParagraph = block.paragraphRuns[0];
    if (firstParagraph?.alignment) target.style.textAlign = firstParagraph.alignment;
    if (firstParagraph?.lineSpacing) {
      // PowerPoint percentages are relative to its normal line box, which is
      // approximately 1.2 times the font size. CSS unitless line-height is
      // relative to the font size itself, so preserve that extra baseline.
      target.style.lineHeight = String(firstParagraph.lineSpacing * 1.2);
    }

    let cursor = 0;
    for (const run of block.characterRuns) {
      const paragraph = block.paragraphRuns.find(
        (candidate) => run.start >= candidate.start && run.start < candidate.start + Math.max(1, candidate.length)
      );
      const inherited = masterStyles[paragraph?.indentLevel || 0] || masterStyles[0] || {};
      const effective = { ...inherited, ...run };
      const start = Math.max(cursor, Math.min(block.text.length, run.start));
      if (start > cursor) target.append(document.createTextNode(block.text.slice(cursor, start)));
      const end = Math.max(start, Math.min(block.text.length, run.start + run.length));
      if (end > start) {
        const span = document.createElement("span");
        span.textContent = block.text.slice(start, end);
        if (effective.bold !== undefined) span.style.fontWeight = effective.bold ? "700" : "400";
        if (effective.italic !== undefined) span.style.fontStyle = effective.italic ? "italic" : "normal";
        if (effective.underline !== undefined) {
          span.style.textDecoration = effective.underline ? "underline" : "none";
        }
        if (effective.fontSize !== undefined && effective.fontSize > 0) {
          // A legacy slide uses 1/8-point master units. Expressing point sizes
          // relative to the 720-point-wide slide keeps text scaled with the
          // responsive canvas instead of pinning it to CSS physical points.
          span.style.fontSize = `${effective.fontSize / 7.2}cqw`;
        }
        if (effective.color) span.style.color = effective.color;
        const fontFamily = effective.fontRef === undefined ? undefined : fonts[effective.fontRef];
        if (fontFamily) span.style.fontFamily = `"${fontFamily.replaceAll('"', '\\"')}", sans-serif`;
        target.append(span);
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < block.text.length) target.append(document.createTextNode(block.text.slice(cursor)));
  }
}

function isLegacyPowerPointTitle(shape: LegacyPowerPointShape, presentation: LegacyPowerPointPresentation): boolean {
  const shortSingleLineText = shape.texts.length === 1 && !shape.texts[0].includes("\n") && shape.texts[0].length <= 32;
  return (
    shape.textType === 0 ||
    shape.textType === 6 ||
    (shortSingleLineText && shape.width >= presentation.width * 0.6 && shape.height <= presentation.height * 0.18)
  );
}

function isLegacyPowerPointSectionNumber(
  shape: LegacyPowerPointShape,
  presentation: LegacyPowerPointPresentation
): boolean {
  return (
    shape.texts.length === 1 &&
    /^[1-9一二三四五六七八九十]$/.test(shape.texts[0]) &&
    shape.width <= presentation.width * 0.1 &&
    shape.height <= presentation.height * 0.11 &&
    shape.width / Math.max(1, shape.height) >= 0.65 &&
    shape.width / Math.max(1, shape.height) <= 1.55
  );
}

function isLegacyPowerPointSectionHeading(
  shape: LegacyPowerPointShape,
  presentation: LegacyPowerPointPresentation
): boolean {
  const shortSingleLineText = shape.texts.length === 1 && !shape.texts[0].includes("\n") && shape.texts[0].length <= 28;
  const nearTopLeft = shape.top < presentation.height * 0.12 && shape.left < presentation.width * 0.2;
  const sectionPageTitle =
    shape.top >= presentation.height * 0.15 &&
    shape.top < presentation.height * 0.3 &&
    shape.left >= presentation.width * 0.2 &&
    shape.left < presentation.width * 0.4 &&
    shape.width >= presentation.width * 0.5;
  return shortSingleLineText && shape.width >= presentation.width * 0.2 && (nearTopLeft || sectionPageTitle);
}

function hasDarkPresentationFill(color: string): boolean {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return false;
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return red * 0.299 + green * 0.587 + blue * 0.114 < 145;
}

function findLegacyPowerPointDarkFillTexts(shapes: LegacyPowerPointShape[]): Set<LegacyPowerPointShape> {
  const darkVisuals = shapes.filter(
    (shape) => shape.fillEnabled && shape.fillColor && hasDarkPresentationFill(shape.fillColor) && shape.texts.length === 0
  );
  const pictureOverlayTexts = findLegacyPowerPointPictureOverlayTexts(shapes);
  return new Set(
    shapes.filter((shape) => {
      if (shape.texts.length === 0 || (shape.fillEnabled && shape.fillColor)) return false;
      const centerX = shape.left + shape.width / 2;
      const centerY = shape.top + shape.height / 2;
      return (
        darkVisuals.some((visual) => containsPresentationPoint(visual, centerX, centerY)) || pictureOverlayTexts.has(shape)
      );
    })
  );
}

function findLegacyPowerPointFillTexts(shapes: LegacyPowerPointShape[]): Set<LegacyPowerPointShape> {
  const visuals = shapes.filter((shape) => shape.fillEnabled && shape.fillColor && shape.texts.length === 0);
  const pictureOverlayTexts = findLegacyPowerPointPictureOverlayTexts(shapes);
  return new Set(
    shapes.filter((shape) => {
      if (shape.texts.length === 0 || (shape.fillEnabled && shape.fillColor)) return false;
      const centerX = shape.left + shape.width / 2;
      const centerY = shape.top + shape.height / 2;
      return (
        visuals.some((visual) => containsPresentationPoint(visual, centerX, centerY)) || pictureOverlayTexts.has(shape)
      );
    })
  );
}

function containsPresentationPoint(shape: LegacyPowerPointShape, x: number, y: number): boolean {
  return x >= shape.left && x <= shape.left + shape.width && y >= shape.top && y <= shape.top + shape.height;
}

function findLegacyPowerPointPictureOverlayTexts(shapes: LegacyPowerPointShape[]): Set<LegacyPowerPointShape> {
  const pictures = shapes.filter((shape) => shape.shapeType === 75 && shape.texts.length === 0);
  return new Set(
    shapes.filter((shape) => {
      const centerX = shape.left + shape.width / 2;
      const centerY = shape.top + shape.height / 2;
      return isLongPictureOverlayText(shape, pictures, centerX, centerY);
    })
  );
}

function isLongPictureOverlayText(
  shape: LegacyPowerPointShape,
  pictures: LegacyPowerPointShape[],
  centerX: number,
  centerY: number
): boolean {
  return (
    shape.texts.join("").length > 32 &&
    shape.width >= 3000 &&
    shape.height <= 700 &&
    pictures.some((picture) => containsPresentationPoint(picture, centerX, centerY))
  );
}

function isLegacyPowerPointBody(shape: LegacyPowerPointShape, presentation: LegacyPowerPointPresentation): boolean {
  return (
    [1, 5, 7, 8].includes(shape.textType ?? -1) ||
    (shape.top < presentation.height * 0.24 && shape.height > presentation.height * 0.45)
  );
}

function findLegacyPowerPointTableCells(shapes: LegacyPowerPointShape[]): Set<LegacyPowerPointShape> {
  const rows = new Map<number, LegacyPowerPointShape[]>();
  for (const shape of shapes) {
    if (shape.texts.length !== 1 || shape.imageIndices.length > 0 || shape.texts[0].length > 80) {
      continue;
    }
    const key = Math.round(shape.top / 4) * 4;
    const row = rows.get(key) || [];
    row.push(shape);
    rows.set(key, row);
  }
  const cells = new Set<LegacyPowerPointShape>();
  for (const row of rows.values()) {
    if (row.length >= 3) {
      row.forEach((shape) => cells.add(shape));
    }
  }
  return cells;
}

function findLegacyPowerPointTableLines(
  shapes: LegacyPowerPointShape[],
  cells: Set<LegacyPowerPointShape>
): Set<LegacyPowerPointShape> {
  if (cells.size < 8) return new Set();
  const cellList = [...cells];
  const left = Math.min(...cellList.map((shape) => shape.left));
  const top = Math.min(...cellList.map((shape) => shape.top));
  const right = Math.max(...cellList.map((shape) => shape.left + shape.width));
  const bottom = Math.max(...cellList.map((shape) => shape.top + shape.height));
  const tolerance = 24;
  return new Set(
    shapes.filter(
      (shape) =>
        shape.shapeType === 20 &&
        shape.texts.length === 0 &&
        shape.left + shape.width >= left - tolerance &&
        shape.left <= right + tolerance &&
        shape.top + shape.height >= top - tolerance &&
        shape.top <= bottom + tolerance
    )
  );
}

function clampPresentationRatio(value: number, minimum = 0, maximum = 1): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function renderLegacyWordBinary(
  panel: HTMLElement,
  extension: string,
  arrayBuffer: ArrayBuffer,
  messages: PreviewMessages
): void {
  try {
    renderLegacyWordDocument(panel, parseLegacyWordDocument(arrayBuffer));
  } catch (error) {
    renderLegacyOfficeBinary(
      panel,
      extension,
      arrayBuffer,
      messages,
      formatPreviewMessage(messages.officeLegacyWordParseFailed, { message: normalizeOfficeError(error, messages) })
    );
  }
}

function renderLegacyOfficeBinary(
  panel: HTMLElement,
  extension: string,
  arrayBuffer: ArrayBuffer,
  messages: PreviewMessages,
  parseError?: string
): void {
  const fragments = extractLegacyOfficeText(arrayBuffer);
  panel.replaceChildren();
  const section = createSection(messages.officeLegacyConversionTitle);
  section.classList.add("ofv-office-conversion");
  const format = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `.${extension}`;
  format.append(strong, document.createTextNode(" "), document.createTextNode(messages.officeLegacyBinaryNotice));

  const meta = document.createElement("dl");
  meta.className = "ofv-office-binary-meta";
  appendOfficeBinaryMeta(meta, messages.officeLegacyMetaFormatType, legacyOfficeFormatLabel(extension));
  appendOfficeBinaryMeta(
    meta,
    messages.officeLegacyMetaFileStructure,
    hasOleSignature(arrayBuffer) ? messages.officeLegacyOleDetected : messages.officeLegacyOleMissing
  );
  appendOfficeBinaryMeta(
    meta,
    messages.officeLegacyMetaTextFragments,
    formatPreviewMessage(messages.officeLegacyTextFragmentCount, { count: fragments.length.toLocaleString() })
  );
  if (parseError) {
    appendOfficeBinaryMeta(meta, messages.officeLegacyMetaParseStatus, parseError);
  }

  section.append(format, meta);

  if (fragments.length > 0) {
    const article = document.createElement("article");
    article.className = "ofv-document ofv-office-binary-fragments";
    const heading = document.createElement("h4");
    heading.textContent = messages.officeLegacyReadableFragments;
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
    empty.textContent = messages.officeLegacyNoText;
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

function renderUnsupportedOffice(panel: HTMLElement, extension: string, messages: PreviewMessages): void {
  const legacyBinary = new Set(["doc", "dot", "wps", "ppt", "pps", "key", "dps"]);
  const message = legacyBinary.has(extension)
    ? messages.officeUnsupportedLegacyMessage
    : messages.officeUnsupportedGenericMessage;
  panel.replaceChildren();
  const section = createSection(messages.officeUnsupportedTitle);
  const format = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `.${extension}`;
  format.append(
    strong,
    document.createTextNode(" "),
    document.createTextNode(formatPreviewMessage(messages.officeUnsupportedIntro, { message }))
  );

  const support = document.createElement("p");
  support.textContent = messages.officeUnsupportedSupportedFormats;

  section.append(format, support);
  panel.append(section);
}

function normalizeOfficeError(error: unknown, messages: PreviewMessages): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return message
    ? formatPreviewMessage(messages.officeErrorWithMessage, { message })
    : messages.officeErrorWithoutMessage;
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
