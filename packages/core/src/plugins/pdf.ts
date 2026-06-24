import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin, PreviewSize } from "../types";
import { createEncryptedFallback, isEncryptedError } from "./encrypted";
import { getInitialZoom } from "./utils";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocumentProxyLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<any>;
  destroy?: unknown;
  cleanup?: unknown;
};

export interface PdfPluginOptions {
  pdfjs?: PdfJsModule;
  workerSrc?: string;
  cMapUrl?: string;
  cMapPacked?: boolean;
  standardFontDataUrl?: string;
  useSystemFonts?: boolean;
  disableStream?: boolean;
  disableAutoFetch?: boolean;
  disableRange?: boolean;
  rangeChunkSize?: number;
  useFetchData?: boolean;
}

export interface PdfDocumentPreviewOptions {
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  isExternal?: boolean;
  viewport: HTMLElement;
  size: PreviewSize;
  fit: string;
  zoom?: number;
  toolbar?: {
    setZoom(value: number | undefined): void;
  };
  pdfjs?: PdfJsModule;
  workerSrc?: string;
  cMapUrl?: string;
  cMapPacked?: boolean;
  standardFontDataUrl?: string;
  useSystemFonts?: boolean;
  disableStream?: boolean;
  disableAutoFetch?: boolean;
  disableRange?: boolean;
  rangeChunkSize?: number;
  useFetchData?: boolean;
  title?: string;
  fallbackTitle?: string;
  encryptedTitle?: string;
  encryptedMessage?: string;
  encryptedAction?: string;
  revokeUrlOnDestroy?: boolean;
}

