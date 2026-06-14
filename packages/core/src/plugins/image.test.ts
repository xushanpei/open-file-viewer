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

    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(container.querySelector(".ofv-image-controls")).toBeNull();
    zoomIn?.click();
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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
