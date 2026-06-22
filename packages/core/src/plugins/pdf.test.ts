import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { pdfPlugin } from "./pdf";

describe("pdfPlugin", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders pages without IntersectionObserver support", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("devicePixelRatio", 2);

    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const page = pdfjs.__page;
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "legacy.pdf",
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    const canvas = container.querySelector<HTMLCanvasElement>("canvas.ofv-pdf-page");
    expect(canvas?.style.width).toBe("20px");
    expect(canvas?.style.height).toBe("30px");
    expect(canvas?.width).toBe(Number.parseInt(canvas?.style.width || "0", 10) * 2);
    expect(canvas?.height).toBe(Number.parseInt(canvas?.style.height || "0", 10) * 2);
    expect(page.render).toHaveBeenCalledWith(
      expect.objectContaining({
        transform: [2, 0, 0, 2, 0, 0]
      })
    );
    expect(container.querySelector(".ofv-pdf-skeleton")).toBeNull();

    viewer.destroy();
  });

  it("eagerly renders first pages when IntersectionObserver does not fire", async () => {
    class IdleIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);

    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "embedded.pdf",
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(container.querySelector(".ofv-pdf-skeleton")).toBeNull();

    viewer.destroy();
  });

  it("lays out PDF pages and responds to zoom commands", async () => {
    const container = createSizedContainer();
    const objectUrl = "blob:ofv-pdf";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const pdfjs = createPdfJsMock();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "sample.pdf",
      toolbar: true,
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll(".ofv-pdf-page-wrapper").length === 2);

    const summary = container.querySelector(".ofv-pdf-summary");
    expect((summary as HTMLElement | null)?.hidden).toBe(true);
    expect(summary?.textContent).toContain("页数2");
    expect(summary?.textContent).toContain("页面尺寸400 x 600 (2)");
    expect(summary?.textContent).toContain("适配适合宽度");
    expect(summary?.textContent).toContain("缩放100%");
    const firstWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(zoomReset?.textContent).toBe("100%");

    zoomIn?.click();

    await waitFor(() => container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper") !== firstWrapper);

    expect(container.querySelector(".ofv-pdf-summary")?.textContent).toContain("缩放115%");
    expect(zoomReset?.textContent).toBe("115%");
    expect(container.querySelectorAll(".ofv-pdf-page-wrapper")).toHaveLength(2);
    const zoomedWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    const zoomedWidth = parseCssPx(zoomedWrapper?.style.width);
    const zoomedHeight = parseCssPx(zoomedWrapper?.style.height);
    expect(zoomedHeight).toBeGreaterThan(zoomedWidth);

    rotate?.click();
    await waitFor(() => container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper") !== zoomedWrapper);
    const rotatedWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(parseCssPx(rotatedWrapper?.style.width)).toBeGreaterThan(parseCssPx(rotatedWrapper?.style.height));
    await waitFor(() => pdfjs.__page.getViewport.mock.calls.some(([args]: any[]) => args?.rotation === 90));

    zoomReset?.click();
    await waitFor(() => container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper") !== rotatedWrapper);
    const resetWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(parseCssPx(resetWrapper?.style.height)).toBeGreaterThan(parseCssPx(resetWrapper?.style.width));
    expect(zoomReset?.textContent).toBe("100%");
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("pdf.worker.mjs");
    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cMapPacked: true,
        cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.0-test/cmaps/",
        standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.0-test/standard_fonts/",
        useSystemFonts: true,
        url: objectUrl
      })
    );

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("allows overriding PDF CMap and standard font resources", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "cjk.pdf",
      plugins: [
        pdfPlugin({
          pdfjs,
          cMapUrl: "/assets/pdf-cmaps/",
          cMapPacked: false,
          standardFontDataUrl: "/assets/pdf-fonts/",
          useSystemFonts: false
        })
      ]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cMapPacked: false,
        cMapUrl: "/assets/pdf-cmaps/",
        standardFontDataUrl: "/assets/pdf-fonts/",
        useSystemFonts: false
      })
    );

    viewer.destroy();
  });

  it("forwards pdf.js loading options", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "streaming.pdf",
      plugins: [
        pdfPlugin({
          pdfjs,
          disableStream: true,
          disableAutoFetch: true,
          disableRange: true,
          rangeChunkSize: 131072
        })
      ]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        disableAutoFetch: true,
        disableRange: true,
        disableStream: true,
        rangeChunkSize: 131072
      })
    );

    viewer.destroy();
  });

  it("can load PDF bytes in the main thread before passing them to pdf.js", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([37, 80, 68, 70]).buffer)
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const viewer = createViewer({
      container,
      file: "/dummy.pdf",
      fileName: "dummy.pdf",
      mimeType: "application/pdf",
      plugins: [pdfPlugin({ pdfjs, useFetchData: true })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(fetchMock).toHaveBeenCalledWith("/dummy.pdf");
    expect(pdfjs.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(Uint8Array)
      })
    );
    expect(pdfjs.getDocument).toHaveBeenCalledWith(expect.not.objectContaining({ url: expect.anything() }));

    viewer.destroy();
  });

  it("shows the PDF fallback when useFetchData cannot fetch the file", async () => {
    const container = createSizedContainer();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
        arrayBuffer: vi.fn()
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const viewer = createViewer({
      container,
      file: "/missing.pdf",
      fileName: "missing.pdf",
      mimeType: "application/pdf",
      plugins: [pdfPlugin({ pdfjs: createPdfJsMock(), useFetchData: true })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("PDF 预览失败");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe("http://localhost:3000/missing.pdf");

    viewer.destroy();
  });

  it("fits rendered PDF pages inside narrow preview containers", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer({ width: 120, height: 260 });
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "narrow.pdf",
      width: "120px",
      height: "260px",
      plugins: [pdfPlugin({ pdfjs })]
    });
    mockViewportSize(container, 120, 260);
    await viewer.reload();

    await waitFor(() => Boolean(container.querySelector("canvas.ofv-pdf-page")));

    const wrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    const canvas = container.querySelector<HTMLCanvasElement>("canvas.ofv-pdf-page");
    expect(wrapper?.style.width).toBe("104px");
    expect(canvas?.style.width).toBe("104px");

    viewer.destroy();
  });

  it("shows a page hint when a PDF-compatible page renders visually blank", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const context = {
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([255, 255, 255, 255])
      }))
    } as unknown as CanvasRenderingContext2D;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context);

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "blank-ai.pdf",
      plugins: [pdfPlugin({ pdfjs: createPdfJsMock() })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-pdf-empty")));

    expect(container.querySelector(".ofv-pdf-empty")?.textContent).toContain("没有检测到可显示的 PDF 兼容内容");
    expect(container.querySelector(".ofv-pdf-empty")?.textContent).toContain("Illustrator/AI");

    viewer.destroy();
  });

  it("shows a local fallback when the PDF document cannot be loaded", async () => {
    const container = createSizedContainer();
    const objectUrl = "blob:ofv-bad-pdf";
    const onError = vi.fn();
    const destroyTask = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.reject(Object.assign(new Error("Password required"), { name: "PasswordException" })),
        destroy: destroyTask
      }))
    };

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "locked.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.querySelector(".ofv-encrypted")).not.toBeNull();
    expect(container.textContent).toContain("PDF 已加密，无法在线预览");
    expect(container.textContent).toContain("上传解密后的 PDF 文件");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);
    expect(onError).not.toHaveBeenCalled();

    viewer.destroy();
    expect(destroyTask).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("keeps laying out a PDF when page metadata probing fails", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const page = createPdfPageMock();
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 2,
          getPage: vi.fn((pageNumber: number) =>
            pageNumber === 1 ? Promise.reject(new Error("metadata failed")) : Promise.resolve(page)
          ),
          destroy: vi.fn()
        })
      }))
    };

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "partial.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    await waitFor(() => container.querySelectorAll(".ofv-pdf-page-wrapper").length === 2);
    await waitFor(() => Boolean(container.querySelector(".ofv-pdf-error")));

    expect(container.querySelectorAll(".ofv-pdf-page-wrapper")).toHaveLength(2);
    expect(container.querySelector(".ofv-pdf-error")?.textContent).toContain("无法渲染该页面");
    expect(container.querySelector(".ofv-pdf-error")?.textContent).toContain("图形、字体或压缩特性");
    expect(container.querySelector(".ofv-pdf-error")?.textContent).not.toContain("Illustrator/PostScript");

    viewer.destroy();
  });

  it("does not throw when a pdf.js document exposes a non-callable destroy property", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const page = createPdfPageMock();
    const cleanup = vi.fn();
    const taskDestroy = vi.fn();
    const pdfjs = {
      version: "6.0.227-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn(() => Promise.resolve(page)),
          destroy: undefined,
          cleanup
        }),
        destroy: taskDestroy
      }))
    };

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "pdfjs-6.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 1);

    expect(() => viewer.destroy()).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(taskDestroy).toHaveBeenCalledTimes(1);
  });

  it("keeps multi-file navigation working after leaving a PDF preview", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const page = createPdfPageMock();
    const cleanup = vi.fn();
    const taskDestroy = vi.fn();
    const pdfjs = {
      version: "6.0.227-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn(() => Promise.resolve(page)),
          destroy: undefined,
          cleanup
        }),
        destroy: taskDestroy
      }))
    };

    const viewer = createViewer({
      container,
      files: [
        { file: new Blob(["pdf"], { type: "application/pdf" }), fileName: "first.pdf" },
        { file: new Blob(["next"], { type: "text/plain" }), fileName: "next.txt" }
      ],
      toolbar: true,
      plugins: [
        pdfPlugin({ pdfjs: pdfjs as any }),
        {
          name: "txt-fixture",
          match: (file) => file.extension === "txt",
          render(ctx) {
            ctx.viewport.textContent = `txt:${ctx.file.name}`;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 1);

    await expect(viewer.next()).resolves.toBeUndefined();
    await waitFor(() => container.textContent?.includes("txt:next.txt") === true);

    expect(viewer.getCurrentIndex()).toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(taskDestroy).toHaveBeenCalledTimes(1);

    viewer.destroy();
  });
});

