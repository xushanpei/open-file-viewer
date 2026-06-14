import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { assetPlugin } from "./asset";

describe("assetPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders font asset metadata and download fallback", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:font";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x54, 0x54, 0x46]).buffer,
      fileName: "brand.ttf",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-asset")));

    expect(container.textContent).toContain("字体文件预览");
    expect(container.textContent).toContain("brand.ttf");
    expect(container.textContent).toContain(".ttf");
    expect(container.textContent).toContain("OpenType");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-asset-download")?.href).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("routes extensionless SQLite MIME blobs to the asset preview", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["SQLite format 3"], { type: "application/vnd.sqlite3" }),
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-asset")));

    expect(container.textContent).toContain("数据文件预览");
    expect(container.textContent).toContain(".sqlite");
    expect(container.textContent).toContain("sqlite-wasm");

    viewer.destroy();
  });

  it("shows design file guidance for PSD files", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["8BPS"], { type: "image/vnd.adobe.photoshop" }),
      fileName: "poster.psd",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-asset")));

    expect(container.textContent).toContain("设计文件预览");
    expect(container.textContent).toContain("PSD/PSB");
    expect(container.textContent).toContain("psd.js");

    viewer.destroy();
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
