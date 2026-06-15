import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { imagePlugin } from "./image";

const heic2anyMock = vi.hoisted(() => vi.fn());

vi.mock("heic2any", () => ({
  default: heic2anyMock
}));

describe("imagePlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("responds to toolbar zoom and rotate commands", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const objectUrl = "blob:ofv-test-image";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
      fileName: "image.svg",
      toolbar: true,
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-content")));

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');

    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(zoomReset?.textContent).toBe("100%");
    expect(container.querySelector(".ofv-image-controls")).toBeNull();
    zoomIn?.click();
    await waitFor(() => zoomReset?.textContent === "125%");
    rotate?.click();
    rotate?.click();
    rotate?.click();
    rotate?.click();
    rotate?.click();

    const image = container.querySelector<HTMLImageElement>(".ofv-image-content");
    expect(image?.style.transform).toContain("scale(1.25)");
    expect(image?.style.transform).toContain("rotate(450deg)");

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("renders inline image controls only when the shared toolbar is disabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:inline-controls-image"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
      fileName: "image.svg",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-content")));

    expect(container.querySelector(".ofv-toolbar")).toBeNull();
    expect(container.querySelector(".ofv-image-controls")).not.toBeNull();

    viewer.destroy();
  });

  it("renders PNG header metadata below the image", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:png-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalPng({ width: 320, height: 180, colorType: 6 }),
      fileName: "poster.png",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-info")));

    expect(container.textContent).toContain("格式PNG");
    expect(container.textContent).toContain("尺寸320 x 180px");
    expect(container.textContent).toContain("位深8 bit");
    expect(container.textContent).toContain("Truecolor + alpha");

    viewer.destroy();
  });

  it("renders SVG and ICO structural metadata", async () => {
    const svgContainer = document.createElement("div");
    document.body.append(svgContainer);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:image-info"),
      revokeObjectURL: vi.fn()
    });

    const svgViewer = createViewer({
      container: svgContainer,
      file: new Blob(['<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg"></svg>'], { type: "image/svg+xml" }),
      fileName: "diagram.svg",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(svgContainer.querySelector(".ofv-image-info")));
    expect(svgContainer.textContent).toContain("格式SVG");
    expect(svgContainer.textContent).toContain("尺寸640 x 360px");
    expect(svgContainer.textContent).toContain("viewBox 0 0 640 360");
    svgViewer.destroy();

    const icoContainer = document.createElement("div");
    document.body.append(icoContainer);
    const icoViewer = createViewer({
      container: icoContainer,
      file: minimalIco(),
      fileName: "app.ico",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(icoContainer.querySelector(".ofv-image-info")));
    expect(icoContainer.textContent).toContain("格式ICO");
    expect(icoContainer.textContent).toContain("尺寸32 x 32px");
    expect(icoContainer.textContent).toContain("图像2");
    icoViewer.destroy();
  });

  it("counts APNG animation control chunks", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:apng-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalPng({ width: 64, height: 64, frames: 2 }),
      fileName: "anim.apng",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-info")));

    expect(container.textContent).toContain("格式APNG");
    expect(container.textContent).toContain("帧2");

    viewer.destroy();
  });

  it("renders AVIF BMFF brand and image spatial extent metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:avif-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalAvif({ width: 1024, height: 576 }),
      fileName: "frame.avif",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-info")));

    expect(container.textContent).toContain("格式AVIF");
    expect(container.textContent).toContain("尺寸1024 x 576px");
    expect(container.textContent).toContain("brand avif");
    expect(container.textContent).toContain("mif1");

    viewer.destroy();
  });

  it("converts HEIC images to a browser-displayable object URL", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const convertedBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    heic2anyMock.mockResolvedValue(convertedBlob);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => (blob === convertedBlob ? "blob:converted-heic" : "blob:raw-heic")),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["heic"], { type: "image/heic" }),
      fileName: "photo.heic",
      plugins: [imagePlugin()]
    });

    await waitFor(() => container.querySelector<HTMLImageElement>(".ofv-image-content")?.src === "blob:converted-heic");

    expect(heic2anyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        toType: "image/jpeg"
      })
    );

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:converted-heic");
  });

  it("converts extensionless HEIC blobs based on their MIME type", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const convertedBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    heic2anyMock.mockResolvedValue(convertedBlob);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => (blob === convertedBlob ? "blob:converted-heic" : "blob:raw-heic")),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["heic"], { type: "image/heic" }),
      plugins: [imagePlugin()]
    });

    await waitFor(() => container.querySelector<HTMLImageElement>(".ofv-image-content")?.src === "blob:converted-heic");

    expect(heic2anyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        toType: "image/jpeg"
      })
    );

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:converted-heic");
  });

  it.each(["image/heic-sequence", "image/heif-sequence"])("converts extensionless %s blobs", async (mimeType) => {
    const container = document.createElement("div");
    document.body.append(container);

    const convertedBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    heic2anyMock.mockResolvedValue(convertedBlob);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => (blob === convertedBlob ? "blob:converted-heic" : "blob:raw-heic")),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["heic"], { type: mimeType }),
      plugins: [imagePlugin()]
    });

    await waitFor(() => container.querySelector<HTMLImageElement>(".ofv-image-content")?.src === "blob:converted-heic");

    expect(heic2anyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        toType: "image/jpeg"
      })
    );

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:converted-heic");
  });

  it("falls back to the original HEIC object URL when conversion fails", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    heic2anyMock.mockRejectedValue(new Error("convert failed"));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:raw-heic"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["heic"], { type: "image/heic" }),
      fileName: "photo.heic",
      plugins: [imagePlugin()]
    });

    await waitFor(() => container.querySelector<HTMLImageElement>(".ofv-image-content")?.src === "blob:raw-heic");

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:raw-heic");
  });

  it("shows a download fallback when the browser cannot decode an image", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:bad-image";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["bad"], { type: "image/avif" }),
      fileName: "broken.avif",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-content")));
    container.querySelector<HTMLImageElement>(".ofv-image-content")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("图片预览失败");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("shows a download fallback when HEIC conversion and native display both fail", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    heic2anyMock.mockRejectedValue(new Error("convert failed"));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:raw-heic"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["heic"], { type: "image/heic" }),
      fileName: "photo.heic",
      plugins: [imagePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-image-content")));
    container.querySelector<HTMLImageElement>(".ofv-image-content")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("图片预览失败");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe("blob:raw-heic");

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:raw-heic");
  });
});

