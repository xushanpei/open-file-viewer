import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin, PreviewSize } from "../types";
import { createEncryptedFallback, isEncryptedError } from "./encrypted";

type PdfJsModule = typeof import("pdfjs-dist");

export interface PdfPluginOptions {
  pdfjs?: PdfJsModule;
  workerSrc?: string;
  cMapUrl?: string;
  cMapPacked?: boolean;
  standardFontDataUrl?: string;
  useSystemFonts?: boolean;
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
      const pdf = normalizedOptions.pdfjs || (await import("pdfjs-dist"));
      configurePdfWorker(pdf, normalizedOptions.workerSrc);
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);

      const viewer = document.createElement("div");
      viewer.className = "ofv-pdf-viewer";
      const summary = document.createElement("div");
      summary.className = "ofv-pdf-summary";
      const scroller = document.createElement("div");
      scroller.className = "ofv-pdf ofv-pdf-pages";
      viewer.append(summary, scroller);
      ctx.viewport.append(viewer);

      const documentTask = pdf.getDocument({
        url,
        cMapUrl: normalizedOptions.cMapUrl ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdf.version}/cmaps/`,
        cMapPacked: normalizedOptions.cMapPacked ?? true,
        standardFontDataUrl:
          normalizedOptions.standardFontDataUrl ??
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdf.version}/standard_fonts/`,
        useSystemFonts: normalizedOptions.useSystemFonts ?? true
      });
      const doc = await documentTask.promise.catch((error: unknown) => {
        viewer.remove();
        ctx.viewport.classList.add("ofv-center");
        const fallback = isEncryptedError(error)
          ? createEncryptedFallback(ctx.file, url, {
              title: "PDF 已加密，无法在线预览",
              message: "请下载后使用密码打开，或上传解密后的 PDF 文件。",
              action: "下载 PDF"
            })
          : createPdfFallback(ctx.file.name, url, normalizePdfError(error));
        ctx.viewport.append(fallback);
        return undefined;
      });
      if (!doc) {
        return {
          destroy() {
            ctx.viewport.classList.remove("ofv-center");
            documentTask.destroy?.();
            revokeObjectUrl(url, isExternal);
          }
        };
      }

      // Fast-extract page dimensions
      const pagesMeta: Array<{ width: number; height: number }> = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        try {
          const page = await doc.getPage(pageNumber);
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
      let currentSize = ctx.size;
      let zoomFactor = 1;

      const updateSummary = () => {
        renderPdfSummary(summary, doc.numPages, pagesMeta, ctx.options.fit, zoomFactor);
        ctx.toolbar?.setZoom(zoomFactor);
      };

      // Cancel page rendering and free canvas memory
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

      // Perform actual on-demand rendering on canvas and build text layer
      const renderPage = async (pageIdx: number, size: PreviewSize) => {
        const state = pageStates[pageIdx];
        if (!state || state.rendered) return;

        state.rendered = true;

        try {
          const page = await doc.getPage(pageIdx + 1);
          const meta = pagesMeta[pageIdx];
          const scale =
            ctx.options.fit === "actual"
              ? zoomFactor
              : Math.max(0.05, Math.min(5, (getPdfAvailableWidth(size.width) / meta.width) * zoomFactor));
          
          const viewport = page.getViewport({ scale });
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

          // Build absolute-positioned selectable text layer overlay
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

            // Scale text width horizontally if specified to match visual width perfectly
            if ((item as any).width) {
              const itemWidth = (item as any).width * scale;
              const actualWidth = span.offsetWidth || span.getBoundingClientRect().width;
              if (actualWidth > 0 && Math.abs(actualWidth - itemWidth) > 1) {
                span.style.transform = `scaleX(${itemWidth / actualWidth})`;
              }
            }
          }
        } catch (err) {
          console.error(`Failed to render PDF page ${pageIdx + 1}:`, err);
          state.rendered = false;
          state.wrapper.replaceChildren(createPageStatus("ofv-pdf-error", "无法渲染该页面"));
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
                } else {
                  if (state.rendered && doc.numPages > 8) {
                    clearPage(pageIdx);
                  }
                }
              });
            },
            {
              root: scroller,
              rootMargin: "400px 0px 400px 0px"
            }
          );
        }

        for (let i = 0; i < doc.numPages; i++) {
          const meta = pagesMeta[i];
          const scale =
            ctx.options.fit === "actual"
              ? zoomFactor
              : Math.max(0.05, Math.min(5, (getPdfAvailableWidth(size.width) / meta.width) * zoomFactor));
          
          const w = Math.floor(meta.width * scale);
          const h = Math.floor(meta.height * scale);

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

        if (observer && pageStates.length > 0) {
          void renderPage(0, size);
        }
      };

      renderLayout(ctx.size);

      let resizeTimer: number | undefined;
      return {
        canCommand(command) {
          return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
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
          ctx.toolbar?.setZoom(undefined);
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

          revokeObjectUrl(url, isExternal);
          void doc.destroy();
        }
      };
    }
  };
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

function createPageStatus(className: string, text: string): HTMLDivElement {
  const status = document.createElement("div");
  status.className = className;
  status.textContent = text;
  return status;
}

function createPdfFallback(fileName: string, url: string, message: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = "PDF 预览失败";

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
  if (
    lower.includes("worker") ||
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("loading dynamically imported module")
  ) {
    return "PDF worker 加载失败。请使用 pdfjs-dist/build/pdf.worker.mjs?url 导入 workerSrc，并传给 pdfPlugin({ workerSrc })。";
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