// 2D affine transform matrix multiplication helper
function multiplyMatrices(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

export function pdfPlugin(options: PdfJsModule | PdfPluginOptions = {}): PreviewPlugin {
  return {
    name: "pdf",
    match(file) {
      return file.mimeType === "application/pdf" || file.extension === "pdf";
    },
    async render(ctx) {
      const normalizedOptions = normalizePdfOptions(options);
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      return renderPdfDocumentPreview({
        ...normalizedOptions,
        fileName: ctx.file.name,
        fileUrl: url,
        fileSize: ctx.file.size,
        isExternal,
        viewport: ctx.viewport,
        size: ctx.size,
        fit: ctx.options.fit,
        zoom: ctx.options.zoom,
        toolbar: ctx.toolbar,
        encryptedTitle: "PDF 已加密，无法在线预览",
        encryptedMessage: "请下载后使用密码打开，或上传解密后的 PDF 文件。",
        encryptedAction: "下载 PDF",
        revokeUrlOnDestroy: true
      });
    }
  };
}

export async function renderPdfDocumentPreview(options: PdfDocumentPreviewOptions): Promise<{
  canCommand(command: string): boolean;
  command(command: string): boolean;
  resize(size: PreviewSize): void;
  destroy(): void;
}> {
  const pdf = options.pdfjs || (await import("pdfjs-dist"));
  configurePdfWorker(pdf, options.workerSrc);

  const viewer = document.createElement("div");
  viewer.className = "ofv-pdf-viewer";
  if (options.title) {
    const title = document.createElement("strong");
    title.className = "ofv-pdf-viewer-title";
    title.textContent = options.title;
    viewer.append(title);
  }
  const summary = document.createElement("div");
  summary.className = "ofv-pdf-summary";
  summary.hidden = true;
  summary.setAttribute("aria-hidden", "true");
  summary.style.display = "none";
  const scroller = document.createElement("div");
  scroller.className = "ofv-pdf ofv-pdf-pages";
  viewer.append(summary, scroller);
  options.viewport.append(viewer);

  const showDocumentFallback = (error: unknown) => {
    viewer.remove();
    options.viewport.classList.add("ofv-center");
    const fileLike = {
      source: options.fileUrl,
      name: options.fileName,
      extension: options.fileName.includes(".") ? options.fileName.split(".").pop() || "pdf" : "pdf",
      mimeType: "application/pdf",
      size: options.fileSize,
      url: options.fileUrl
    };
    const fallback = isEncryptedError(error)
      ? createEncryptedFallback(fileLike, options.fileUrl, {
          title: options.encryptedTitle || "PDF 已加密，无法在线预览",
          message: options.encryptedMessage || "请下载后使用密码打开，或上传解密后的 PDF 文件。",
          action: options.encryptedAction || "下载 PDF"
        })
      : createPdfFallback(options.fileName, options.fileUrl, normalizePdfError(error), options.fallbackTitle);
    options.viewport.append(fallback);
  };

  let documentTask: ReturnType<PdfJsModule["getDocument"]> | undefined;
  let doc: PdfDocumentProxyLike | undefined;
  try {
    const pdfData = options.useFetchData ? await loadPdfData(options.fileUrl) : undefined;
    documentTask = pdf.getDocument({
      ...(pdfData ? { data: pdfData } : { url: options.fileUrl }),
      cMapUrl: options.cMapUrl ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdf.version}/cmaps/`,
      cMapPacked: options.cMapPacked ?? true,
      standardFontDataUrl: options.standardFontDataUrl ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdf.version}/standard_fonts/`,
      useSystemFonts: options.useSystemFonts ?? true,
      disableStream: options.disableStream,
      disableAutoFetch: options.disableAutoFetch,
      disableRange: options.disableRange,
      rangeChunkSize: options.rangeChunkSize
    });
    doc = (await documentTask.promise.catch((error: unknown) => {
      showDocumentFallback(error);
      return undefined;
    })) as PdfDocumentProxyLike | undefined;
  } catch (error) {
    showDocumentFallback(error);
  }

  if (!doc) {
    return {
      canCommand() {
        return false;
      },
      command() {
        return false;
      },
      resize() {},
      destroy() {
        options.viewport.classList.remove("ofv-center");
        destroyPdfResource(documentTask);
        if (options.revokeUrlOnDestroy) {
          revokeObjectUrl(options.fileUrl, Boolean(options.isExternal));
        }
      }
    };
  }
  const pdfDocument = doc;

  const pagesMeta: Array<{ width: number; height: number }> = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    try {
      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      pagesMeta.push({
        width: baseViewport.width,
        height: baseViewport.height
      });
    } catch {
      pagesMeta.push({ width: 612, height: 792 });
    }
  }

  const pageStates: Array<{
    wrapper: HTMLDivElement;
    canvas: HTMLCanvasElement | null;
    renderTask: any | null;
    rendered: boolean;
  }> = [];

  let observer: IntersectionObserver | null = null;
  let currentSize = options.size;
  let zoomFactor = getInitialZoom({ options: { zoom: options.zoom ?? 1 } }, 0.25, 4);
  let rotation = 0;

  const updateSummary = () => {
    renderPdfSummary(summary, pdfDocument.numPages, pagesMeta, options.fit, zoomFactor);
    options.toolbar?.setZoom(zoomFactor);
  };

  const clearPage = (pageIdx: number) => {
    const state = pageStates[pageIdx];
    if (!state || !state.rendered) return;

    if (state.renderTask) {
      try {
        state.renderTask.cancel();
      } catch (e) {
        // Ignore cancel errors
      }
      state.renderTask = null;
    }

    state.canvas = null;
    state.rendered = false;
    state.wrapper.replaceChildren();
    state.wrapper.append(createPageStatus("ofv-pdf-skeleton", `页面 ${pageIdx + 1} 加载中...`));
  };

  const renderPage = async (pageIdx: number, size: PreviewSize) => {
    const state = pageStates[pageIdx];
    if (!state || state.rendered) return;

    state.rendered = true;

    try {
      const page = await pdfDocument.getPage(pageIdx + 1);
      const meta = pagesMeta[pageIdx];
      const scale =
        options.fit === "actual"
          ? zoomFactor
          : Math.max(0.05, Math.min(5, (getPdfAvailableWidth(size.width) / rotatedPdfWidth(meta, rotation)) * zoomFactor));
      const viewport = page.getViewport({ scale, rotation });
      const outputScale = getPdfOutputScale();
      const cssWidth = Math.floor(viewport.width);
      const cssHeight = Math.floor(viewport.height);

      const canvas = document.createElement("canvas");
      canvas.className = "ofv-pdf-page";
      canvas.width = Math.floor(cssWidth * outputScale);
      canvas.height = Math.floor(cssHeight * outputScale);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context is not available.");
      }

      state.wrapper.replaceChildren(canvas);
      state.canvas = canvas;

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
      });
      state.renderTask = renderTask;

      await renderTask.promise;
      state.renderTask = null;

      const textContent = await page.getTextContent();
      const textLayer = document.createElement("div");
      textLayer.className = "ofv-pdf-text-layer";
      textLayer.style.width = `${cssWidth}px`;
      textLayer.style.height = `${cssHeight}px`;
      state.wrapper.appendChild(textLayer);

      for (const item of textContent.items) {
        if (!("str" in item)) continue;
        const str = (item as any).str;
        if (!str.trim()) continue;

        const tx = multiplyMatrices(viewport.transform, (item as any).transform);
        const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);

        const span = document.createElement("span");
        span.textContent = str;
        span.style.fontSize = `${fontHeight}px`;
        span.style.fontFamily = (item as any).fontName || "sans-serif";
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5] - fontHeight}px`;
        span.style.transformOrigin = "0% 0%";

        textLayer.appendChild(span);

        if ((item as any).width) {
          const itemWidth = (item as any).width * scale;
          const actualWidth = span.offsetWidth || span.getBoundingClientRect().width;
          if (actualWidth > 0 && Math.abs(actualWidth - itemWidth) > 1) {
            span.style.transform = `scaleX(${itemWidth / actualWidth})`;
          }
        }
      }
      if (textLayer.childElementCount === 0 && isCanvasVisuallyBlank(canvas, context)) {
        state.wrapper.appendChild(
          createPageStatus(
            "ofv-pdf-empty",
            "该页没有检测到可显示的 PDF 兼容内容。若这是 Illustrator/AI 文件，可能只包含私有编辑数据，建议导出为 PDF/SVG/PNG 后预览。"
          )
        );
      }
    } catch (err) {
      console.error(`Failed to render PDF page ${pageIdx + 1}:`, err);
      state.rendered = false;
      state.wrapper.replaceChildren(
        createPageStatus("ofv-pdf-error", "无法渲染该页面。该页可能包含浏览器 PDF 引擎暂不支持的图形、字体或压缩特性。")
      );
    }
  };

  const renderLayout = (size: PreviewSize) => {
    observer?.disconnect();
    updateSummary();
    scroller.replaceChildren();
    pageStates.length = 0;

    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const pageIdx = parseInt(entry.target.getAttribute("data-page-index") || "0", 10);
            const state = pageStates[pageIdx];
            if (!state) return;

            if (entry.isIntersecting) {
              if (!state.rendered) {
                void renderPage(pageIdx, size);
              }
            } else if (state.rendered && pdfDocument.numPages > 8) {
              clearPage(pageIdx);
            }
          });
        },
        {
          root: scroller,
          rootMargin: "400px 0px 400px 0px"
        }
      );
    }

    for (let i = 0; i < pdfDocument.numPages; i++) {
      const meta = pagesMeta[i];
      const rotatedWidth = rotatedPdfWidth(meta, rotation);
      const rotatedHeight = rotatedPdfHeight(meta, rotation);
      const scale =
        options.fit === "actual"
          ? zoomFactor
          : Math.max(0.05, Math.min(5, (getPdfAvailableWidth(size.width) / rotatedWidth) * zoomFactor));

      const w = Math.floor(rotatedWidth * scale);
      const h = Math.floor(rotatedHeight * scale);

      const wrapper = document.createElement("div");
      wrapper.className = "ofv-pdf-page-wrapper";
      wrapper.setAttribute("data-page-index", String(i));
      wrapper.style.width = `${w}px`;
      wrapper.style.height = `${h}px`;
      wrapper.append(createPageStatus("ofv-pdf-skeleton", `页面 ${i + 1} 加载中...`));

      scroller.appendChild(wrapper);

      pageStates.push({
        wrapper,
        canvas: null,
        renderTask: null,
        rendered: false
      });

      if (observer) {
        observer.observe(wrapper);
      } else {
        void renderPage(i, size);
      }
    }

    if (observer) {
      window.setTimeout(() => {
        const eagerPages = pdfDocument.numPages > 8 ? 2 : pdfDocument.numPages;
        for (let i = 0; i < eagerPages; i++) {
          void renderPage(i, size);
        }
      }, 0);
    }
  };

  renderLayout(options.size);

  let resizeTimer: number | undefined;
  return {
    canCommand(command) {
      return (
        command === "zoom-in" ||
        command === "zoom-out" ||
        command === "zoom-reset" ||
        command === "rotate-right" ||
        command === "rotate-left"
      );
    },
    command(command) {
      if (command === "zoom-in") {
        zoomFactor = Math.min(4, zoomFactor + 0.15);
        renderLayout(currentSize);
        return true;
      }
      if (command === "zoom-out") {
        zoomFactor = Math.max(0.25, zoomFactor - 0.15);
        renderLayout(currentSize);
        return true;
      }
      if (command === "zoom-reset") {
        zoomFactor = 1;
        rotation = 0;
        renderLayout(currentSize);
        return true;
      }
      if (command === "rotate-right" || command === "rotate-left") {
        rotation = normalizePdfRotation(rotation + (command === "rotate-right" ? 90 : -90));
        renderLayout(currentSize);
        return true;
      }
      return false;
    },
    resize(size) {
      currentSize = size;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        renderLayout(size);
      }, 120);
    },
    destroy() {
      options.toolbar?.setZoom(undefined);
      window.clearTimeout(resizeTimer);
      observer?.disconnect();

      pageStates.forEach((state) => {
        if (state.renderTask) {
          try {
            state.renderTask.cancel();
          } catch (e) {
            // Ignore
          }
        }
      });
      pageStates.length = 0;

      destroyPdfResource(pdfDocument);
      destroyPdfResource(documentTask);
      if (options.revokeUrlOnDestroy) {
        revokeObjectUrl(options.fileUrl, Boolean(options.isExternal));
      }
    }
  };
}

function destroyPdfResource(resource: unknown): void {
  if (!resource || typeof resource !== "object") {
    return;
  }
  const candidate = resource as { destroy?: unknown; cleanup?: unknown };
  if (typeof candidate.destroy === "function") {
    void candidate.destroy();
    return;
  }
  if (typeof candidate.cleanup === "function") {
    void candidate.cleanup();
  }
}

function getPdfOutputScale(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));
}

function getPdfAvailableWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return 1;
  }
  const gutter = width < 160 ? 16 : 32;
  return Math.max(1, width - gutter);
}

function renderPdfSummary(
  summary: HTMLElement,
  pages: number,
  pagesMeta: Array<{ width: number; height: number }>,
  fit: string,
  zoomFactor: number
): void {
  summary.replaceChildren();
  appendPdfSummary(summary, "页数", String(pages));
  const pageSizes = formatPdfPageSizes(pagesMeta);
  if (pageSizes) {
    appendPdfSummary(summary, "页面尺寸", pageSizes);
  }
  appendPdfSummary(summary, "适配", fit === "actual" ? "原始大小" : "适合宽度");
  appendPdfSummary(summary, "缩放", `${Math.round(zoomFactor * 100)}%`);
}

function appendPdfSummary(parent: HTMLElement, label: string, value: string): void {
  const item = document.createElement("span");
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  item.append(key, content);
  parent.append(item);
}

function normalizePdfRotation(value: number): number {
  return ((value % 360) + 360) % 360;
}

function isPdfRotatedSideways(rotation: number): boolean {
  const normalized = normalizePdfRotation(rotation);
  return normalized === 90 || normalized === 270;
}

function rotatedPdfWidth(meta: { width: number; height: number }, rotation: number): number {
  return isPdfRotatedSideways(rotation) ? meta.height : meta.width;
}

function rotatedPdfHeight(meta: { width: number; height: number }, rotation: number): number {
  return isPdfRotatedSideways(rotation) ? meta.width : meta.height;
}

function formatPdfPageSizes(pagesMeta: Array<{ width: number; height: number }>): string {
  const counts = new Map<string, number>();
  for (const page of pagesMeta) {
    const key = `${Math.round(page.width)} x ${Math.round(page.height)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([size, count]) => (count > 1 ? `${size} (${count})` : size))
    .join(", ");
}