function minimalPng({ width, height, colorType = 2, frames = 0 }: { width: number; height: number; colorType?: number; frames?: number }): Blob {
  const chunks: number[] = [
    ...pngChunk("IHDR", [
      ...uint32Be(width),
      ...uint32Be(height),
      8,
      colorType,
      0,
      0,
      0
    ])
  ];
  for (let index = 0; index < frames; index++) {
    chunks.push(...pngChunk("fcTL", new Array(26).fill(0)));
  }
  chunks.push(...pngChunk("IEND", []));
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks])], { type: "image/png" });
}

function minimalIco(): Blob {
  const bytes = new Uint8Array(6 + 2 * 16);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 2, true);
  bytes[6] = 32;
  bytes[7] = 32;
  bytes[8] = 0;
  bytes[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, 4, true);
  view.setUint32(18, bytes.length, true);
  bytes[22] = 16;
  bytes[23] = 16;
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 4, true);
  view.setUint32(34, bytes.length + 4, true);
  return new Blob([bytes], { type: "image/x-icon" });
}

function minimalAvif({ width, height }: { width: number; height: number }): Blob {
  const ftyp = bmffBox("ftyp", [
    ...ascii("avif"),
    ...uint32Be(0),
    ...ascii("avif"),
    ...ascii("mif1")
  ]);
  const ispe = bmffBox("ispe", [
    0,
    0,
    0,
    0,
    ...uint32Be(width),
    ...uint32Be(height)
  ]);
  const ipco = bmffBox("ipco", ispe);
  const iprp = bmffBox("iprp", ipco);
  const meta = bmffBox("meta", [0, 0, 0, 0, ...iprp]);
  return new Blob([new Uint8Array([...ftyp, ...meta])], { type: "image/avif" });
}

function bmffBox(type: string, payload: number[]): number[] {
  return [...uint32Be(payload.length + 8), ...ascii(type), ...payload];
}

function pngChunk(type: string, data: number[]): number[] {
  return [...uint32Be(data.length), ...new TextEncoder().encode(type), ...data, 0, 0, 0, 0];
}

function ascii(value: string): number[] {
  return [...new TextEncoder().encode(value)];
}

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
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
