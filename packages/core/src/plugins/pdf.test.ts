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

  it("renders PDF pages at a sharp backing resolution on 1x displays", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("devicePixelRatio", 1);

    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const page = pdfjs.__page;
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "image-heavy.pdf",
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    const canvas = container.querySelector<HTMLCanvasElement>("canvas.ofv-pdf-page");
    expect(canvas?.style.width).toBe("20px");
    expect(canvas?.width).toBe(40);
    expect(canvas?.height).toBe(60);
    expect(page.render).toHaveBeenCalledWith(
      expect.objectContaining({
        transform: [2, 0, 0, 2, 0, 0]
      })
    );

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

  it("lays out large PDFs before loading metadata for offscreen pages", async () => {
    let observerCallback!: IntersectionObserverCallback;
    class ControlledIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);

    let resolveThirdPage!: (page: any) => void;
    const thirdPagePromise = new Promise<any>((resolve) => {
      resolveThirdPage = resolve;
    });
    const portraitPage = createPdfPageMock();
    const landscapePage = createPdfPageMock({ rotation: 90 });
    const getPage = vi.fn((pageNumber: number) =>
      pageNumber === 3 ? thirdPagePromise : Promise.resolve(portraitPage)
    );
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({ numPages: 5, getPage, destroy: vi.fn() })
      }))
    };
    const container = createSizedContainer();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "large.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    try {
      await waitFor(() => container.querySelectorAll(".ofv-pdf-page-wrapper").length === 5);
      await waitFor(() => getPage.mock.calls.length >= 2);
      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

      expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2]);
      expect(portraitPage.render).toHaveBeenCalledTimes(2);
      const thirdWrapper = container.querySelector<HTMLElement>('[data-page-index="2"]');
      if (!thirdWrapper) {
        throw new Error("Expected the third PDF page wrapper.");
      }
      expect(thirdWrapper.querySelector(".ofv-pdf-skeleton")).not.toBeNull();
      const initialHeight = thirdWrapper.style.height;

      observerCallback(
        [{ isIntersecting: true, target: thirdWrapper } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
      await waitFor(() => getPage.mock.calls.some(([pageNumber]) => pageNumber === 3));
      expect(getPage).toHaveBeenCalledTimes(3);

      resolveThirdPage(landscapePage);
      await waitFor(() => Boolean(container.querySelector('[data-page-index="2"] canvas.ofv-pdf-page')));

      const liveThirdWrapper = container.querySelector<HTMLElement>('[data-page-index="2"]');
      if (!liveThirdWrapper) {
        throw new Error("Expected the rendered third PDF page wrapper.");
      }
      expect(liveThirdWrapper.isConnected).toBe(true);
      expect(parseCssPx(liveThirdWrapper.style.width)).toBeGreaterThan(parseCssPx(liveThirdWrapper.style.height));
      expect(liveThirdWrapper.style.height).not.toBe(initialHeight);
      expect(getPage).toHaveBeenCalledTimes(3);
    } finally {
      resolveThirdPage(landscapePage);
      viewer.destroy();
    }
  });

  it("retries a lazy page after a transient loading failure", async () => {
    let observerCallback!: IntersectionObserverCallback;
    class ControlledIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const page = createPdfPageMock();
    let thirdPageAttempts = 0;
    const getPage = vi.fn((pageNumber: number) => {
      if (pageNumber === 3 && thirdPageAttempts++ === 0) {
        return Promise.reject(new Error("Temporary range request failure"));
      }
      return Promise.resolve(page);
    });
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({ numPages: 5, getPage, destroy: vi.fn() })
      }))
    };
    const container = createSizedContainer();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "retry.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    try {
      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);
      const thirdWrapper = container.querySelector<HTMLElement>('[data-page-index="2"]');
      if (!thirdWrapper) {
        throw new Error("Expected the third PDF page wrapper.");
      }
      const entry = [{ isIntersecting: true, target: thirdWrapper } as unknown as IntersectionObserverEntry];

      observerCallback(entry, {} as IntersectionObserver);
      await waitFor(() => Boolean(thirdWrapper.querySelector(".ofv-pdf-error")));
      expect(getPage.mock.calls.filter(([pageNumber]) => pageNumber === 3)).toHaveLength(1);

      observerCallback(entry, {} as IntersectionObserver);
      await waitFor(() => Boolean(thirdWrapper.querySelector("canvas.ofv-pdf-page")));
      expect(getPage.mock.calls.filter(([pageNumber]) => pageNumber === 3)).toHaveLength(2);
    } finally {
      viewer.destroy();
    }
  });

  it("ignores a lazy page render from a replaced layout", async () => {
    const observerCallbacks: IntersectionObserverCallback[] = [];
    class ControlledIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);

    let resolveThirdPage!: (page: any) => void;
    const thirdPagePromise = new Promise<any>((resolve) => {
      resolveThirdPage = resolve;
    });
    const firstPages = createPdfPageMock();
    const thirdPage = createPdfPageMock({ rotation: 90 });
    const getPage = vi.fn((pageNumber: number) =>
      pageNumber === 3 ? thirdPagePromise : Promise.resolve(firstPages)
    );
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({ numPages: 5, getPage, destroy: vi.fn() })
      }))
    };
    const container = createSizedContainer();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "relayout.pdf",
      toolbar: true,
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    try {
      await waitFor(() => observerCallbacks.length === 1);
      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);
      const oldThirdWrapper = container.querySelector<HTMLElement>('[data-page-index="2"]');
      if (!oldThirdWrapper) {
        throw new Error("Expected the original third PDF page wrapper.");
      }
      observerCallbacks[0](
        [{ isIntersecting: true, target: oldThirdWrapper } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
      await waitFor(() => getPage.mock.calls.some(([pageNumber]) => pageNumber === 3));

      container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();
      await waitFor(() => observerCallbacks.length === 2);
      const liveThirdWrapper = container.querySelector<HTMLElement>('[data-page-index="2"]');
      if (!liveThirdWrapper) {
        throw new Error("Expected the replacement third PDF page wrapper.");
      }
      expect(liveThirdWrapper).not.toBe(oldThirdWrapper);

      resolveThirdPage(thirdPage);
      await waitFor(() => thirdPage.getViewport.mock.calls.length > 0);
      expect(thirdPage.render).not.toHaveBeenCalled();
      expect(liveThirdWrapper.querySelector(".ofv-pdf-skeleton")).not.toBeNull();
      expect(liveThirdWrapper.querySelector("canvas.ofv-pdf-page")).toBeNull();

      observerCallbacks[1](
        [{ isIntersecting: true, target: liveThirdWrapper } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
      await waitFor(() => Boolean(liveThirdWrapper.querySelector("canvas.ofv-pdf-page")));
      expect(thirdPage.render).toHaveBeenCalledTimes(1);
      expect(getPage.mock.calls.filter(([pageNumber]) => pageNumber === 3)).toHaveLength(1);
    } finally {
      resolveThirdPage(thirdPage);
      viewer.destroy();
    }
  });

  it("does not render pages that finish loading after the viewer is destroyed", async () => {
    class IdleIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);

    let resolvePage!: (page: any) => void;
    const pendingPage = new Promise<any>((resolve) => {
      resolvePage = resolve;
    });
    const page = createPdfPageMock();
    const getPage = vi.fn(() => pendingPage);
    const pdfjs = {
      version: "4.0.0-test",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve({ numPages: 2, getPage, destroy: vi.fn() })
      }))
    };
    const container = createSizedContainer();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "closed.pdf",
      plugins: [pdfPlugin({ pdfjs: pdfjs as any })]
    });

    await waitFor(() => getPage.mock.calls.length === 2);
    viewer.destroy();
    resolvePage(page);
    await waitFor(() => page.getViewport.mock.calls.length === 2);

    expect(page.render).not.toHaveBeenCalled();
    expect(container.querySelector("canvas.ofv-pdf-page")).toBeNull();
  });

  it("renders every lazy PDF page before capturing the print snapshot", async () => {
    class IdleIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,cHJpbnQ=");
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);

    const print = vi.fn();
    const printWindow = Object.assign(new EventTarget(), { focus: vi.fn(), print });
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        return printWindow;
      }
    });

    const container = createSizedContainer();
    const pdfjs = createPdfJsMock({ numPages: 10 });
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "many-pages.pdf",
      toolbar: true,
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll(".ofv-pdf-page-wrapper").length === 10);
    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);
    expect(container.querySelectorAll(".ofv-pdf-skeleton")).toHaveLength(8);

    container.querySelector<HTMLButtonElement>('button[aria-label="Print preview"]')?.click();
    await waitFor(() => print.mock.calls.length === 1);

    const printDocument = document.querySelector<HTMLIFrameElement>(".ofv-print-frame")?.contentDocument;
    expect(printDocument?.querySelectorAll(".ofv-pdf-page-wrapper")).toHaveLength(10);
    expect(printDocument?.querySelectorAll("img.ofv-pdf-page")).toHaveLength(10);
    expect(printDocument?.querySelectorAll("canvas.ofv-pdf-page")).toHaveLength(0);
    expect(printDocument?.querySelector(".ofv-pdf-skeleton")).toBeNull();
    expect(toDataURL).toHaveBeenCalledTimes(10);

    printWindow.dispatchEvent(new Event("afterprint"));
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
    expect(summary?.textContent).toContain("Pages2");
    expect(summary?.textContent).toContain("Page sizes400 x 600 (2)");
    expect(summary?.textContent).toContain("FitFit width");
    expect(summary?.textContent).toContain("Zoom100%");
    const pageInput = container.querySelector<HTMLInputElement>('.ofv-pdf-page-navigator input');
    const nextPage = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(pageInput?.value).toBe("1");
    expect(pageInput?.max).toBe("2");
    expect(container.querySelector(".ofv-pdf-page-navigator")?.textContent).toContain("/ 2");
    expect(viewer.goToPage(2)).toBe(true);
    expect(pageInput?.value).toBe("2");
    expect(nextPage?.disabled).toBe(true);
    const firstWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(zoomReset?.textContent).toBe("100%");

    zoomIn?.click();

    await waitFor(() => container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper") !== firstWrapper);

    expect(container.querySelector(".ofv-pdf-summary")?.textContent).toContain("Zoom115%");
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

  it("allows overriding PDF CMap, standard font, and WASM resources", async () => {
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
          wasmUrl: "/assets/pdf-wasm/",
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
        wasmUrl: "/assets/pdf-wasm/",
        useSystemFonts: false
      })
    );

    viewer.destroy();
  });

  it("uses the legacy worker and polyfills Promise.withResolvers in older browser engines", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const promiseConstructor = Promise as PromiseConstructor & { withResolvers?: unknown };
    const originalDescriptor = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
    Reflect.deleteProperty(promiseConstructor, "withResolvers");

    try {
      const container = createSizedContainer();
      const pdfjs = createPdfJsMock();
      const viewer = createViewer({
        container,
        file: new Blob(["pdf"], { type: "application/pdf" }),
        fileName: "360-browser.pdf",
        plugins: [pdfPlugin({ pdfjs })]
      });

      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

      expect(typeof promiseConstructor.withResolvers).toBe("function");
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("/legacy/build/pdf.worker.mjs");
      viewer.destroy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Promise, "withResolvers", originalDescriptor);
      } else {
        Reflect.deleteProperty(promiseConstructor, "withResolvers");
      }
    }
  });

  it("selects a separately bundled legacy worker in mobile WebKit engines", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const promiseConstructor = Promise as PromiseConstructor & { withResolvers?: unknown };
    const originalDescriptor = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
    if (typeof promiseConstructor.withResolvers !== "function") {
      Object.defineProperty(promiseConstructor, "withResolvers", {
        configurable: true,
        writable: true,
        value: () => ({ promise: Promise.resolve(), resolve: vi.fn(), reject: vi.fn() })
      });
    }
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
    );

    try {
      const container = createSizedContainer();
      const pdfjs = createPdfJsMock();
      const viewer = createViewer({
        container,
        file: new Blob(["pdf"], { type: "application/pdf" }),
        fileName: "mobile-webkit.pdf",
        plugins: [
          pdfPlugin({
            pdfjs,
            workerSrc: "/assets/pdf.worker.mjs",
            legacyWorkerSrc: "/assets/pdf.worker.legacy.mjs"
          })
        ]
      });

      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

      expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.legacy.mjs");
      viewer.destroy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Promise, "withResolvers", originalDescriptor);
      } else {
        Reflect.deleteProperty(promiseConstructor, "withResolvers");
      }
    }
  });

  it("keeps the modern worker when the required browser APIs are available", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const promiseConstructor = Promise as PromiseConstructor & { withResolvers?: unknown };
    const originalDescriptor = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
    if (typeof promiseConstructor.withResolvers !== "function") {
      Object.defineProperty(promiseConstructor, "withResolvers", {
        configurable: true,
        writable: true,
        value: () => ({ promise: Promise.resolve(), resolve: vi.fn(), reject: vi.fn() })
      });
    }
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
    );

    try {
      const container = createSizedContainer();
      const pdfjs = createPdfJsMock();
      const viewer = createViewer({
        container,
        file: new Blob(["pdf"], { type: "application/pdf" }),
        fileName: "modern-chromium.pdf",
        plugins: [
          pdfPlugin({
            pdfjs,
            workerSrc: "/assets/pdf.worker.mjs",
            legacyWorkerSrc: "/assets/pdf.worker.legacy.mjs"
          })
        ]
      });

      await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

      expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.mjs");
      viewer.destroy();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Promise, "withResolvers", originalDescriptor);
      } else {
        Reflect.deleteProperty(promiseConstructor, "withResolvers");
      }
    }
  });

  it("allows forcing the modern PDF worker", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "modern.pdf",
      plugins: [pdfPlugin({ pdfjs, compatibilityMode: "modern" })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("/build/pdf.worker.mjs");
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toContain("/legacy/build/");
    viewer.destroy();
  });

  it("selects the legacy worker for 360 browser user agents", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36 360SE"
    );
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "360-user-agent.pdf",
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    expect(pdfjs.GlobalWorkerOptions.workerSrc).toContain("/legacy/build/pdf.worker.mjs");
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

    expect(container.textContent).toContain("PDF preview failed");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe("http://localhost:3000/missing.pdf");
    expect(container.querySelector(".ofv-pdf-web-fallback-frame")).toBeNull();

    viewer.destroy();
  });

  it("uses localized and custom PDF messages", async () => {
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    pdfjs.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("Invalid PDF structure")),
      destroy: vi.fn()
    }));

    const viewer = createViewer({
      container,
      file: new Blob(["broken"], { type: "application/pdf" }),
      fileName: "broken.pdf",
      locale: "zh-CN",
      messages: {
        pdfPreviewFailedTitle: "无法打开报表",
        pdfDownload: "保存报表"
      },
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("无法打开报表");
    expect(container.textContent).toContain("该 PDF 文件可能已损坏或格式无效");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.textContent).toBe("保存报表");

    viewer.destroy();
  });

  it("offers a cross-browser HTML preview iframe when a remote PDF URL cannot be parsed", async () => {
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    pdfjs.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("Invalid PDF structure")),
      destroy: vi.fn()
    }));

    const viewer = createViewer({
      container,
      file: "https://pdf-host.invalid/report.pdf",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-pdf-web-fallback-frame")));

    const iframe = container.querySelector<HTMLIFrameElement>(".ofv-pdf-web-fallback-frame");

    expect(container.querySelector(".ofv-fallback")).toBeNull();
    expect(container.textContent).not.toContain("PDF 预览失败");
    expect(container.textContent).not.toContain("作为 HTML 预览");
    expect(iframe?.src).toBe("https://pdf-host.invalid/report.pdf");
    expect(iframe?.hasAttribute("referrerpolicy")).toBe(false);
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");

    viewer.destroy();
  });

  it.each([
    { name: "blocks scripts for same-origin URLs in auto mode", origin: "same", policy: undefined, expected: false },
    { name: "can block scripts for cross-origin URLs", origin: "cross", policy: "never" as const, expected: false },
    { name: "can allow scripts for trusted same-origin URLs", origin: "same", policy: "always" as const, expected: true }
  ])("$name", async ({ origin, policy, expected }) => {
    const container = createSizedContainer();
    const pdfjs = createPdfJsMock();
    pdfjs.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("Invalid PDF structure")),
      destroy: vi.fn()
    }));
    const fileUrl = origin === "same" ? `${window.location.origin}/report.pdf` : "https://pdf-host.invalid/report.pdf";

    const viewer = createViewer({
      container,
      file: fileUrl,
      fileName: "report.pdf",
      mimeType: "application/pdf",
      plugins: [pdfPlugin({ pdfjs, webFallbackScripts: policy })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-pdf-web-fallback-frame")));

    const sandbox = container.querySelector<HTMLIFrameElement>(".ofv-pdf-web-fallback-frame")?.getAttribute("sandbox");
    expect(sandbox?.includes("allow-scripts")).toBe(expected);

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

  it("contains PDF pages within both viewport dimensions instead of enlarging them to width", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer({ width: 920, height: 620 });
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "small-page.pdf",
      width: "920px",
      height: "620px",
      fit: "contain",
      plugins: [pdfPlugin({ pdfjs })]
    });
    mockViewportSize(container, 920, 620);
    await viewer.reload();

    await waitFor(() => Boolean(container.querySelector("canvas.ofv-pdf-page")));

    const wrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(wrapper?.style.width).toBe("392px");
    expect(wrapper?.style.height).toBe("588px");

    viewer.destroy();
  });

  it("fits direct PDF previews to width when fit is omitted", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer({ width: 920, height: 620 });
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "default-fit.pdf",
      width: "920px",
      height: "620px",
      plugins: [pdfPlugin({ pdfjs })]
    });
    mockViewportSize(container, 920, 620);
    await viewer.reload();

    await waitFor(() => Boolean(container.querySelector("canvas.ofv-pdf-page")));

    const wrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(wrapper?.style.width).toBe("888px");
    expect(wrapper?.style.height).toBe("1332px");

    viewer.destroy();
  });

  it("does not upscale PDF pages in scale-down mode", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer({ width: 920, height: 920 });
    const pdfjs = createPdfJsMock();

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "scale-down.pdf",
      width: "920px",
      height: "920px",
      fit: "scale-down",
      plugins: [pdfPlugin({ pdfjs })]
    });
    mockViewportSize(container, 920, 920);
    await viewer.reload();

    await waitFor(() => Boolean(container.querySelector("canvas.ofv-pdf-page")));

    const wrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(wrapper?.style.width).toBe("400px");
    expect(wrapper?.style.height).toBe("600px");

    viewer.destroy();
  });

  it("preserves intrinsic PDF page rotation while rendering", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const page = createPdfPageMock({ rotation: 90 });
    const pdfjs = createPdfJsMock({ page });

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "rotated-source.pdf",
      toolbar: true,
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => container.querySelectorAll("canvas.ofv-pdf-page").length === 2);

    const firstWrapper = container.querySelector<HTMLElement>(".ofv-pdf-page-wrapper");
    expect(parseCssPx(firstWrapper?.style.width)).toBeGreaterThan(parseCssPx(firstWrapper?.style.height));
    expect(page.render).toHaveBeenCalledWith(
      expect.objectContaining({
        viewport: expect.objectContaining({ rotation: 90 })
      })
    );

    container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')?.click();
    await waitFor(() => page.getViewport.mock.calls.some(([args]: any[]) => args?.rotation === 180));

    viewer.destroy();
  });

  it("keeps PDF text layer glyph metrics stable while zooming", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const container = createSizedContainer();
    const page = createPdfPageMock({
      textItems: [
        {
          str: "Zoom text",
          transform: [12, 0, 0, 12, 24, 120],
          width: 54,
          fontName: "Helvetica"
        }
      ]
    });
    const pdfjs = createPdfJsMock({ page });

    const viewer = createViewer({
      container,
      file: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "text-zoom.pdf",
      fit: "actual",
      toolbar: true,
      plugins: [pdfPlugin({ pdfjs })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-pdf-text-layer span")));

    const firstSpan = container.querySelector<HTMLElement>(".ofv-pdf-text-layer span");
    const firstFontSize = parseCssPx(firstSpan?.style.fontSize);
    expect(firstSpan?.style.lineHeight).toBe("1");
    expect(parseCssPx(firstSpan?.style.height)).toBeCloseTo(firstFontSize, 4);
    expect(firstSpan?.style.transform).not.toContain("scaleY");

    container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();

    await waitFor(() => {
      const span = container.querySelector<HTMLElement>(".ofv-pdf-text-layer span");
      return Boolean(span && span !== firstSpan);
    });

    const zoomedSpan = container.querySelector<HTMLElement>(".ofv-pdf-text-layer span");
    const zoomedFontSize = parseCssPx(zoomedSpan?.style.fontSize);
    expect(zoomedFontSize).toBeGreaterThan(firstFontSize);
    expect(zoomedSpan?.style.lineHeight).toBe("1");
    expect(parseCssPx(zoomedSpan?.style.height)).toBeCloseTo(zoomedFontSize, 4);
    expect(zoomedSpan?.style.transform).not.toContain("scaleY");

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

    expect(container.querySelector(".ofv-pdf-empty")?.textContent).toContain("No displayable PDF-compatible content");
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
    expect(container.textContent).toContain("This PDF is encrypted and cannot be previewed online");
    expect(container.textContent).toContain("upload a decrypted PDF file");
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
    expect(container.querySelector(".ofv-pdf-error")?.textContent).toContain("This page could not be rendered");
    expect(container.querySelector(".ofv-pdf-error")?.textContent).toContain("graphics, fonts, or compression features");
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

function createPdfJsMock(options: { page?: any; numPages?: number } = {}): any {
  const page = options.page || createPdfPageMock();

  return {
    __page: page,
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: options.numPages ?? 2,
        getPage: vi.fn(() => Promise.resolve(page)),
        destroy: vi.fn()
      })
    }))
  };
}

function createPdfPageMock(options: { rotation?: number; textItems?: any[] } = {}): any {
  const intrinsicRotation = options.rotation ?? 0;
  return {
    rotate: intrinsicRotation,
    getViewport: vi.fn(({ scale, rotation = intrinsicRotation }: { scale: number; rotation?: number }) => {
      const sideways = rotation === 90 || rotation === 270;
      return {
        width: (sideways ? 600 : 400) * scale,
        height: (sideways ? 400 : 600) * scale,
        rotation,
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
      return Promise.resolve({ items: options.textItems || [] });
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