function normalizePdfOptions(options: PdfJsModule | PdfPluginOptions): PdfPluginOptions {
  if ("getDocument" in options) {
    return { pdfjs: options };
  }
  return options;
}

async function loadPdfData(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PDF data: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function isCanvasVisuallyBlank(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): boolean {
  if (canvas.width === 0 || canvas.height === 0 || typeof context.getImageData !== "function") {
    return false;
  }
  try {
    const sampleWidth = Math.min(canvas.width, 96);
    const sampleHeight = Math.min(canvas.height, 96);
    const stepX = Math.max(1, Math.floor(canvas.width / sampleWidth));
    const stepY = Math.max(1, Math.floor(canvas.height / sampleHeight));
    let sampled = 0;
    let nonBlank = 0;
    for (let y = 0; y < canvas.height; y += stepY) {
      for (let x = 0; x < canvas.width; x += stepX) {
        const pixel = context.getImageData(x, y, 1, 1).data;
        const red = pixel[0];
        const green = pixel[1];
        const blue = pixel[2];
        const alpha = pixel[3];
        sampled += 1;
        if (alpha > 8 && (red < 248 || green < 248 || blue < 248)) {
          nonBlank += 1;
          if (nonBlank / sampled > 0.002) {
            return false;
          }
        }
      }
    }
    return sampled > 0;
  } catch {
    return false;
  }
}

function createPageStatus(className: string, text: string): HTMLDivElement {
  const status = document.createElement("div");
  status.className = className;
  status.textContent = text;
  return status;
}

function createPdfFallback(fileName: string, url: string, message: string, titleText = "PDF 预览失败"): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = titleText;

  const meta = document.createElement("span");
  meta.textContent = `${message} ${fileName}`;

  const download = document.createElement("a");
  download.href = url;
  download.download = fileName;
  download.textContent = "下载 PDF";

  fallback.append(title, meta, download);
  return fallback;
}

function normalizePdfError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name?: unknown }).name) : "";
  const lower = `${name} ${message}`.toLowerCase();
  if (lower.includes("invalid") || lower.includes("missing") || lower.includes("corrupt")) {
    return "该 PDF 文件可能已损坏或格式无效。";
  }
  return "当前浏览器无法加载该 PDF。";
}

function configurePdfWorker(pdf: PdfJsModule, workerSrc?: string): void {
  if (workerSrc) {
    pdf.GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }

  if (!pdf.GlobalWorkerOptions.workerSrc && typeof window !== "undefined") {
    pdf.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdf.version}/build/pdf.worker.mjs`;
  }
}