function createPdfJsMock(): any {
  const page = createPdfPageMock();

  return {
    __page: page,
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(() => Promise.resolve(page)),
        destroy: vi.fn()
      })
    }))
  };
}

function createPdfPageMock(): any {
  return {
    getViewport: vi.fn(({ scale, rotation = 0 }: { scale: number; rotation?: number }) => {
      const sideways = rotation === 90 || rotation === 270;
      return {
        width: (sideways ? 600 : 400) * scale,
        height: (sideways ? 400 : 600) * scale,
        transform: [scale, 0, 0, scale, 0, 0]
      };
    }),
    render: vi.fn(() => {
      return {
        promise: Promise.resolve(),
        cancel: vi.fn()
      };
    }),
    getTextContent() {
      return Promise.resolve({ items: [] });
    }
  };
}

function createSizedContainer(size = { width: 800, height: 600 }): HTMLDivElement {
  const container = document.createElement("div");
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
    width: size.width,
    height: size.height,
    toJSON: () => ({})
  } as DOMRect);
  document.body.append(container);
  return container;
}

function mockViewportSize(container: HTMLElement, width: number, height: number): void {
  const viewport = container.querySelector<HTMLElement>(".ofv-viewport");
  if (!viewport) {
    throw new Error("Expected viewer viewport to exist.");
  }
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect);
}

function parseCssPx(value: string | undefined): number {
  return Number.parseFloat(value || "0");
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
